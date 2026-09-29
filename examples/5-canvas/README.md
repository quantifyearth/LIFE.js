# 5. Draw on a canvas

`drawRegion(canvas, client)` reads a region, colours the typed array, and
passes an ImageData to the canvas. The 99th percentile sets the colour range.
Red means more expected extinctions, and blue means fewer.

Run `npm run build:examples`, then import `drawRegion` from the compiled
`dist-examples/examples/5-canvas/canvas.js` in a browser application.
Pass an HTML canvas and a client returned by `open()`.

Read [canvas.ts](canvas.ts), then [use MapLibre](../6-maplibre/README.md).

To run the included browser page, use:

```sh
npm run build:examples
python3 -m http.server 8932
```

Open `http://localhost:8932/examples/5-canvas/index.html`.
The page uses the published store. Add `?store=<url>` to choose a store URL.
