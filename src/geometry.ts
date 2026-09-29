/** Read standard GeoJSON polygons with Turf's pixel-centre inclusion rules. */

import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { Bounds, Raster } from "./client.js";

/** A GeoJSON polygon, multi-polygon, polygon feature, or collection of polygon features in WGS84. */
export type Region = Polygon | MultiPolygon | Feature<Polygon | MultiPolygon> | FeatureCollection<Polygon | MultiPolygon>;

export function polygons(region: Region): (Polygon | MultiPolygon)[] {
  const shapes = region.type === "FeatureCollection" ? region.features.map((f) => f.geometry)
    : region.type === "Feature" ? [region.geometry] : [region];
  if (!shapes.length) throw new RangeError("geometry must contain nonempty polygons");
  for (const shape of shapes) {
    if (!shape || (shape.type !== "Polygon" && shape.type !== "MultiPolygon")) {
      throw new TypeError("geometry must contain polygons or multipolygons");
    }
    const parts = shape.type === "Polygon" ? [shape.coordinates] : shape.coordinates;
    if (!parts.length) throw new RangeError("geometry must contain nonempty polygons");
    for (const rings of parts) {
      if (!rings.length) throw new RangeError("geometry must contain nonempty polygons");
      for (const ring of rings) {
        if (ring.length < 4 || ring[0][0] !== ring.at(-1)![0] || ring[0][1] !== ring.at(-1)![1]) {
          throw new RangeError("polygon rings must contain at least four positions and be closed");
        }
        for (const xy of ring) {
          if (xy.length < 2 || !Number.isFinite(xy[0]) || !Number.isFinite(xy[1]) ||
              xy[0] < -180 || xy[0] > 180 || xy[1] < -90 || xy[1] > 90) {
            throw new RangeError("GeoJSON positions must be finite longitude, latitude pairs in WGS84");
          }
        }
      }
    }
  }
  return shapes;
}

export function geometryBounds(shapes: readonly (Polygon | MultiPolygon)[]): Bounds {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const shape of shapes) {
    const rings = shape.type === "Polygon" ? shape.coordinates : shape.coordinates.flat();
    for (const ring of rings) for (const [x, y] of ring) {
      west = Math.min(west, x); east = Math.max(east, x);
      south = Math.min(south, y); north = Math.max(north, y);
    }
  }
  return [west, south, east, north];
}

export function mask(raster: Raster, shapes?: readonly (Polygon | MultiPolygon)[], signal?: AbortSignal): Uint8Array {
  const valid = new Uint8Array(raster.data.length);
  const size = raster.width * raster.height;
  const [a, , c, , e, f] = raster.transform;
  for (let row = 0; row < raster.height; row++) {
    signal?.throwIfAborted();
    for (let col = 0; col < raster.width; col++) {
      const inside = !shapes || shapes.some((polygon) => booleanPointInPolygon([c + (col + 0.5) * a, f + (row + 0.5) * e], polygon));
      const pixel = row * raster.width + col;
      for (let band = 0; band < raster.bands.length; band++) {
        const i = band * size + pixel;
        valid[i] = inside && Number.isFinite(raster.data[i]) ? 1 : 0;
      }
    }
  }
  return valid;
}
