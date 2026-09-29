# LIFE.js

## NAME

life-metric reads LIFE extinction-risk maps in browsers and Node.js.

## SYNOPSIS

```ts
import { open } from "life-metric";

const life = await open();
const raster = await life.read("arable_0.25", {
  bounds: [43, -26, 51, -12],
  taxon: "AVES",
});
console.log(raster.data, raster.width, raster.height, raster.units);
```

## DESCRIPTION

LIFE.js reads regions and samples points from LIFE Zarr v3 stores. It returns
Float32Array or Float64Array values with plain metadata. Raster values are
ordered by band, row, then column. One client reuses metadata and fetched data.

Scores measure the change in expected extinctions per square kilometre of
land changed. Positive scores mean more extinctions, and negative scores mean
fewer. Missing scores are NaN. Changed-area layers use square metres; zero
scores and zero area are valid data.

## INSTALLATION

```sh
npm install life-metric
```

Use Node.js 18 or newer, or a browser with an ESM bundler or import map.

## USAGE

`open()` reads the published v1.01 store. Pass a URL to open another store.
`life.metadata` describes its scenarios, curves, taxa, layers, and resolution
levels. `versions()` lists the releases in the published catalogue.

Reads require bounds, a pixel window, or a GeoJSON polygon. Bounds use
`[west, south, east, north]` in WGS84 degrees. Point samples use
`[longitude, latitude]` pairs.

```ts
const scores = await life.sample("arable_0.25", [[47, -19.5]], { taxon: "AVES" });
console.log(JSON.stringify(Array.from(scores)));
const bytes = await life.download("arable_0.25", { bounds: [43, -26, 51, -12] });
```

Downloads return GeoTIFF bytes with CRS, units, citation, and data terms.
They are uncompressed and limited to 16 million values. Use native resolution
for calculations; coarser levels are intended for display. Requests accept
an AbortSignal for cancellation.

The [API guide](https://github.com/quantifyearth/LIFE.js/blob/main/docs/api.md)
explains masks, coordinate placement, version selection, and MapLibre.
The [numbered examples](https://github.com/quantifyearth/LIFE.js/tree/main/examples)
provide runnable scripts and browser pages. From a repository checkout, run
`npm ci` and `npm run example -- read` to read a region.

## TERMS OF USE

The code is MIT licensed. The data may not be used for commercial or
revenue-generating purposes, nor redistributed in their original form,
without written permission from IBAT (ibat@ibat-alliance.org).
Read `life.metadata.termsOfUse` for the full terms.

## SEE ALSO

The method is described by [Eyres et al. (2025), *LIFE: A metric for mapping the impact of land-cover change on global extinctions*](https://doi.org/10.1098/rstb.2023.0327).
The [data of record](https://doi.org/10.5281/zenodo.14945383) and
[published stores](https://source.coop/tessera/life) are available separately.
See [LIFE.py](https://github.com/quantifyearth/LIFE.py) for the Python client
and [quantifyearth/LIFE](https://github.com/quantifyearth/LIFE) to regenerate
LIFE from source data.
