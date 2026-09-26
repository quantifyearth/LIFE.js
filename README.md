# life-metric

Install with `npm install life-metric`. Node.js 18 or newer is required.

## NAME

life-metric - read the LIFE maps of extinction risk from land-cover change

## SYNOPSIS

```ts
import { LifeStore, Catalogue, bbox, makeScale, makeBlend, percentileAbs, paintTile,
         LifeProtocol, LifeMapLayer, OSM_STYLE } from "life-metric";

const store = await LifeStore.open();                           // the published store
// Or: const store = await new Catalogue().open("1.01");        // a named release
console.log(store.describe());

const layer = await store.layer("arable", "0.25");
const raster = await layer.read({ taxon: "all", bbox: bbox(west, south, east, north), level: 1 });
const value = await layer.value(lat, lon, "AVES");
const values = await layer.sample([[lat, lon]]);

const scale = makeScale({ vmax: percentileAbs(raster.data, 99) });
const rgba = scale.render(raster.data);                         // width * height * 4 bytes
const tile = await paintTile(layer, { z, x, y, scale });

const protocol = new LifeProtocol().install(maplibregl);        // once per page
const shown = new LifeMapLayer(map, protocol, { layer, scale }); // after the map's style has loaded
```

## DESCRIPTION

The v1.01 LIFE release is a global map of how changing the use of land affects
the survival of 30,875 species of amphibians, birds, mammals and reptiles.
For every pixel of
land, one arc-minute or about 1.9 km north to south, it gives the change in the
expected number of species that would go extinct over the next century if one
square kilometre of that pixel were changed in one of two ways: converted from
its present state to cropland, the `arable` scenario, or restored from cropland
and pasture to natural vegetation, the `restore` scenario. A positive value
means more extinctions and a negative value fewer, so conversion is mostly
positive and restoration mostly negative. The values are small: 0.01 means that
changing one square kilometre there would add one hundredth of an expected
extinction. A pixel where the scenario changes nothing, such as a town or
existing cropland under conversion, holds NaN.

In v1.01, each scenario comes in five variants, called curves, that differ in
how fast a species is assumed to lose its chance of survival as its habitat shrinks. The
curve named `0.25` is the published result and the others are its sensitivity
analysis. Each variant has five bands: `all` species together, then `AMPHIBIA`,
`AVES`, `MAMMALIA` and `REPTILIA` on their own; the first is the sum of the
other four. Two further layers, one per scenario, give the area of land in
square metres that each pixel would change.

The data live in a Zarr store with the full grid as level 1 and overview levels
at 2, 4, 8 and 16 times coarser, whose pixels average the finite pixels beneath
them, for display. This package opens such a store from a URL or from any store
object zarrita can read, in the browser or in Node, and reads it by region, by
point or as a whole level, through zarrita. Every statement above is also
written in the store's attributes and exposed on the objects, so a store from
another version of the dataset describes itself.

## STORES

`LifeStore.open(source = DEFAULT_STORE, { cache })` opens a store. The
source is a URL or a zarrita-readable store object; the default is the
published v1.01 store at <https://data.source.coop/tessera/life/v1.01>. A
URL is read with byte caching and consolidated metadata unless `cache` is
false; a store object is used as given.

A `LifeStore` has `info` (title, summary, version, DOIs, citation, source URL
and terms of use), `scenarios`, `curves` and `taxa` (each a record from name
to the store's description of it), `dataModel` (array names, values and
overview limitations), `levels` (the reduction factors
available, starting at 1) and `grid` (the base grid). `describe()` returns
all of that as text. `layer(scenario, curve)` and `area(scenario)` resolve
to one `Layer`, `get(name)` to a layer by array name, `layers()` to them
all, and `level(factor)` returns a `Level` with its group path, grid and
resampling method.

## LAYERS

A `Layer` carries `name`, `kind` (`"score"` or `"area"`), `scenario`,
`curve`, `bands`, `units`, `longName`, `description`, `fillValue`, per-band
`statistics`, and `summary`, one sentence saying what it holds.

`read({ taxon, bbox, window, level })` resolves to a `Raster` of one band,
or of every band when `taxon` is `null`. The region is a bounding box in
degrees from `bbox()`, a window of rows and columns, or the whole level.
`value(lat, lon, taxon)` resolves to one number and `sample(points, taxon)`
to a `Float32Array` or `Float64Array`, matching the store, with NaN off the
grid or where there is no data.

A `Raster` carries `data` in band, row, column order with NaN for no data,
`bands`, and the `Grid` that places it: `grid.transform` is a GDAL
geotransform and `grid.latitudes()` and `grid.longitudes()` are pixel
centres. `band(name)` views one band.

## VERSIONS

