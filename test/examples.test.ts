import assert from "node:assert/strict";
import { test } from "node:test";
import type * as maplibre from "maplibre-gl";
import { fromArrayBuffer } from "geotiff";
import { open, type MapLike, type MapLibreLike } from "../src/index.js";
import { readRegion } from "../examples/1-read-region/read-region.js";
import { samplePoints } from "../examples/2-sample-points/sample-points.js";
import { maskPolygon } from "../examples/3-mask-polygon/mask-polygon.js";
import { downloadGeoTIFF } from "../examples/4-download-geotiff/download-geotiff.js";
import { drawRegion } from "../examples/5-canvas/canvas.js";
import { showMap } from "../examples/6-maplibre/maplibre.js";
import { makeStore, W, bandValues } from "./synthetic.js";

// Compile against MapLibre's real API without importing it at runtime.
function compatible(module: typeof maplibre, map: maplibre.Map): [MapLibreLike, MapLike] { return [module, map]; }
void compatible;

test("numbered access and download examples run against an offline store", async () => {
  const client = await open(await makeStore());
  const bounds = [-90, 0, 0, 45] as const;
  const raster = await readRegion(client, bounds);
  assert.deepEqual([raster.width, raster.height], [6, 3]);
  assert.deepEqual(await samplePoints(client, [[-67.5, 22.5]]), Float32Array.of(bandValues(2, 1)[4 * W + 7]));
  const masked = await maskPolygon(client, bounds);
  assert.ok(masked.valid!.some((v) => v === 0) && masked.valid!.some((v) => v === 1));
  const image = await (await fromArrayBuffer(await downloadGeoTIFF(client, bounds))).getImage();
  assert.deepEqual(image.getBoundingBox(), bounds);
  assert.equal(image.getWidth(), 6);
});

test("canvas example renders a standard ImageData", async () => {
  const client = await open(await makeStore());
  const original = globalThis.ImageData;
  let drawn: ImageData | undefined;
  // Node has no canvas. Supply only the browser constructor and drawing method used by the example.
  globalThis.ImageData = class {
    constructor(readonly data: Uint8ClampedArray, readonly width: number, readonly height: number) {}
  } as unknown as typeof ImageData;
  const canvas = { width: 0, height: 0, getContext: () => ({ putImageData: (image: ImageData) => { drawn = image; } }) };
  try {
    await drawRegion(canvas as unknown as HTMLCanvasElement, client, [-90, 0, 0, 45]);
    assert.equal(drawn!.data.length, 6 * 3 * 4);
    assert.equal(drawn!.data[3], 255);
    assert.deepEqual([canvas.width, canvas.height], [6, 3]);
  } finally { globalThis.ImageData = original; }
});

test("MapLibre example installs and removes the layer and protocol", async () => {
  const client = await open(await makeStore());
  const installed = new Set<string>(), sources = new Set<string>(), layers = new Set<string>();
  const map = {
    addSource: (id: string) => sources.add(id), removeSource: (id: string) => sources.delete(id),
    addLayer: (spec: { id: string }) => layers.add(spec.id), removeLayer: (id: string) => layers.delete(id),
    getLayer: (id: string) => layers.has(id) ? {} : undefined, getSource: (id: string) => sources.has(id) ? {} : undefined,
    setPaintProperty: () => {}, getStyle: () => ({ layers: [] }),
  };
  const module = { addProtocol: (name: string) => installed.add(name), removeProtocol: (name: string) => installed.delete(name) };
  const { layer, protocol } = await showMap(map, module, client);
  assert.deepEqual([...installed], ["life"]);
  assert.deepEqual([...sources], ["life"]);
  assert.deepEqual([...layers], ["life"]);
  layer.remove(); protocol.uninstall(module);
  assert.equal(installed.size + sources.size + layers.size, 0);
});
