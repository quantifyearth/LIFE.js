import assert from "node:assert/strict";
import { test } from "node:test";
import { LifeMapLayer, LifeProtocol, LifeStore, OSM_STYLE, makeScale, parseLifeTileUrl } from "../src/index.js";
import { makeStore } from "./synthetic.js";

test("protocol registers specs and builds sources", async () => {
  const store = await LifeStore.open(await makeStore());
  const layer = await store.layer("arable", "0.25");
  const protocol = new LifeProtocol();
  const installed: string[] = [];
  protocol.install({ addProtocol: (name) => installed.push(name) });
  assert.deepEqual(installed, ["life"]);
  const { id, source } = protocol.source({ layer, scale: makeScale({ vmax: 1e-4 }) }, { attribution: "LIFE" });
  assert.equal(source.type, "raster");
  assert.deepEqual(source.tiles, [`life://${id}/{z}/{x}/{y}`]);
  assert.deepEqual([source.tileSize, source.minzoom, source.maxzoom, source.attribution], [256, 0, 11, "LIFE"]);
  assert.deepEqual(parseLifeTileUrl(`life://${id}/3/4/5`), { id, z: 3, x: 4, y: 5 });
  assert.throws(() => parseLifeTileUrl("other://1/2/3/4"));
  assert.throws(() => protocol.register({ layer }), /scale or a blend/);
});

test("map layer adds, updates and removes itself", async () => {
  const store = await LifeStore.open(await makeStore());
  const layer = await store.layer("arable", "0.25");
  const calls: string[] = [];
  const sources = new Set<string>(), layers = new Map<string, string | undefined>();
  const map = {
    addSource: (id: string) => { sources.add(id); calls.push(`addSource ${id}`); },
    removeSource: (id: string) => { sources.delete(id); calls.push(`removeSource ${id}`); },
    addLayer: (spec: { id: string }, before?: string) => { layers.set(spec.id, before); calls.push(`addLayer ${spec.id} before=${before}`); },
    removeLayer: (id: string) => { layers.delete(id); calls.push(`removeLayer ${id}`); },
    getLayer: (id: string) => (layers.has(id) ? {} : undefined),
    getSource: (id: string) => (sources.has(id) ? {} : undefined),
    setPaintProperty: (id: string, name: string, value: unknown) => calls.push(`paint ${id} ${name}=${value}`),
    getStyle: () => ({ layers: [{ id: "osm", type: "raster" }, { id: "place-labels", type: "symbol" }] }),
  };
  const protocol = new LifeProtocol();
  const scale = makeScale({ vmax: 1 });
  const ml = new LifeMapLayer(map, protocol, { layer, scale }, { before: "labels", opacity: 0.5 });
  assert.deepEqual(calls, ["addSource life", "addLayer life before=place-labels"]);
  ml.update({ layer, scale, taxon: "AVES" });
  assert.deepEqual(calls.slice(2), ["removeLayer life", "removeSource life", "addSource life", "addLayer life before=place-labels"]);
  ml.setOpacity(1);
  assert.equal(calls.at(-1), "paint life raster-opacity=1");
  ml.remove();
  assert.equal(sources.size, 0);
  assert.equal(layers.size, 0);
});

test("OSM style is a raster basemap", () => {
  assert.equal(OSM_STYLE.layers[0]!.type, "raster");
  assert.match(OSM_STYLE.sources.osm.tiles[0]!, /openstreetmap/);
});
