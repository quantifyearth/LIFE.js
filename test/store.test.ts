import assert from "node:assert/strict";
import { test } from "node:test";
import * as zarr from "zarrita";
import { Catalogue } from "../src/catalogue.js";
import { LifeStore } from "../src/store.js";
import { open, DEFAULT_STORE } from "../src/index.js";
import { bbox } from "../src/grid.js";
import { H, RES, W, bandValues, makeStore } from "./synthetic.js";

const same = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) assert.ok(Object.is(a[i], b[i]) || a[i] === b[i], `index ${i}: ${a[i]} vs ${b[i]}`);
};

test("open describes the store from its attributes", async () => {
  const store = await LifeStore.open(await makeStore());
  assert.equal(store.version, "0.9");
  assert.deepEqual(Object.keys(store.scenarios), ["arable", "restore"]);
  assert.equal(store.scenarios.arable, "conversion");
  assert.deepEqual(Object.keys(store.curves), ["0.25", "gompertz"]);
  assert.deepEqual(Object.keys(store.taxa), ["all", "AMPHIBIA", "AVES", "MAMMALIA", "REPTILIA"]);
  assert.equal(store.info.version, "0.9");
  assert.equal(store.dataModel.overviews, "Averages for display; use level 1 for totals.");
  assert.match(store.describe(), /data model:/);
  assert.match(store.describe(), /conversion/);
  assert.deepEqual(store.levels, [1, 2]);
  assert.deepEqual([store.grid.width, store.grid.height, store.grid.res, store.grid.lat0], [W, H, RES, 90]);
  assert.equal(store.level(2).path, "1");
  assert.deepEqual([store.level(2).grid.width, store.level(2).grid.height], [W / 2, H / 2]);
  assert.equal(store.path(1, "arable_0.25"), "0/arable_0.25");
  assert.deepEqual(store.layerNames(), ["arable_0.25", "arable_gompertz", "restore_0.25", "restore_gompertz", "arable_area_changed", "restore_area_changed"]);
  assert.equal((await store.layers()).length, 6);
  assert.match(store.describe(), /version 0.9/);
  await assert.rejects(store.layer("arable", "0.5"));
});

test("layer metadata", async () => {
  const store = await LifeStore.open(await makeStore());
  const layer = await store.layer("arable", "0.25");
  assert.equal(layer.kind, "score");
  assert.equal(layer.bands[1], "AMPHIBIA");
  assert.equal(layer.units, "extinctions km-2");
  assert.equal(layer.scenarioDescription, "conversion");
  assert.equal(layer.curveDescription, "main");
  assert.match(layer.summary, /^arable_0.25: change in expected extinctions/);
  assert.deepEqual(await layer.shape(), [5, H, W]);
  assert.deepEqual(await layer.shape(2), [5, H / 2, W / 2]);
  assert.ok(Number.isNaN(layer.fillValue));
  const area = await store.area("restore");
  assert.equal(area.kind, "area");
  assert.deepEqual(area.bands, ["area"]);
  assert.equal(area.fillValue, 0);
});

test("float64 beta arrays and scenario names with underscores", async () => {
  const bytes = new Map<string, Uint8Array>();
  const root = zarr.root(bytes);
  await zarr.create(root, { attributes: {
    version: "1.1~beta1", scenarios: { restore_agriculture: "restoration of agriculture" },
    curves: { "0.25": "power law" }, taxa: Object.fromEntries(["all", "AMPHIBIA", "AVES", "MAMMALIA", "REPTILIA"].map((t) => [t, t])),
    multiscales: { layout: [{ asset: "0", transform: { scale: [1, 1] },
      "spatial:transform": [90, 0, -180, 0, -90, 90], "spatial:shape": [2, 4] }] },
  } });
  await zarr.create(root.resolve("0"));
  const values = new Float64Array(5 * 2 * 4).fill(0.123456789012345);
  const score = await zarr.create(root.resolve("0/restore_agriculture_0.25"), {
    shape: [5, 2, 4], chunkShape: [1, 2, 4], dtype: "float64", fillValue: NaN,
    attributes: { scenario: "restore_agriculture", curve: "0.25", taxon_labels: ["all", "AMPHIBIA", "AVES", "MAMMALIA", "REPTILIA"] },
  });
  await zarr.set(score, null, { data: values, shape: [5, 2, 4], stride: [8, 4, 1] });
  const area = await zarr.create(root.resolve("0/restore_agriculture_area_changed"), {
    shape: [2, 4], chunkShape: [2, 4], dtype: "float64", fillValue: 0,
    attributes: { scenario: "restore_agriculture", kind: "area" },
  });
  await zarr.set(area, null, { data: new Float64Array(8).fill(1234567.123456789), shape: [2, 4], stride: [4, 1] });

  const store = await LifeStore.open(bytes);
  const layer = await store.layer("restore_agriculture", "0.25");
  assert.equal(layer.scenario, "restore_agriculture");
  assert.equal(layer.curve, "0.25");
  const raster = await layer.read({ window: { row0: 0, row1: 1, col0: 0, col1: 1 } });
  assert.ok(raster.data instanceof Float64Array);
  assert.equal(raster.data[0], values[0]);
  const sampled = await layer.sample([[45, -135]]);
  assert.ok(sampled instanceof Float64Array);
  assert.equal(sampled[0], values[0]);
  assert.ok((await (await store.area("restore_agriculture")).read()).data instanceof Float64Array);
});

