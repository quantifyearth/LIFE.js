# Examples

Clone the repository and install its dependencies.

```sh
git clone https://github.com/quantifyearth/LIFE.js.git
cd LIFE.js
npm ci
```

Follow the numbered examples to read
regions, sample points, mask polygons, save GeoTIFFs, and draw maps.

1. [Read a region](1-read-region/README.md).
2. [Sample points](2-sample-points/README.md).
3. [Mask a polygon](3-mask-polygon/README.md).
4. [Download a GeoTIFF](4-download-geotiff/README.md).
5. [Draw on a canvas](5-canvas/README.md).
6. [Use MapLibre](6-maplibre/README.md).

The Node examples use the published v1.01 store by default. Append a store
URL to use another store. To read a local directory, serve its catalogue root
with `python3 -m http.server 8931 -d /path/to/data`, then pass
`http://localhost:8931/v1.01`.

The test suite runs the same functions against a small in-memory store.
The canvas and MapLibre examples run in a browser after compilation.
