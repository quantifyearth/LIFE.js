/** Access LIFE data through typed arrays, plain metadata, and GeoJSON. */

import { Catalogue, type Release } from "./catalogue.js";
import { bbox, type Window as GridWindow } from "./grid.js";
import { geometryBounds, mask, polygons, type Region } from "./geometry.js";
import { DEFAULT_CATALOGUE, DEFAULT_STORE, LifeStore, type Attrs, type BandStatistics,
  type FloatData, type Info, type Kind, type OpenOptions as StoreOptions, type StoreLike } from "./store.js";

/** Geographic bounds in west, south, east, north order, in WGS84 degrees. */
export type Bounds = readonly [west: number, south: number, east: number, north: number];
/** A half-open pixel window in column start, row start, column stop, row stop order. */
export type Window = readonly [col0: number, row0: number, col1: number, row1: number];
/** A point in longitude, latitude order, in WGS84 degrees. */
export type Point = readonly [longitude: number, latitude: number];
/** Affine coefficients [a, b, c, d, e, f]: x = a*column + b*row + c; y = d*column + e*row + f. */
export type Transform = readonly [a: number, b: number, c: number, d: number, e: number, f: number];

/** Pixel dimensions and placement in EPSG:4326. Bounds describe the actual pixel edges. */
export interface GridMetadata {
  readonly width: number;
  readonly height: number;
  readonly resolution: number;
  readonly bounds: Bounds;
  readonly transform: Transform;
  readonly crs: "EPSG:4326";
}

/** One available resolution, addressed by its reduction factor. */
export interface LevelMetadata extends GridMetadata {
  readonly factor: number;
  readonly resamplingMethod?: string;
}

/** Dataset descriptions and available layers, read from the store's attributes. */
export interface Metadata extends Info, GridMetadata {
  readonly source: string;
  readonly scenarios: Readonly<Record<string, string>>;
  readonly curves: Readonly<Record<string, string>>;
  readonly taxa: Readonly<Record<string, string>>;
  readonly dataModel: Readonly<Record<string, string>>;
  readonly levels: readonly LevelMetadata[];
  readonly layers: readonly string[];
  /** Original root attributes, including the citation, data terms, and Zarr conventions. */
  readonly attributes: Attrs;
}

/** A layer's meaning, units, band labels, and stored summary statistics. */
export interface LayerMetadata {
  readonly name: string;
  readonly kind: Kind;
  readonly scenario: string;
  readonly curve: string | null;
  readonly bands: readonly string[];
  readonly units: string;
  readonly longName: string;
  readonly description: string;
  readonly scenarioDescription: string;
  readonly curveDescription: string;
  readonly fillValue: number;
  readonly statistics: Readonly<Record<string, BandStatistics>>;
  readonly attributes: Attrs;
}

/** Plain raster values in band, row, column order; one band uses data[row * width + column]. */
export interface Raster extends GridMetadata {
  readonly data: FloatData;
  readonly bands: readonly string[];
  readonly layer: string;
  readonly level: number;
  readonly kind: Kind;
  readonly units: string;
  readonly description: string;
  readonly source: string;
  readonly version: string;
  readonly citation?: string;
  readonly termsOfUse?: string;
  /** NaN for scores; null for areas, whose zero values are valid. */
  readonly nodata: number | null;
  /** One byte per value, in the same order as data: 1 is valid, 0 is masked. Data remain unchanged. */
  readonly valid?: Uint8Array;
}

/** Options shared by regional reads. */
export interface Selection {
  /** Taxon name; null reads every score band. Area layers ignore this option. Default "all". */
  readonly taxon?: string | null;
  /** Resolution factor; 1 is native resolution. Use overviews for display, not totals. */
  readonly level?: number;
  readonly signal?: AbortSignal;
  /** Include a validity mask for non-finite values. Geometry reads always include one. */
  readonly masked?: boolean;
}

