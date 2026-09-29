import assert from "node:assert/strict";
import { test } from "node:test";
import { open, makeBlend, makeScale, paintTile, pickLevel, tileLats, tileLons } from "../src/index.js";
import { makeStore } from "./synthetic.js";

test("tile maths", () => {
  const la = tileLats(0, 0);
  assert.ok(Math.abs(la[0]! - 85.05) < 0.1 && Math.abs(la[255]! + 85.05) < 0.1);
  const lo = tileLons(1, 1);
  assert.ok(lo[0]! > 0 && lo[255]! < 180);
  const levels = [1, 2, 4, 8, 16], res = 1 / 60;
  assert.deepEqual([0, 3, 4, 5, 6].map((z) => pickLevel(z, levels, res)), [16, 8, 4, 2, 1]);
  assert.equal(pickLevel(0, levels, res, 256, 85), 4);
});

test("paint tiles with a scale and with a blend", async () => {
  const client = await open(await makeStore());
  const layer = "arable_0.25";
  const scale = makeScale({ vmax: 1e-4 });
  const img = await paintTile(client, layer, { z: 1, x: 1, y: 0, scale });
  assert.deepEqual([img.width, img.height, img.data.length], [256, 256, 256 * 256 * 4]);
  let painted = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i]) painted++;
  assert.ok(painted > 1000, `painted ${painted}`);
  const blend = makeBlend({ vmaxes: [1e-4, 1e-4, 1e-4, 1e-4] });
  const bl = await paintTile(client, layer, { z: 1, x: 1, y: 0, blend });
  let bpainted = 0;
  for (let i = 3; i < bl.data.length; i += 4) if (bl.data[i]) bpainted++;
  assert.ok(bpainted > 1000, `blend painted ${bpainted}`);
  const forced = await paintTile(client, layer, { z: 1, x: 1, y: 0, scale, level: 2 }); // an explicit overview level
  assert.equal(forced.data.length, 256 * 256 * 4);
  await assert.rejects(paintTile(client, layer, { z: 1, x: 1, y: 0, scale, size: 0 }), RangeError);
});
