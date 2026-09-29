import { type Bounds, type Client, type Region } from "../../src/index.js";

/** Mask a GeoJSON polygon and calculate the mean of its valid values. */
export async function maskPolygon(client: Client, bounds: Bounds = [43, -26, 51, -12]) {
  const [west, south, east, north] = bounds;
  const geometry: Region = { type: "Polygon", coordinates: [
    [[west, south], [east, south], [west, north], [west, south]],
  ] };
  const raster = await client.read("arable_0.25", { geometry });
  let total = 0, count = 0;
  for (let i = 0; i < raster.data.length; i++) if (raster.valid![i]) { total += raster.data[i]; count++; }
  console.log(`${count} valid pixels; mean ${count ? total / count : NaN} ${raster.units}`);
  return raster;
}
