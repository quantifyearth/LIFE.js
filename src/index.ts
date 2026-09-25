/**
 * Read the LIFE maps of extinction risk from land-cover change.
 *
 * LIFE gives, for every 1 arc-minute pixel of land on Earth, the change in
 * the expected number of species extinctions over the next century if one
 * square kilometre of that pixel were converted to cropland, or restored to
 * natural vegetation. Open the published store with {@link LifeStore.open},
 * or a release through a {@link Catalogue}, then read a layer by region or by
 * point. The colour functions turn rasters into RGBA with the same scales and
 * taxa blend the reference viewer uses, and {@link paintTile} produces XYZ
 * map tiles.
 */

export { bbox, Grid, type BBox, type Window } from "./grid.js";
export { Catalogue, compareVersions, MANIFEST, type CatalogueOptions, type Release } from "./catalogue.js";
export {
  CURVES, DEFAULT_CATALOGUE, DEFAULT_STORE, Layer, LifeStore, SCENARIOS, TAXA, parseLayout,
  type Attrs, type BandStatistics, type Curve, type Info, type Kind, type Level, type OpenOptions, type Raster, type ReadOptions,
  type Scenario, type StoreLike, type Taxon,
} from "./store.js";
export {
  INKS, PALETTES, hexToOklab, linearToSrgb8, makeBlend, makeScale, normaliseInks, oklabToRgb8, percentileAbs, rampLut,
  type Blend, type BlendOptions, type Mode, type Polarity, type RGB, type RGBA, type Scale, type ScaleOptions, type Theme,
} from "./colour.js";
export { paintTile, pickLevel, tileLats, tileLons, type Image, type TileOptions } from "./tiles.js";
export {
  LifeMapLayer, LifeProtocol, OSM_STYLE, parseTileUrl as parseLifeTileUrl, toImageBitmap,
  type MapLayerOptions, type MapLibreLike, type MapLike, type RasterSourceSpec, type TileSpec,
} from "./maplibre.js";
