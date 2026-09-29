# 6. Use MapLibre

`showMap(map, maplibregl, client)` adds a LIFE raster layer to an existing
MapLibre map. Call it after the map's style has loaded. The example reads
an overview to choose colour ranges and paints the four taxa as a blend.

Run `npm run build:examples`, then import `showMap` from the compiled
`dist-examples/examples/6-maplibre/maplibre.js` in a browser application.
The application supplies MapLibre; LIFE does not import it.

The returned `layer` supports `remove()`. Call
`protocol.uninstall(maplibregl)` when its tile protocol is no longer needed.
Read [maplibre.ts](maplibre.ts).

To run the included browser page, use:

```sh
npm run build:examples
python3 -m http.server 8932
```

Open `http://localhost:8932/examples/6-maplibre/index.html`.
The page uses the published store. Add `?store=<url>` to choose a store URL.
