# 3. Mask a polygon

Pass a GeoJSON Polygon or MultiPolygon to `read()`. Geometry coordinates are
WGS84 longitude-latitude pairs. The result is cropped to the polygon bounds.
Its `valid` array contains 1 for valid values and 0 outside the polygon or
where a score is missing. Polygon holes are excluded, and boundaries are included.
The underlying values remain unchanged.

```sh
npm run example -- mask
```

Read [mask-polygon.ts](mask-polygon.ts), then [download a GeoTIFF](../4-download-geotiff/README.md).
