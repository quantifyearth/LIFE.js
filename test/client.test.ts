import assert from "node:assert/strict";
import { test } from "node:test";
import { fromArrayBuffer } from "geotiff";
import type { Polygon } from "geojson";
import * as zarr from "zarrita";
import { open, versions, type ReadOptions, type Region } from "../src/index.js";
import { toGeoTIFF } from "../src/geotiff.js";
import { bandValues, makeStore, W, H, RES } from "./synthetic.js";

const bounds = [-90, 0, 0, 45] as const;
const window = [6, 3, 12, 6] as const;

test("plain raster results preserve dtype, placement, bands and metadata", async () => {
  const client = await open(await makeStore());
  assert.equal(Object.getPrototypeOf(client.metadata), Object.prototype);
  assert.equal(client.metadata.version, "0.9");
  assert.equal(client.metadata.levels[1].factor, 2);
  assert.deepEqual(client.metadata.levels[1].transform, [RES * 2, 0, -180, 0, -RES * 2, 90]);
  assert.equal(client.metadata.taxa.AVES, "AVES");
  const raster = await client.read("arable_0.25", { bounds, taxon: "AVES" });
  assert.equal(Object.getPrototypeOf(raster), Object.prototype);
  assert.ok(raster.data instanceof Float32Array);
  assert.deepEqual([raster.width, raster.height, raster.bands], [6, 3, ["AVES"]]);
  assert.deepEqual(raster.bounds, bounds);
  assert.deepEqual(raster.transform, [RES, 0, -90, 0, -RES, 45]);
  assert.equal(raster.crs, "EPSG:4326");
  assert.equal(raster.units, "extinctions km-2");
  assert.equal(raster.termsOfUse, "Non-commercial use only. IBAT.");
  const expect = bandValues(2, 1);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 6; col++) {
    assert.equal(raster.data[row * 6 + col], expect[(row + 3) * W + col + 6]);
  }
  assert.deepEqual((await client.read("arable_0.25", { window, taxon: "AVES" })).data, raster.data);
  const stack = await client.read("arable_0.25", { window, taxon: null });
  assert.equal(stack.data.length, 5 * raster.data.length);
  assert.deepEqual(stack.data.subarray(2 * 18, 3 * 18), raster.data);
  assert.deepEqual(structuredClone(raster), raster);
});

test("longitude-latitude samples match the raster and keep valid zeros", async () => {
  const client = await open(await makeStore());
  const values = await client.sample("arable_0.25", [[-67.5, 22.5], [-127.5, 37.5], [0, 91]], { taxon: "AVES" });
  assert.equal(values[0], bandValues(2, 1)[4 * W + 7]);
  assert.equal(values[1], 0);
  assert.ok(Number.isNaN(values[2]));
  assert.deepEqual(await client.sample("arable_0.25", []), new Float32Array());
  assert.equal((await client.sample("arable_0.25", [[292.5, 22.5]], { taxon: "AVES" }))[0], values[0]);
  await assert.rejects(client.sample("arable_0.25", [[NaN, 30]]), /finite/);
  const area = await client.read("arable_area_changed", { bounds: [-180, 60, -90, 90], masked: true });
  assert.equal(area.nodata, null);
  assert.equal(area.data[0], 0);
  assert.equal(area.valid![0], 1);
});

test("GeoJSON masks crop to bounds and respect holes, multipolygons and features", async () => {
  const client = await open(await makeStore());
  const polygon: Polygon = { type: "Polygon", coordinates: [
    [[-135, 0], [-45, 0], [-45, 75], [-135, 75], [-135, 0]],
    [[-120, 30], [-90, 30], [-90, 60], [-120, 60], [-120, 30]],
  ] };
  const forms: Region[] = [polygon, { type: "MultiPolygon", coordinates: [polygon.coordinates] },
    { type: "Feature", properties: {}, geometry: polygon },
    { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: polygon }] }];
  let expected;
  for (const geometry of forms) {
    const raster = await client.read("arable_0.25", { geometry, taxon: null });
    assert.deepEqual([raster.width, raster.height], [6, 5]);
    assert.deepEqual(raster.bounds, [-135, 0, -45, 75]);
    // Pixel centres inside the rectangular hole occupy rows 1..2 and columns 1..2.
    const single = new Uint8Array(30).fill(1);
    for (const row of [1, 2]) for (const col of [1, 2]) single[row * 6 + col] = 0;
    for (let band = 0; band < 5; band++) assert.deepEqual(raster.valid!.subarray(band * 30, (band + 1) * 30), single);
    if (expected) assert.deepEqual(raster, expected);
    expected = raster;
  }
  const missing = await client.read("arable_0.25", { geometry: { type: "Polygon", coordinates: [
    [[-180, 60], [-90, 60], [-90, 90], [-180, 90], [-180, 60]],
  ] } });
  assert.equal(missing.valid![0], 0);
  assert.ok(Number.isNaN(missing.data[0]));
  await assert.rejects(client.read("arable_0.25", { geometry: { type: "Polygon", coordinates: [] } }), /nonempty/);
});