test("read by bbox and window", async () => {
  const layer = await (await LifeStore.open(await makeStore())).layer("arable", "0.25");
  const expect = bandValues(2, 1);
  const r = await layer.read({ taxon: "AVES", bbox: bbox(-90, 0, 0, 45) }); // rows 3..6, cols 6..12 (90N is row 0)
  assert.deepEqual(r.grid.bounds, { west: -90, south: 0, east: 0, north: 45 });
  const want = new Float32Array(3 * 6);
  for (let rr = 0; rr < 3; rr++) for (let c = 0; c < 6; c++) want[rr * 6 + c] = expect[(rr + 3) * W + c + 6]!;
  same(r.data, want);
  const w = await layer.read({ taxon: "AVES", window: { row0: 3, row1: 6, col0: 6, col1: 12 } });
  same(w.data, r.data);
  const whole = await layer.read({ taxon: "AVES" });
  assert.equal(whole.data.length, H * W);
  const stack = await layer.read({ taxon: null, bbox: bbox(-90, 0, 0, 45) });
  assert.deepEqual(stack.bands.length, 5);
  same(stack.band("AVES"), r.data);
  await assert.rejects(layer.read({ window: { row0: -1, row1: 1, col0: 0, col1: 1 } }), RangeError);
});

test("value and sample", async () => {
  const layer = await (await LifeStore.open(await makeStore())).layer("restore", "gompertz");
  const expect = bandValues(0, -1);
  const grid = await layer.grid();
  const lat = grid.latitudes()[4]!, lon = grid.longitudes()[7]!;
  assert.equal(await layer.value(lat, lon), expect[4 * W + 7]);
  assert.ok(Number.isNaN(await layer.value(grid.latitudes()[0]!, lon)));
  assert.ok(Number.isNaN(await layer.value(91, 0)));
  const got = await layer.sample([[grid.latitudes()[1]!, grid.longitudes()[0]!], [lat, lon], [grid.latitudes()[11]!, grid.longitudes()[23]!]], "MAMMALIA");
  const m = bandValues(3, -1);
  same(got, [m[1 * W + 0]!, m[4 * W + 7]!, m[11 * W + 23]!]);
  assert.equal(await layer.value(lat, lon + 360), expect[4 * W + 7]); // longitude wraps
  const invalid = await layer.sample([[lat, NaN], [NaN, lon], [lat, Infinity]]);
  assert.ok(invalid.every(Number.isNaN));
});

test("overview level", async () => {
  const store = await LifeStore.open(await makeStore());
  const layer = await store.layer("arable", "0.25");
  const g2 = await layer.grid(2);
  assert.deepEqual([g2.width, g2.height, g2.res, g2.lat0], [12, 6, 30, 90]);
  const r = await layer.read({ level: 2 });
  assert.equal(r.data.length, 6 * 12);
  const base = bandValues(0, 1);
  const block = [base[2 * W + 2]!, base[2 * W + 3]!, base[3 * W + 2]!, base[3 * W + 3]!];
  const mean = block.reduce((a, b) => a + b, 0) / 4;
  assert.ok(Math.abs(r.data[1 * 12 + 1]! - mean) < 1e-12);
  assert.equal(await layer.value(90 - 45, -180 + 45, "all", 2), r.data[1 * 12 + 1]);
  assert.throws(() => store.level(4), RangeError);
});

test("catalogue", async () => {
  const manifest = { latest: "0.9", versions: { "0.9": { path: "v0.9/life.zarr", released: "2026-01-01" }, "0.10": { path: "v0.10/life.zarr" } } };
  const opened: string[] = [];
  const cat = new Catalogue("https://example.org/life", {
    fetchJson: async (url) => { assert.equal(url, "https://example.org/life/versions.json"); return manifest; },
    open: async (url) => { opened.push(url); return LifeStore.open(await makeStore()); },
  });
  assert.deepEqual((await cat.releases()).map((r) => r.version), ["0.9", "0.10"]);
  assert.equal((await cat.latest()).version, "0.9");
  assert.equal((await cat.release("0.10")).url, "https://example.org/life/v0.10/life.zarr");
  assert.equal((await cat.open()).version, "0.9");
  assert.deepEqual(opened, ["https://example.org/life/v0.9/life.zarr"]);
  await assert.rejects(cat.release("2.0"));
});