/** Give exactly one region. Bounds and geometries cannot wrap across the antimeridian. */
export type ReadOptions = Selection & (
  { readonly bounds: Bounds; readonly window?: never; readonly geometry?: never } |
  { readonly window: Window; readonly bounds?: never; readonly geometry?: never } |
  { readonly geometry: Region; readonly bounds?: never; readonly window?: never }
);

/** Options for longitude-latitude point samples. */
export interface SampleOptions {
  readonly taxon?: string;
  readonly level?: number;
  readonly signal?: AbortSignal;
}

/** Select a catalogue release or configure URL requests when opening a client. */
export interface OpenOptions extends StoreOptions {
  readonly version?: string;
  readonly catalogue?: string;
}

/** A catalogue release with a flag identifying the manifest's latest release. */
export interface Version extends Release { readonly latest: boolean }

/** A reusable LIFE reader. Requests return standard typed arrays and plain objects. */
export interface Client {
  readonly metadata: Metadata;
  /** Read layer descriptions without reading pixels. */
  layerMetadata(name: string, options?: { signal?: AbortSignal }): Promise<LayerMetadata>;
  /** Read one bounded region. Geometry reads include polygon holes and use pixel centres, including boundaries. */
  read(name: string, options: ReadOptions): Promise<Raster>;
  /** Sample longitude-latitude pairs. Longitudes wrap; latitudes outside the grid return NaN. */
  sample(name: string, points: readonly Point[], options?: SampleOptions): Promise<FloatData>;
  /** Return an uncompressed GeoTIFF ArrayBuffer with values, placement, citation, and data terms. Limited to 16 million values. */
  download(name: string, options: ReadOptions): Promise<ArrayBuffer>;
}

function placement(grid: LifeStore["grid"]): GridMetadata {
  return { width: grid.width, height: grid.height, resolution: grid.res,
    bounds: [grid.bounds.west, grid.bounds.south, grid.bounds.east, grid.bounds.north],
    transform: [grid.res, 0, grid.lon0, 0, -grid.res, grid.lat0], crs: "EPSG:4326" };
}

function region(store: LifeStore, options: ReadOptions) {
  if (!options || [options.bounds, options.window, options.geometry].filter((x) => x !== undefined).length !== 1) {
    throw new TypeError("give exactly one of bounds, window, or geometry");
  }
  const level = options.level ?? 1;
  const grid = store.level(level).grid;
  const shapes = options.geometry === undefined ? undefined : polygons(options.geometry);
  const bounds = shapes ? geometryBounds(shapes) : options.bounds;
  let window: GridWindow;
  if (bounds) {
    if (bounds.length !== 4) throw new RangeError("bounds must contain west, south, east, north");
    window = grid.window(bbox(...bounds));
  } else {
    const input = options.window!;
    if (input.length !== 4 || !input.every(Number.isInteger) || input[0] >= input[2] || input[1] >= input[3]) {
      throw new RangeError("window must contain integer column start, row start, column stop, row stop");
    }
    window = { col0: Math.max(0, input[0]), row0: Math.max(0, input[1]),
      col1: Math.min(grid.width, input[2]), row1: Math.min(grid.height, input[3]) };
    if (window.col0 >= window.col1 || window.row0 >= window.row1) throw new RangeError("window does not overlap the store grid");
  }
  return { level, window, shapes };
}

