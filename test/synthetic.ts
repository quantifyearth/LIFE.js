// A tiny in-memory store with the converter's layout, mirroring the Python test fixture.
import * as zarr from "zarrita";

export const W = 24, H = 12, RES = 15;
export const TAXA = ["all", "AMPHIBIA", "AVES", "MAMMALIA", "REPTILIA"];

export function bandValues(band: number, sign: number): Float32Array {
  const v = new Float32Array(H * W);
  for (let i = 0; i < H * W; i++) v[i] = sign * (band + 1) * (i + 1) * 1e-6;
  for (let c = 0; c < W; c++) v[c] = NaN; // a NaN row
  v[3 * W + 3] = 0;
  return v;
}

function downsample2(a: Float32Array, h: number, w: number): Float32Array {
  const out = new Float32Array((h / 2) * (w / 2));
  for (let r = 0; r < h / 2; r++) for (let c = 0; c < w / 2; c++) {
    let s = 0, n = 0;
    for (const [dr, dc] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
      const v = a[(2 * r + dr!) * w + 2 * c + dc!]!;
      if (Number.isFinite(v)) { s += v; n++; }
    }
    out[r * (w / 2) + c] = n ? s / n : NaN;
  }
  return out;
}

function levelEntry(asset: string, factor: number, derived?: string) {
  const res = RES * factor;
  return {
    asset, ...(derived && { derived_from: derived, resampling_method: "average" }),
    transform: { scale: derived ? [2, 2] : [1, 1], translation: [0, 0] },
    "spatial:transform": [res, 0, -180, 0, -res, 90], "spatial:shape": [H / factor, W / factor],
  };
}

export async function makeStore(): Promise<Map<string, Uint8Array>> {
  const store = new Map<string, Uint8Array>();
  const root = zarr.root(store);
  await zarr.create(root, { attributes: {
    version: "0.9",
    references: "Test citation.",
    terms_of_reference: "Non-commercial use only. IBAT.",
    scenarios: { arable: "conversion", restore: "reversion" },
    curves: { "0.25": "main", gompertz: "gompertz" },
    taxa: Object.fromEntries(TAXA.map((t) => [t, t])),
    data_model: { overviews: "Averages for display; use level 1 for totals." },
    multiscales: { layout: [levelEntry("0", 1), levelEntry("1", 2, "0")], resampling_method: "average" },
  } });
  for (const [asset, factor] of [["0", 1], ["1", 2]] as const) {
    const rows = H / factor, cols = W / factor;
    await zarr.create(root.resolve(asset), { attributes: { factor, "spatial:transform": [RES * factor, 0, -180, 0, -RES * factor, 90] } });
    const lat = await zarr.create(root.resolve(`${asset}/lat`), { shape: [rows], chunkShape: [rows], dtype: "float64", fillValue: 0 });
    await zarr.set(lat, null, { data: Float64Array.from({ length: rows }, (_, i) => 90 - (i + 0.5) * RES * factor), shape: [rows], stride: [1] });
    const lon = await zarr.create(root.resolve(`${asset}/lon`), { shape: [cols], chunkShape: [cols], dtype: "float64", fillValue: 0 });
    await zarr.set(lon, null, { data: Float64Array.from({ length: cols }, (_, i) => -180 + (i + 0.5) * RES * factor), shape: [cols], stride: [1] });
    for (const [scenario, sign] of [["arable", 1], ["restore", -1]] as const) {
      for (const curve of ["0.25", "gompertz"]) {
        const data = new Float32Array(5 * rows * cols);
        for (let b = 0; b < 5; b++) data.set(factor === 1 ? bandValues(b, sign) : downsample2(bandValues(b, sign), H, W), b * rows * cols);
        const a = await zarr.create(root.resolve(`${asset}/${scenario}_${curve}`), { shape: [5, rows, cols], chunkShape: [1, 5, 5], dtype: "float32", fillValue: NaN,
          attributes: { units: "extinctions km-2", long_name: `${scenario} ${curve}`, curve, scenario, kind: "life", taxon_labels: TAXA, source_bands: TAXA } });
        await zarr.set(a, null, { data, shape: [5, rows, cols], stride: [rows * cols, cols, 1] });
      }
      let area: Float32Array = bandValues(0, 1).map((v) => (Number.isFinite(v) ? Math.abs(v) * 1e9 : 0));
      if (factor > 1) area = downsample2(area, H, W);
      const b = await zarr.create(root.resolve(`${asset}/${scenario}_area_changed`), { shape: [rows, cols], chunkShape: [5, 5], dtype: "float32", fillValue: 0,
        attributes: { units: "m2", kind: "area", scenario } });
      await zarr.set(b, null, { data: area, shape: [rows, cols], stride: [cols, 1] });
    }
  }
  return store;
}
