import { writeFile } from "node:fs/promises";
import { open } from "../src/index.js";
import { readRegion } from "./1-read-region/read-region.js";
import { samplePoints } from "./2-sample-points/sample-points.js";
import { maskPolygon } from "./3-mask-polygon/mask-polygon.js";
import { downloadGeoTIFF } from "./4-download-geotiff/download-geotiff.js";

const step = process.argv[2];
if (!["read", "sample", "mask", "download"].includes(step)) throw new Error("choose read, sample, mask, or download");
const client = await open(process.argv[3]);
if (step === "read") await readRegion(client);
if (step === "sample") await samplePoints(client);
if (step === "mask") await maskPolygon(client);
if (step === "download") {
  const bytes = await downloadGeoTIFF(client);
  const output = process.argv[4] ?? "region.tif";
  await writeFile(output, new Uint8Array(bytes), { flag: "wx" });
  console.log(`Saved ${output}`);
}
