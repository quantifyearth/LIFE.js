/**
 * Show a layer on a MapLibre GL map.
 *
 * A {@link LifeProtocol} registers a custom `life://` tile protocol with
 * MapLibre and paints each requested tile with {@link paintTile}. A
 * {@link LifeMapLayer} adds a raster source and layer for one tile spec to a
 * map, and can swap the spec, change its opacity, or remove itself. Neither
 * imports maplibre-gl: pass the `maplibregl` module and the map in.
 */

import type { Blend, Scale } from "./colour.js";
import type { Client } from "./client.js";
import { paintTile, type Image } from "./tiles.js";

/** What to draw: one band through a scale, or every class through a blend. */
export interface TileSpec {
  readonly client: Client;
  /** Array name in the opened store. */
  readonly layer: string;
  /** Band to paint with `scale`. Default `"all"`. Ignored with `blend`. */
  readonly taxon?: string;
  readonly scale?: Scale;
  readonly blend?: Blend;
  /** Leave exact zeros transparent when painting with a scale. Default true. */
  readonly hideZeros?: boolean;
  /** Tile edge in pixels. Default 256. */
  readonly tileSize?: number;
}

/** A MapLibre raster source specification for a registered tile spec. */
export interface RasterSourceSpec {
  readonly type: "raster";
  readonly tiles: string[];
  readonly tileSize: number;
  readonly minzoom: number;
  readonly maxzoom: number;
  readonly attribution?: string;
}

/** The part of the `maplibregl` module this package uses. */
export interface MapLibreLike {
  addProtocol(name: string, handler: (request: { url: string }, abortController: AbortController) => Promise<{ data: ImageBitmap }>): void;
  removeProtocol?(name: string): void;
}

/** The part of a MapLibre `Map` this package uses. */
export interface MapLike {
  addSource(id: string, spec: RasterSourceSpec): unknown;
  removeSource(id: string): unknown;
  addLayer(spec: { id: string; type: "raster"; source: string; paint?: Record<string, unknown> }, before?: string): unknown;
  removeLayer(id: string): unknown;
  getLayer(id: string): unknown;
  getSource(id: string): unknown;
  setPaintProperty(id: string, name: string, value: unknown): unknown;
  getStyle(): { layers?: Array<{ id: string; type: string }> } | null | undefined;
}

/** Parse `life://<spec>/<z>/<x>/<y>`. */
export function parseTileUrl(url: string, protocol = "life"): { id: string; z: number; x: number; y: number } {
  const m = url.match(new RegExp(`^${protocol}://([^/]+)/(\\d+)/(\\d+)/(\\d+)$`));
  if (!m) throw new Error(`not a ${protocol}:// tile url: ${url}`);
  return { id: m[1]!, z: Number(m[2]), x: Number(m[3]), y: Number(m[4]) };
}

/** Turn a painted tile into an `ImageBitmap`, which MapLibre accepts as tile data. Browser only. */
export function toImageBitmap(image: Image): Promise<ImageBitmap> {
  return createImageBitmap(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height));
}

/**
 * A custom tile protocol that paints LIFE tiles on demand.
 *
 * Register specs to obtain tile URL templates, install the protocol on the
 * `maplibregl` module once, and MapLibre will call back for each tile.
 */
export class LifeProtocol {
  private readonly specs = new Map<string, TileSpec>();
  private next = 1;

  constructor(readonly name = "life") {}

  /** Register the protocol with MapLibre. Call once per page. */
  install(maplibre: MapLibreLike): this {
    maplibre.addProtocol(this.name, this.handler);
    return this;
  }

  /** Remove the protocol from MapLibre. */
  uninstall(maplibre: MapLibreLike): void {
    maplibre.removeProtocol?.(this.name);
  }

  /** The handler MapLibre calls for each tile. */
  readonly handler = async ({ url }: { url: string }, abortController: AbortController): Promise<{ data: ImageBitmap }> => {
    abortController.signal.throwIfAborted();
    const { id, z, x, y } = parseTileUrl(url, this.name);
    const spec = this.specs.get(id);
    const size = spec?.tileSize ?? 256;
    if (!spec) return { data: await toImageBitmap({ width: size, height: size, data: new Uint8ClampedArray(size * size * 4) }) };
    const tile = await paintTile(spec.client, spec.layer, {
      signal: abortController.signal,
      z, x, y, size,
      ...(spec.taxon !== undefined && { taxon: spec.taxon }),
      ...(spec.scale !== undefined && { scale: spec.scale }),
      ...(spec.blend !== undefined && { blend: spec.blend }),
      ...(spec.hideZeros !== undefined && { hideZeros: spec.hideZeros }),
    });
    const bitmap = await toImageBitmap(tile);
    if (abortController.signal.aborted) { bitmap.close(); abortController.signal.throwIfAborted(); }
    return { data: bitmap };
  };