`new Catalogue(base = DEFAULT_CATALOGUE, { fetchJson, open })` reads
`versions.json` under a URL, by default <https://data.source.coop/tessera/life>.
The manifest maps version strings to store paths and may name a `latest`.
`releases()` lists them oldest first, `latest()` and `release(version)`
select one, and `open(version?)` opens it.

The catalogue also lists `1.1~beta1`. Open it with
`await new Catalogue().open("1.1~beta1")`. It has six scenarios (`arable`,
`pasture`, `urban`, `restore`, `restore_agriculture`, `restore_all`), only curve
`0.25`, and float64 scores and areas. Check `store.scenarios`, `store.curves`
and `store.layerNames()` before choosing a layer. The catalogue still marks
`1.01` as latest; the beta has no Zenodo DOI.

## COLOUR

`makeScale({ vmax, mode, polarity, theme })` builds a lookup table: blue
through grey to red for scores, red meaning more extinctions, or a blue ramp
for areas. `"log"` spreads out the many small values and `"linear"` keeps
colour proportional to value; both saturate at `vmax`. `scale.rgba(v)`
colours one value and `scale.render(values)` an array, hiding NaN and, by
default, exact zeros; `legend(width)` draws the bar and `ticks()` labels it.
`percentileAbs(values, p)` gives a robust `vmax`.

`makeBlend({ vmaxes, mode, direction, contrast, alpha })` paints the four
species groups at once. Each group is a coloured gel, amphibians green,
birds blue, mammals orange and reptiles magenta, and each group's value is
measured against its own range, in the direction that matters for the
scenario: +1 counts increases in extinctions, -1 decreases. The group with
the largest weight applies its gel in full and each other group applies its
gel raised to `(weight / largest) ** contrast`, so the hue is the most
affected group, near-ties mix and darken, and four equal groups give black;
opacity is `largest ** alpha`. `blend.rgba(values)` colours one pixel,
`blend.render(bands, size)` a raster stack, and `swatches`, `pairs` and
`black` give legend colours.

## TILES

`paintTile(layer, { z, x, y, scale | blend })` paints one Web Mercator XYZ
tile as an RGBA `Image`. It picks the overview level whose pixel is no
coarser than a tile pixel, reads the covering window in one request, and
samples nearest-neighbour. Draw the result on any canvas, or let the MapLibre
helpers below do so.

## MAPLIBRE

`new LifeProtocol(name = "life").install(maplibregl)` registers a tile
protocol that paints tiles on demand. `protocol.source(spec)` registers a
`TileSpec` (`{ layer, taxon?, scale?, blend?, hideZeros?, tileSize? }`) and
returns a raster source specification whose tiles are `life://<id>/{z}/{x}/{y}`,
for use with `map.addSource`.

`new LifeMapLayer(map, protocol, spec, { id, opacity, before, maxzoom })`
adds that source and a raster layer to a map whose style has loaded. `before`
is a layer id, or `"labels"` to sit under the first symbol layer. `update(spec)`
swaps what is drawn and repaints every tile, `setOpacity(value)` changes the
opacity in place, and `remove()` takes the layer off the map. `OSM_STYLE` is
a MapLibre style showing OpenStreetMap's raster tiles, for light use under
the OSM tile usage policy.

## EXAMPLES

A flat map of the published data over OpenStreetMap:

```ts
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LifeStore, LifeProtocol, LifeMapLayer, OSM_STYLE, makeBlend, percentileAbs } from "life-metric";

const store = await LifeStore.open();
const layer = await store.layer("arable", "0.25");
const coarse = await layer.read({ taxon: null, level: 16 });
const blend = makeBlend({ vmaxes: layer.bands.slice(1).map((b) => percentileAbs(coarse.band(b), 99)) });

const protocol = new LifeProtocol().install(maplibregl);
const map = new maplibregl.Map({ container: "map", style: OSM_STYLE, center: [20, 10], zoom: 2 });
map.on("style.load", () => new LifeMapLayer(map, protocol, { layer, blend }, { opacity: 0.85 }));
```

## TERMS OF USE

The package code is MIT licensed. The underlying LIFE data have separate terms:

The data may not be used for commercial or revenue-generating purposes, nor
redistributed in their original form, without written permission from IBAT
(ibat@ibat-alliance.org). The full text is in `store.info.termsOfUse`.

## SEE ALSO

Eyres A. et al. 2025, *LIFE: A metric for mapping the impact of land-cover
change on global extinctions*, Phil. Trans. R. Soc. B 380:20230327,
<https://doi.org/10.1098/rstb.2023.0327>. Data of record:
<https://doi.org/10.5281/zenodo.14945383>. Published store:
<https://source.coop/tessera/life>.
