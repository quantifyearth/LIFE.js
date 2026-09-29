/** Catalogues: `versions.json` manifests that list released stores. */

import { DEFAULT_CATALOGUE, LifeStore } from "./store.js";

export const MANIFEST = "versions.json";

/** One released store listed in a catalogue. */
export interface Release {
  readonly version: string;
  readonly path: string;
  /** The store location, resolved against the catalogue base. */
  readonly url: string;
  readonly released?: string;
  readonly doi?: string;
  readonly description?: string;
}

export interface CatalogueOptions {
  /** Fetch and parse a JSON document; defaults to the global `fetch`. */
  readonly fetchJson?: (url: string) => Promise<unknown>;
  /** Open a store by URL; defaults to `LifeStore.open`. */
  readonly open?: (url: string) => Promise<LifeStore>;
}

interface Manifest {
  latest?: string;
  versions: Record<string, { path: string; released?: string; doi?: string; description?: string }>;
}

/** Compare numeric parts of release names numerically, including beta numbers. */
export function compareVersions(a: string, b: string): number {
  const pa = a.match(/[0-9]+|[^0-9]+/g) ?? [], pb = b.match(/[0-9]+|[^0-9]+/g) ?? [];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (i >= pa.length) return -1;
    if (i >= pb.length) return 1;
    const x = pa[i], y = pb[i];
    const c = /^[0-9]+$/.test(x) && /^[0-9]+$/.test(y) ? Number(x) - Number(y) : x.localeCompare(y);
    if (c !== 0) return c;
  }
  return 0;
}

function join(base: string, path: string): string {
  return new URL(path, base.endsWith("/") ? base : base + "/").href;
}

/**
 * A set of released stores described by a `versions.json` manifest.
 *
 * The manifest lives directly under `base`, a URL, and maps version strings
 * to relative store paths. With no argument the published catalogue on
 * source.coop is used. It is fetched once, when first needed.
 */
export class Catalogue {
  private manifest: Promise<Manifest> | null = null;
  private readonly fetchJson: (url: string) => Promise<unknown>;
  private readonly opener: (url: string) => Promise<LifeStore>;

  constructor(readonly base: string = DEFAULT_CATALOGUE, opts: CatalogueOptions = {}) {
    this.fetchJson = opts.fetchJson ?? (async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); });
    this.opener = opts.open ?? ((url) => LifeStore.open(url));
  }

  private load(): Promise<Manifest> {
    if (!this.manifest) {
      this.manifest = this.fetchJson(join(this.base, MANIFEST)).then((m) => {
        if (!m || typeof m !== "object" || !("versions" in m)) throw new Error(`${this.base}/${MANIFEST} is not a catalogue manifest`);
        return m as Manifest;
      });
    }
    return this.manifest;
  }

  /** Every release in version order. */
  async releases(): Promise<Release[]> {
    const m = await this.load();
    return Object.entries(m.versions)
      .map(([version, info]) => {
        const r: Release = { version, path: info.path, url: join(this.base, info.path),
          ...(info.released !== undefined && { released: info.released }),
          ...(info.doi !== undefined && { doi: info.doi }),
          ...(info.description !== undefined && { description: info.description }) };
        return r;
      })
      .sort((a, b) => compareVersions(a.version, b.version));
  }

  /** The release called `version`; throws if absent. */
  async release(version: string): Promise<Release> {
    const all = await this.releases();
    const r = all.find((x) => x.version === version);
    if (!r) throw new Error(`version ${version} is not in ${this.base}; have ${all.map((x) => x.version).join(", ")}`);
    return r;
  }

  /** The release the manifest marks as latest, else the highest version. */
  async latest(): Promise<Release> {
    const m = await this.load();
    if (m.latest !== undefined) return this.release(m.latest);
    const all = await this.releases();
    return all[all.length - 1]!;
  }

  /** Open the store for `version`, or the latest release when omitted. */
  async open(version?: string): Promise<LifeStore> {
    const r = version === undefined ? await this.latest() : await this.release(version);
    return this.opener(r.url);
  }
}
