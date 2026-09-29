# 2. Sample points

`sample()` accepts longitude-latitude pairs and returns a typed array. The
example converts it to an ordinary array before writing JSON. NaN becomes null.

```sh
npm run example -- sample
```

Read [sample-points.ts](sample-points.ts), then [mask a polygon](../3-mask-polygon/README.md).
