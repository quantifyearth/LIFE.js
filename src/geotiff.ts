/** Export LIFE typed arrays to a standard GeoTIFF with geotiff.js. */

import { writeArrayBuffer, type GeotiffWriterMetadata } from "geotiff";
import type { Raster } from "./client.js";

function xml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!)
    .replace(/[^\x00-\x7f]/gu, (c) => `&#${c.codePointAt(0)};`);
}

function appendMetadata(bytes: ArrayBuffer, metadata: string): ArrayBuffer {
  // geotiff.js reserves only 1000 bytes for its metadata header. Append the
  // GDAL XML after the library's image and repoint a reserved ASCII tag.
  const text = new TextEncoder().encode(metadata + "\0");
  const output = new Uint8Array(bytes.byteLength + text.length);
  output.set(new Uint8Array(bytes));
  output.set(text, bytes.byteLength);
  const view = new DataView(output.buffer);
  const little = view.getUint16(0) === 0x4949;
  const ifd = view.getUint32(4, little);
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (view.getUint16(entry, little) === 270) {
      view.setUint16(entry, 42112, little); // GDAL_METADATA, ASCII.
      view.setUint32(entry + 4, text.length, little);
      view.setUint32(entry + 8, bytes.byteLength, little);
      // TIFF directory entries must remain sorted by tag number.
      const entries = Array.from({ length: count }, (_, index) => {
        const offset = ifd + 2 + index * 12;
        return { tag: view.getUint16(offset, little), bytes: output.slice(offset, offset + 12) };
      }).sort((a, b) => a.tag - b.tag);
      entries.forEach((item, index) => output.set(item.bytes, ifd + 2 + index * 12));
      return output.buffer;
    }
  }
  throw new Error("GeoTIFF writer omitted the reserved metadata tag");
}

/** Return uncompressed GeoTIFF bytes with dtype, CRS, pixel placement, band labels, units, citation, and data terms. */
export function toGeoTIFF(raster: Raster, options: { signal?: AbortSignal } = {}): ArrayBuffer {
  options.signal?.throwIfAborted();
  const size = raster.width * raster.height, count = raster.bands.length;
  if (![raster.width, raster.height].every((n) => Number.isInteger(n) && n > 0) || !count || raster.data.length !== size * count ||
      (raster.valid && raster.valid.length !== raster.data.length)) throw new RangeError("raster dimensions do not match its values");
  if (raster.data.length > 16_000_000) throw new RangeError("the raster is too large for one GeoTIFF; split the region");
  const [a, b, c, d, e, f] = raster.transform;
  if (raster.crs !== "EPSG:4326" || !raster.transform.every(Number.isFinite) || b !== 0 || d !== 0 || a <= 0 || e >= 0) {
    throw new RangeError("GeoTIFF export requires a north-up EPSG:4326 raster");
  }
  const values = raster.data instanceof Float64Array ? new Float64Array(size * count) : new Float32Array(size * count);
  let invalid = false;
  for (let pixel = 0; pixel < size; pixel++) {
    for (let band = 0; band < count; band++) {
      const input = band * size + pixel;
      const masked = raster.valid !== undefined && raster.valid[input] === 0;
      values[pixel * count + band] = masked ? NaN : raster.data[input];
      invalid ||= masked;
    }
  }
  const tags: Record<string, string> = { layer: raster.layer, version: raster.version, source: raster.source,
    resolution_factor: String(raster.level), units: raster.units, description: raster.description,
    citation: raster.citation ?? "", terms_of_use: raster.termsOfUse ?? "" };
  const items = Object.entries(tags).map(([name, value]) => `<Item name="${name}">${xml(value)}</Item>`);
  raster.bands.forEach((band, index) => {
    items.push(`<Item name="DESCRIPTION" sample="${index}" role="description">${xml(band)}</Item>`);
    items.push(`<Item name="UNITTYPE" sample="${index}" role="unittype">${xml(raster.units)}</Item>`);
  });
  const metadata: GeotiffWriterMetadata & { ImageDescription: string } = {
    width: raster.width, height: raster.height, BitsPerSample: Array(count).fill(values.BYTES_PER_ELEMENT * 8),
    SampleFormat: Array(count).fill(3), SamplesPerPixel: count, PhotometricInterpretation: 1,
    ExtraSamples: Array(Math.max(0, count - 1)).fill(0), Compression: 1,
    ModelPixelScale: [a, -e, 0], ModelTiepoint: [0, 0, 0, c, f, 0],
    GTModelTypeGeoKey: 2, GTRasterTypeGeoKey: 1, GeographicTypeGeoKey: 4326,
    ImageDescription: " ",
    ...(raster.nodata !== null || invalid ? { GDAL_NODATA: "nan" } : {}),
  };
  const bytes = appendMetadata(writeArrayBuffer(values, metadata), `<GDALMetadata>${items.join("")}</GDALMetadata>`);
  options.signal?.throwIfAborted();
  return bytes;
}
