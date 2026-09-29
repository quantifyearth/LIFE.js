import { makeScale, percentileAbs, type Bounds, type Client } from "../../src/index.js";

/** Draw a bounded raster on an existing canvas. */
export async function drawRegion(canvas: HTMLCanvasElement, client: Client, bounds: Bounds = [43, -26, 51, -12]) {
  const raster = await client.read("arable_0.25", { bounds });
  const scale = makeScale({ vmax: percentileAbs(raster.data, 99) });
  canvas.width = raster.width;
  canvas.height = raster.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas has no 2D context");
  context.putImageData(new ImageData(scale.render(raster.data) as Uint8ClampedArray<ArrayBuffer>, raster.width, raster.height), 0, 0);
  return raster;
}
