# Data access

`await open()` opens the published v1.01 store. Pass a URL or any
zarrita-readable store as its first argument to read another store. To select a release,
use `open(undefined, { version: "1.01" })`. `versions()` lists release objects
with a `latest` flag. `client.metadata` contains the dataset descriptions,
available layers, resolution levels, citation, and terms. Layer descriptions
are available from `await client.layerMetadata(name)`.

`read(name, options)` requires exactly one of `bounds`, `window`, or `geometry`.
Bounds are `[west, south, east, north]` in WGS84 degrees. Windows are
`[columnStart, rowStart, columnStop, rowStop]` in integer pixels, with stop
indices excluded. Regions are cropped to the grid. Split geometries at the
antimeridian before reading them.

Results contain `data`, `width`, `height`, `bands`, `bounds`, `transform`,
`crs`, `units`, and dataset provenance. The transform uses Affine order
`[a, b, c, d, e, f]`: `x = a * column + b * row + c` and
`y = d * column + e * row + f`. It describes pixel edges; centres are half a
pixel inside them. The raster CRS is EPSG:4326.

Score reads select the `all` band by default. Set `taxon: null` to read all score bands. Area layers ignore the taxon.
`level` is a reduction factor, with 1 for native resolution. Available factors
are in `client.metadata.levels`. Values keep the source dtype.

`sample(name, points, options)` accepts `[longitude, latitude]` pairs and
returns a typed array. Longitudes wrap; latitudes outside the grid return NaN.
All coordinates must be finite.

```ts
import { open } from "life-metric";

const life = await open();
const scores = await life.sample("arable_0.25", [[47, -19.5]], { taxon: "AVES" });
console.log(JSON.stringify(Array.from(scores)));
```

Open, read, sample, download, and catalogue requests accept `signal` for an
AbortSignal. A custom `fetch(request)` handler can supply authentication or
other request settings when opening a URL. Set `cache: false` to disable byte
caching for URLs.

## Polygon masks

Geometry reads accept GeoJSON Polygon, MultiPolygon, polygon Feature, or
FeatureCollection objects. Coordinates use WGS84 longitude-latitude order.
Pixels are included when their centres fall inside a polygon or on its boundary.
Polygon holes are excluded.

Geometry reads return a `valid` Uint8Array alongside the unchanged values.
It has the same length and order as `data`: 1 means valid, and 0 means outside
the polygon or non-finite. `masked: true` adds the same validity mask to
bounds and window reads. Zero scores and zero changed area remain valid.

## GeoTIFF downloads

`await client.download(name, options)` returns a GeoTIFF ArrayBuffer. The
file preserves float32 or float64 values, CRS, transform, band descriptions,
units, version, citation, and data terms. Masked pixels become NaN; unmasked
zero area remains valid. Downloads are limited to 16 million values and use
uncompressed TIFF encoding.

Save the result with Node's `writeFile`, or make a browser Blob with
`new Blob([bytes], { type: "image/tiff" })`. To export an already read raster,
import `toGeoTIFF` from `life-metric/geotiff`.

## Drawing maps

`makeScale()` and `makeBlend()` colour typed arrays. Their RGBA output can be
passed to ImageData. `paintTile(client, layerName, options)` returns
`{ data, width, height }` for one Web Mercator XYZ tile.

For MapLibre, register a `LifeProtocol` and pass a tile specification with
`{ client, layer: "arable_0.25", scale }` or a taxa `blend` to `LifeMapLayer`.
The application supplies MapLibre and calls this after its style has loaded.
MapLibre's request cancellation is passed through to Zarr reads.

See the [numbered examples](https://github.com/quantifyearth/LIFE.js/tree/main/examples) for complete scripts and browser pages.
