import { type Bounds, type Client } from "../../src/index.js";

/** Read a region and calculate its mean score with a typed array. */
export async function readRegion(client: Client, bounds: Bounds = [43, -26, 51, -12]) {
  const raster = await client.read("arable_0.25", { bounds, taxon: "AVES" });
  let total = 0, count = 0;
  for (const value of raster.data) if (Number.isFinite(value)) { total += value; count++; }
  console.log(`${raster.width} x ${raster.height} pixels; mean ${count ? total / count : NaN} ${raster.units}`);
  return raster;
}