  /** Register a spec and return the id that names it in tile URLs. */
  register(spec: TileSpec): string {
    if (!spec.scale && !spec.blend) throw new Error("a tile spec needs a scale or a blend");
    const id = String(this.next++);
    this.specs.set(id, spec);
    return id;
  }

  /** Forget a registered spec. */
  release(id: string): void {
    this.specs.delete(id);
  }

  /** The tile URL template for a registered spec. */
  template(id: string): string {
    return `${this.name}://${id}/{z}/{x}/{y}`;
  }

  /** A MapLibre raster source for a spec, registering it first. */
  source(spec: TileSpec, opts: { minzoom?: number; maxzoom?: number; attribution?: string } = {}): { id: string; source: RasterSourceSpec } {
    const id = this.register(spec);
    return {
      id,
      source: {
        type: "raster", tiles: [this.template(id)], tileSize: spec.tileSize ?? 256,
        minzoom: opts.minzoom ?? 0, maxzoom: opts.maxzoom ?? 11,
        ...(opts.attribution !== undefined && { attribution: opts.attribution }),
      },
    };
  }
}

export interface MapLayerOptions {
  /** Id of the source and layer on the map. Default `"life"`. */
  readonly id?: string;
  /** Opacity of the data over the basemap, 0 to 1. Default 0.85. */
  readonly opacity?: number;
  /** Insert below this layer id, or below the first symbol layer with `"labels"`. Default on top. */
  readonly before?: string;
  readonly minzoom?: number;
  readonly maxzoom?: number;
  readonly attribution?: string;
}

/**
 * One LIFE raster layer on a MapLibre map.
 *
 * Construct it once the map's style has loaded. `update(spec)` swaps in a
 * new spec, which repaints every tile; `setOpacity` changes the paint
 * property in place; `remove` takes the layer and source off the map.
 */
export class LifeMapLayer {
  readonly id: string;
  private specId: string | null = null;
  private opacity: number;

  constructor(
    private readonly map: MapLike,
    private readonly protocol: LifeProtocol,
    spec: TileSpec,
    private readonly opts: MapLayerOptions = {},
  ) {
    this.id = opts.id ?? "life";
    this.opacity = opts.opacity ?? 0.85;
    this.update(spec);
  }

  /** Replace what is drawn. */
  update(spec: TileSpec): void {
    const { id, source } = this.protocol.source(spec, {
      ...(this.opts.minzoom !== undefined && { minzoom: this.opts.minzoom }),
      ...(this.opts.maxzoom !== undefined && { maxzoom: this.opts.maxzoom }),
      ...(this.opts.attribution !== undefined && { attribution: this.opts.attribution }),
    });
    this.detach();
    if (this.specId) this.protocol.release(this.specId);
    this.specId = id;
    this.map.addSource(this.id, source);
    this.map.addLayer({ id: this.id, type: "raster", source: this.id,
      paint: { "raster-opacity": this.opacity, "raster-resampling": "nearest", "raster-fade-duration": 0 } }, this.before());
  }

  /** Change the opacity of the data over the basemap. */
  setOpacity(opacity: number): void {
    this.opacity = opacity;
    if (this.map.getLayer(this.id)) this.map.setPaintProperty(this.id, "raster-opacity", opacity);
  }

  /** Take the layer off the map. */
  remove(): void {
    this.detach();
    if (this.specId) this.protocol.release(this.specId);
    this.specId = null;
  }

  private detach(): void {
    if (this.map.getLayer(this.id)) this.map.removeLayer(this.id);
    if (this.map.getSource(this.id)) this.map.removeSource(this.id);
  }

  private before(): string | undefined {
    if (this.opts.before === "labels") return this.map.getStyle()?.layers?.find((l) => l.type === "symbol")?.id;
    return this.opts.before;
  }
}

/** A MapLibre style showing OpenStreetMap's standard raster tiles. Light use only; see the OSM tile usage policy. */
export const OSM_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: "osm", type: "raster" as const, source: "osm" }],
};