const REAL_BASE = process.env.LIFE_CATALOGUE_URL ?? "http://127.0.0.1:8931";
const REAL = process.env.LIFE_STORE_URL ?? REAL_BASE + "/v1.01";
const reachable = await fetch(REAL + "/zarr.json").then((r) => r.ok).catch(() => false);
const published = await fetch("https://data.source.coop/tessera/life/v1.01/zarr.json").then((r) => r.ok).catch(() => false);
const publishedBeta = await fetch("https://data.source.coop/tessera/life/v1.1~beta1/zarr.json").then((r) => r.ok).catch(() => false);

test("real store", { skip: !reachable }, async () => {
  const store = await LifeStore.open(REAL);
  assert.equal(store.version, "1.01");
  assert.deepEqual(store.levels, [1, 2, 4, 8, 16]);
  assert.equal(store.layerNames().length, 12);
  assert.deepEqual([store.grid.width, store.grid.height, store.grid.lat0], [21600, 10800, 90]);
  assert.deepEqual(store.levels.map((f) => store.level(f).path), ["0", "1", "2", "3", "4"]);
  assert.equal(store.info.doi, "10.5281/zenodo.14945383");
  assert.match(store.info.termsOfUse ?? "", /IBAT/);
  assert.equal(store.level(2).resamplingMethod, "average");
  const layer = await store.layer("arable", "0.25");
  const g = store.grid;
  const v = await layer.value(g.latitudes()[5100]!, g.longitudes()[11520]!); // source row 5099 is store row 5100
  assert.ok(Math.abs(v - 4.533233e-5) < 1e-11, String(v));
  assert.ok(Number.isNaN(await layer.value(g.latitudes()[0]!, 0)));
  assert.ok(Number.isNaN(await layer.value(52.2, 0.1)));
  const r = await layer.read({ bbox: bbox(-0.5, 51.9, 0.6, 52.5) });
  assert.deepEqual([r.grid.height, r.grid.width], [36, 66]);
});

test("real catalogue", { skip: !reachable }, async () => {
  const cat = new Catalogue(REAL_BASE);
  const rel = await cat.latest();
  assert.equal(rel.version, "1.01");
  assert.equal(rel.url, REAL_BASE + "/v1.01");
  const store = await cat.open("1.01");
  assert.equal(store.version, "1.01");
  assert.equal(store.attrs.zenodo_record, 14945383);
  assert.equal(store.attrs.concept_doi, "10.5281/zenodo.14188449");
});

test("published store", { skip: !published }, async () => {
  const store = await open();
  assert.equal(store.metadata.source, DEFAULT_STORE);
  assert.equal(store.metadata.version, "1.01");
  assert.deepEqual(store.metadata.levels.map((l) => l.factor), [1, 2, 4, 8, 16]);
  const [a, , c, , e, f] = store.metadata.transform;
  const [v] = await store.sample("arable_0.25", [[c + a * 11520.5, f + e * 5100.5]]);
  assert.ok(v !== undefined);
  assert.ok(Math.abs(v - 4.533233e-5) < 1e-11, String(v));
  const r = await store.read("arable_0.25", { bounds: [-0.5, 51.9, 0.6, 52.5], level: 4 });
  assert.deepEqual([r.height, r.width], [10, 17]);
  assert.ok(r.data instanceof Float32Array);
});

test("published beta store", { skip: !publishedBeta }, async () => {
  const store = await open(undefined, { version: "1.1~beta1" });
  assert.equal(store.metadata.version, "1.1~beta1");
  assert.deepEqual(store.metadata.levels.map((l) => l.factor), [1, 2, 4, 8, 16]);
  assert.deepEqual(Object.keys(store.metadata.scenarios), ["arable", "pasture", "urban", "restore", "restore_agriculture", "restore_all"]);
  assert.deepEqual(Object.keys(store.metadata.curves), ["0.25"]);
  assert.equal(store.metadata.layers.length, 12);
  assert.match(store.metadata.dataModel.overviews ?? "", /overview/i);
  const score = await store.layerMetadata("restore_agriculture_0.25");
  assert.equal(score.scenario, "restore_agriculture");
  const window = [11000, 5000, 11001, 5001] as const;
  const raster = await store.read(score.name, { window });
  assert.ok(raster.data instanceof Float64Array);
  assert.ok((await store.read("restore_all_area_changed", { window })).data instanceof Float64Array);
});
