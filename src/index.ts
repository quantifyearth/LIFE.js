/** Read LIFE data into typed arrays and GeoJSON masks, or draw it on a canvas or MapLibre map. */

export { open, versions, type Client, type OpenOptions, type Metadata, type LayerMetadata,
  type GridMetadata, type LevelMetadata, type Raster, type ReadOptions, type Selection,
  type SampleOptions, type Bounds, type Window, type Point, type Transform, type Version } from "./client.js";
export { type Region } from "./geometry.js";
export { DEFAULT_CATALOGUE, DEFAULT_STORE, type FloatData, type StoreLike, type Kind,
  type BandStatistics } from "./store.js";
export {
  INKS, PALETTES, hexToOklab, linearToSrgb8, makeBlend, makeScale, normaliseInks, oklabToRgb8, percentileAbs, rampLut,
  type Blend, type BlendOptions, type Mode, type Polarity, type RGB, type RGBA, type Scale, type ScaleOptions, type Theme,
} from "./colour.js";
export { paintTile, pickLevel, tileLats, tileLons, type Image, type TileOptions } from "./tiles.js";
export {
  LifeMapLayer, LifeProtocol, OSM_STYLE, parseTileUrl as parseLifeTileUrl, toImageBitmap,
  type MapLayerOptions, type MapLibreLike, type MapLike, type RasterSourceSpec, type TileSpec,
} from "./maplibre.js";
