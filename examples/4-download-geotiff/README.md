# 4. Download a GeoTIFF

`download()` returns an ArrayBuffer containing a GeoTIFF. It preserves the
values, CRS, transform, units, band labels, citation, and data terms.
Files are uncompressed. The Node runner refuses to overwrite an existing file.

```sh
npm run example -- download
```

In a browser, make a Blob with `new Blob([bytes], { type: "image/tiff" })`
and save it through a download link. Read [download-geotiff.ts](download-geotiff.ts),
then [draw on a canvas](../5-canvas/README.md).
