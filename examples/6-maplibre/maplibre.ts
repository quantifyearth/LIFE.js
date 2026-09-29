import { LifeMapLayer, LifeProtocol, makeBlend, percentileAbs, type Client, type MapLike, type MapLibreLike } from "../../src/index.js";

/** Add LIFE to a MapLibre map after its style has loaded. */
export async function showMap(map: MapLike, maplibre: MapLibreLike, client: Client) {
  const level = client.metadata.levels.at(-1)!.factor;
  const raster = await client.read("arable_0.25", { bounds: client.metadata.bounds, taxon: null, level });
  const size = raster.width * raster.height;
  const vmaxes = raster.bands.slice(1).map((_, band) => percentileAbs(raster.data.subarray((band + 1) * size, (band + 2) * size), 99));
  const blend = makeBlend({ vmaxes });
  const protocol = new LifeProtocol().install(maplibre);
  const layer = new LifeMapLayer(map, protocol, { client, layer: "arable_0.25", blend }, { opacity: 0.85 });
  return { layer, protocol };
}