test("GeoTIFF round trips values, bands, georeferencing, terms and zero area", async () => {
  const client = await open(await makeStore());
  const raster = await client.read("arable_0.25", { bounds, taxon: null });
  const bytes = await client.download("arable_0.25", { bounds, taxon: null });
  assert.ok(bytes instanceof ArrayBuffer);
  const directory = new DataView(bytes), little = directory.getUint16(0) === 0x4949;
  const offset = directory.getUint32(4, little), count = directory.getUint16(offset, little);
  const tags = Array.from({ length: count }, (_, i) => directory.getUint16(offset + 2 + i * 12, little));
  assert.deepEqual(tags, [...tags].sort((a, b) => a - b));
  const image = await (await fromArrayBuffer(bytes)).getImage();
  const values = await image.readRasters();
  for (let band = 0; band < 5; band++) assert.deepEqual(values[band], raster.data.subarray(band * 18, (band + 1) * 18));
  assert.deepEqual(image.getBoundingBox(), bounds);
  assert.deepEqual(image.getResolution(), [RES, -RES, 0]);
  assert.equal(image.getGeoKeys()!.GeographicTypeGeoKey, 4326);
  assert.ok(Number.isNaN(image.getGDALNoData()));
  assert.equal((await image.getGDALMetadata())!.terms_of_use, "Non-commercial use only. IBAT.");
  assert.equal((await image.getGDALMetadata(2))!.DESCRIPTION, "AVES");
  const area = await (await fromArrayBuffer(await client.download("arable_area_changed", { bounds: [-180, 60, -90, 90] }))).getImage();
  assert.equal(area.getGDALNoData(), null);
  assert.equal((await area.readRasters())[0][0], 0);
  const masked = await client.read("arable_area_changed", { geometry: { type: "Polygon", coordinates: [
    [[-135, 0], [-45, 0], [-45, 75], [-135, 0]],
  ] } });
  const clipped = await (await fromArrayBuffer(toGeoTIFF(masked))).getImage();
  const clippedValues = (await clipped.readRasters())[0];
  for (let i = 0; i < clippedValues.length; i++) {
    if (masked.valid![i]) assert.equal(clippedValues[i], masked.data[i]);
    else assert.ok(Number.isNaN(clippedValues[i]));
  }
});

test("float64 releases retain exact precision through reads, samples and GeoTIFF", async () => {
  const bytes = new Map<string, Uint8Array>();
  const root = zarr.root(bytes);
  await zarr.create(root, { attributes: { version: "1.1~beta1", scenarios: { restore_all: "restoration" },
    curves: { "0.25": "main" }, taxa: { all: "all species" },
    multiscales: { layout: [{ asset: "0", "spatial:shape": [2, 4], "spatial:transform": [90, 0, -180, 0, -90, 90] }] } } });
  await zarr.create(root.resolve("0"));
  const values = Float64Array.of(0.123456789012345, NaN, -0, 1, 2, 3, 4, 5);
  const array = await zarr.create(root.resolve("0/restore_all_0.25"), { dtype: "float64", shape: [1, 2, 4], chunkShape: [1, 2, 4], fillValue: NaN });
  await zarr.set(array, null, { data: values, shape: [1, 2, 4], stride: [8, 4, 1] });
  const client = await open(bytes);
  const raster = await client.read("restore_all_0.25", { bounds: [-180, -90, 180, 90] });
  assert.deepEqual(raster.data, values);
  const samples = await client.sample("restore_all_0.25", [[-135, 45]]);
  assert.ok(samples instanceof Float64Array);
  assert.equal(samples[0], values[0]);
  const image = await (await fromArrayBuffer(toGeoTIFF(raster))).getImage();
  assert.deepEqual((await image.readRasters())[0], values);
});

test("GeoTIFF keeps long metadata beyond the writer's fixed header", async () => {
  const client = await open(await makeStore());
  const raster = await client.read("arable_0.25", { bounds });
  const terms = "Full IBAT terms. ".repeat(300);
  const image = await (await fromArrayBuffer(toGeoTIFF({ ...raster, termsOfUse: terms }))).getImage();
  assert.equal((await image.getGDALMetadata())!.terms_of_use, terms);
  assert.deepEqual((await image.readRasters())[0], raster.data);
});

