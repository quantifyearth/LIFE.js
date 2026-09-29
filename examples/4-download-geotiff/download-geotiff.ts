import { type Bounds, type Client } from "../../src/index.js";

/** Download a region as GeoTIFF bytes that a browser or Node can save. */
export async function downloadGeoTIFF(client: Client, bounds: Bounds = [43, -26, 51, -12]) {
  const bytes = await client.download("restore_0.25", { bounds });
  console.log(`${bytes.byteLength} GeoTIFF bytes`);
  return bytes;
}
