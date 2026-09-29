# 1. Read a region

`read()` returns a plain object containing a typed array, pixel dimensions,
bounds, transform, and units. The example calculates a regional mean directly.
NaN scores are omitted; zero scores remain valid.

```sh
npm run example -- read
```

Read [read-region.ts](read-region.ts), then [sample points](../2-sample-points/README.md).
