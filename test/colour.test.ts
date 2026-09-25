import assert from "node:assert/strict";
import { test } from "node:test";
import { makeBlend, makeScale, percentileAbs } from "../src/index.js";

test("scale endpoints and hiding", () => {
  const s = makeScale({ vmax: 1e-4 });
  assert.equal(s.index(0), Math.round((s.n - 1) / 2));
  assert.equal(s.index(1e-4), s.n - 1);
  assert.equal(s.index(-1e-4), 0);
  assert.equal(s.index(5), s.n - 1);
  assert.deepEqual(s.rgba(0), [0, 0, 0, 0]);
  assert.equal(s.rgba(0, false)[3], 255);
  assert.deepEqual(s.rgba(NaN), [0, 0, 0, 0]);
  const px = s.render([1e-4, -1e-4, 0, NaN]);
  assert.equal(px.length, 16);
  assert.deepEqual([...px.subarray(0, 3)], [...s.lut.subarray((s.n - 1) * 4, (s.n - 1) * 4 + 3)]);
  assert.equal(px[11], 0);
  const q = makeScale({ vmax: 10, mode: "linear", polarity: "sequential" });
  assert.equal(q.index(0), 0);
  assert.equal(q.index(5), Math.round((q.n - 1) / 2));
  assert.equal(q.index(-3), 0);
  assert.equal(q.legend(64).length, 256);
  assert.deepEqual(q.ticks(), { min: 0, max: 10 });
  assert.throws(() => makeScale({ vmax: 0 }), RangeError);
});

test("percentileAbs", () => {
  assert.equal(percentileAbs([NaN, 0, -1, 2, 3, 4, 100], 50), 3);
  assert.equal(percentileAbs([NaN, 0], 99), 1);
  assert.throws(() => percentileAbs([1], -1), RangeError);
  assert.throws(() => makeScale({ vmax: 1, n: 1 }), RangeError);
});

test("blend semantics", () => {
  const b = makeBlend({ vmaxes: [1, 1, 1, 1], mode: "linear" });
  const rgb = (v: number[]) => b.rgba(v).slice(0, 3);
  assert.deepEqual(rgb([1, 0, 0, 0]), [...b.swatches.AMPHIBIA!]);
  assert.deepEqual(rgb([0.2, 0, 0, 0]), [...b.swatches.AMPHIBIA!]);
  assert.deepEqual(rgb([1, 1, 1, 1]), [...b.black]);
  assert.deepEqual(rgb([0.3, 0.3, 0.3, 0.3]), [...b.black]);
  assert.ok(Math.max(...b.black) < 25);
  assert.deepEqual(rgb([0.5, 0.5, 0, 0]), [...b.pairs["AMPHIBIA+AVES"]!]);
  assert.equal(b.rgba([0, 0, 0, 0])[3], 0);
  assert.equal(b.rgba([-1, -1, -1, -1])[3], 0);
  assert.equal(b.rgba([1, 0, 0, 0])[3], 255);
  assert.equal(b.rgba([0.2, 0, 0, 0])[3], Math.round(255 * 0.2 ** 0.3));
  assert.ok(b.rgba([1, 0.5, 0.5, 0.5])[1] > 0.8 * b.swatches.AMPHIBIA![1]);
  for (let ch = 0; ch < 3; ch++) {
    const prod = b.names.reduce((p, n) => p * b.inks[n]![ch]!, 1);
    assert.ok(Math.abs(prod - b.floor) < 1e-9);
  }
  const r = makeBlend({ vmaxes: [1e-4, 1e-4, 1e-4, 1e-4], direction: -1 });
  assert.equal(r.rgba([-1e-4, 0, 0, 0])[3], 255);
  assert.equal(r.rgba([1e-4, 0, 0, 0])[3], 0);
  // render() over band-major data agrees with rgba() per pixel
  const bands = new Float32Array([1, 0.5, NaN, 0, 0, 0.5, NaN, 0, 0, 0, NaN, 0, 0, 0, NaN, 1]);
  const img = b.render(bands, 4);
  for (let p = 0; p < 4; p++) assert.deepEqual([...img.subarray(p * 4, p * 4 + 4)], [...b.rgba([bands[p]!, bands[4 + p]!, bands[8 + p]!, bands[12 + p]!])]);
});