test("region validation and metadata failures are explicit", async () => {
  const bytes = await makeStore();
  const client = await open(bytes);
  await assert.rejects(client.read("arable_0.25", {} as ReadOptions), /exactly one/);
  await assert.rejects(client.read("arable_0.25", { bounds, window } as unknown as ReadOptions), /exactly one/);
  await assert.rejects(client.read("arable_0.25", { window: [0.5, 0, 1, 1] }), /integer/);
  await assert.rejects(client.read("arable_0.25", { window: [W, H, W + 1, H + 1] }), /overlap/);
  const clipped = await client.read("arable_0.25", { window: [-1, -1, 1, 1] });
  assert.deepEqual([clipped.width, clipped.height], [1, 1]);
  const root = JSON.parse(new TextDecoder().decode(bytes.get("/zarr.json")));
  delete root.attributes.scenarios;
  bytes.set("/zarr.json", new TextEncoder().encode(JSON.stringify(root)));
  await assert.rejects(open(bytes), /scenario descriptions/);
  await assert.rejects(open(bytes, { version: "1.01" }), /source or version/);
});

test("catalogue releases and named version selection use plain objects", async () => {
  const bytes = await makeStore();
  const manifest = { latest: "0.9", versions: { "0.9": { path: "v0.9" }, "0.10": { path: "v0.10" } } };
  const customFetch = async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("versions.json")) return Response.json(manifest);
    const value = bytes.get(url.pathname.replace("/v0.9", ""));
    return new Response(value ? new Uint8Array(value).buffer : null, { status: value ? 200 : 404 });
  };
  const entries = await versions("https://example.org", { fetch: customFetch });
  assert.deepEqual(entries.map((entry) => [entry.version, entry.latest]), [["0.9", true], ["0.10", false]]);
  const client = await open(undefined, { version: "0.9", catalogue: "https://example.org", fetch: customFetch });
  assert.equal(client.metadata.source, "https://example.org/v0.9");
  assert.equal(client.metadata.version, "0.9");
});

test("catalogue orders beta release numbers and preserves the latest flag", async () => {
  const names = ["1.1~beta10", "0.10", "1.01", "1.1~beta2", "0.9"];
  const manifest = { latest: "1.01", versions: Object.fromEntries(names.map((name) => [name, { path: `v${name}` }])) };
  const entries = await versions("https://example.org", { fetch: async () => Response.json(manifest) });
  assert.deepEqual(entries.map((entry) => entry.version), ["0.9", "0.10", "1.01", "1.1~beta2", "1.1~beta10"]);
  assert.deepEqual(entries.filter((entry) => entry.latest).map((entry) => entry.version), ["1.01"]);
  assert.deepEqual(await versions("https://example.org", { fetch: async () => Response.json({ versions: {} }) }), []);
});

test("AbortSignal reaches chunk requests; cancelled reads do not poison cached retries", async () => {
  const bytes = await makeStore();
  let ready!: () => void;
  const started = new Promise<void>((resolve) => { ready = resolve; });
  let delay = true, chunks = 0;
  const client = await open("https://example.org", { fetch: async (request) => {
    const path = new URL(request.url).pathname;
    if (path.includes("/c/")) {
      chunks++;
      if (delay) {
        ready();
        await new Promise((_, reject) => request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true }));
      }
    }
    const value = bytes.get(path);
    return new Response(value ? new Uint8Array(value).buffer : null, { status: value ? 200 : 404 });
  } });
  const controller = new AbortController();
  const pending = client.read("arable_0.25", { window: [0, 1, 1, 2], signal: controller.signal });
  const cancelled = assert.rejects(pending, { name: "AbortError" });
  await started;
  controller.abort();
  await cancelled;
  delay = false;
  const raster = await client.read("arable_0.25", { window: [0, 1, 1, 2] });
  assert.equal(raster.data[0], bandValues(0, 1)[W]);
  const after = chunks;
  await client.read("arable_0.25", { window: [0, 1, 1, 2] });
  assert.equal(chunks, after);
  await assert.rejects(client.read("arable_0.25", { bounds, signal: controller.signal }), { name: "AbortError" });
  await assert.rejects(client.sample("arable_0.25", [[0, 0]], { signal: controller.signal }), { name: "AbortError" });
  await assert.rejects(client.download("arable_0.25", { bounds, signal: controller.signal }), { name: "AbortError" });
  await assert.rejects(open(undefined, { signal: controller.signal }), { name: "AbortError" });
});