/** Open the published v1.01 store, a URL, or a zarrita-readable store. Select a named release with options.version and no source. */
export async function open(source?: string | StoreLike, options: OpenOptions = {}): Promise<Client> {
  options.signal?.throwIfAborted();
  if (source !== undefined && options.version !== undefined) throw new TypeError("give source or version, not both");
  if (options.version !== undefined) {
    source = (await new Catalogue(options.catalogue ?? DEFAULT_CATALOGUE, {
      fetchJson: async (url) => {
        const response = await (options.fetch ?? fetch)(new Request(url, options.signal ? { signal: options.signal } : {}));
        if (!response.ok) throw new Error(`${url}: ${response.status}`);
        return response.json();
      },
    }).release(options.version)).url;
  }
  const store = await LifeStore.open(source ?? DEFAULT_STORE, options);
  const metadata: Metadata = { ...store.info, ...placement(store.grid), source: store.source,
    scenarios: store.scenarios, curves: store.curves, taxa: store.taxa, dataModel: store.dataModel,
    levels: store.levels.map((factor) => {
      const level = store.level(factor);
      return { factor, ...placement(level.grid), ...(level.resamplingMethod && { resamplingMethod: level.resamplingMethod }) };
    }), layers: store.layerNames(), attributes: store.attrs };
  const client: Client = {
    metadata,
    async layerMetadata(name, opts = {}) {
      const layer = await store.get(name, opts.signal);
      return { name: layer.name, kind: layer.kind, scenario: layer.scenario, curve: layer.curve,
        bands: layer.bands, units: layer.units, longName: layer.longName, description: layer.description,
        scenarioDescription: layer.scenarioDescription, curveDescription: layer.curveDescription,
        fillValue: layer.fillValue, statistics: layer.statistics, attributes: layer.attrs };
    },
    async read(name, opts) {
      opts?.signal?.throwIfAborted();
      const { level, window, shapes } = region(store, opts);
      const layer = await store.get(name, opts.signal);
      const result = await layer.read({ window, level, ...(opts.taxon !== undefined && { taxon: opts.taxon }),
        ...(opts.signal && { signal: opts.signal }) });
      opts.signal?.throwIfAborted();
      const raster: Raster = { ...placement(result.grid), data: result.data, bands: result.bands,
        layer: name, level, kind: layer.kind, units: layer.units, description: layer.description,
        source: metadata.source, version: metadata.version, nodata: layer.kind === "score" ? NaN : null,
        ...(metadata.citation && { citation: metadata.citation }), ...(metadata.termsOfUse && { termsOfUse: metadata.termsOfUse }) };
      return shapes || opts.masked ? { ...raster, valid: mask(raster, shapes, opts.signal) } : raster;
    },
    async sample(name, points, opts = {}) {
      opts.signal?.throwIfAborted();
      if (!points.every((xy) => xy.length === 2 && xy.every(Number.isFinite))) {
        throw new RangeError("points must be finite longitude, latitude pairs");
      }
      const layer = await store.get(name, opts.signal);
      const values = await layer.sample(points.map(([lon, lat]) => [lat, lon]), opts.taxon ?? "all", opts.level ?? 1, opts.signal);
      opts.signal?.throwIfAborted();
      return values;
    },
    async download(name, opts) {
      opts?.signal?.throwIfAborted();
      const { window } = region(store, opts);
      const layer = await store.get(name, opts.signal);
      const bands = opts.taxon === null && layer.kind === "score" ? layer.bands.length : 1;
      if ((window.row1 - window.row0) * (window.col1 - window.col0) * bands > 16_000_000) {
        throw new RangeError("the region is too large for one download; select a smaller region");
      }
      const raster = await client.read(name, opts);
      const { toGeoTIFF } = await import("./geotiff.js");
      return toGeoTIFF(raster, opts.signal ? { signal: opts.signal } : {});
    },
  };
  return client;
}

/** List catalogue releases as plain objects in version order. Requests accept an AbortSignal and custom fetch handler. */
export async function versions(catalogue = DEFAULT_CATALOGUE, options: Pick<OpenOptions, "signal" | "fetch"> = {}): Promise<Version[]> {
  options.signal?.throwIfAborted();
  const cat = new Catalogue(catalogue, { fetchJson: async (url) => {
    const response = await (options.fetch ?? fetch)(new Request(url, options.signal ? { signal: options.signal } : {}));
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return response.json();
  } });
  const releases = await cat.releases();
  if (!releases.length) return [];
  const latest = (await cat.latest()).version;
  return releases.map((release) => ({ ...release, latest: release.version === latest }));
}
