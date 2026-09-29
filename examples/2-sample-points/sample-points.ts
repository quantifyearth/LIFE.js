import { type Client, type Point } from "../../src/index.js";

/** Sample longitude-latitude pairs and write their scores as JSON. */
export async function samplePoints(client: Client, points: readonly Point[] = [[47, -19.5], [12, 6], [114, 0]]) {
  const values = await client.sample("arable_0.25", points, { taxon: "AVES" });
  console.log(JSON.stringify(Array.from(values)));
  return values;
}
