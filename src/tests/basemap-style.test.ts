import { describe, test, expect } from 'vitest';
import { readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildBasemapStyle,
  parseBasemapManifest,
  collectFontstacks,
  basemapManifestUrl,
  VENDORED_FONTSTACKS,
  VENDORED_GLYPH_RANGES,
  FIELD_DETAIL_MINZOOM,
  DEFAULT_REGION,
  type BasemapManifest,
} from '../basemap-style.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const MANIFEST: BasemapManifest = {
  regions: {
    wa: {
      archive: 'wa-20260801.pmtiles',
      bytes: 238283859,
      maxzoom: 14,
      attribution: '© OpenStreetMap contributors · Protomaps',
    },
  },
};

describe('manifest parsing', () => {
  test('accepts a well-formed manifest', () => {
    expect(parseBasemapManifest(MANIFEST).regions.wa?.archive).toBe('wa-20260801.pmtiles');
  });

  test('rejects payloads that would fail later inside MapLibre', () => {
    expect(() => parseBasemapManifest(null)).toThrow(/regions/);
    expect(() => parseBasemapManifest({})).toThrow(/regions/);
    expect(() => parseBasemapManifest({ regions: { wa: {} } })).toThrow(/archive/);
    expect(() => parseBasemapManifest({ regions: { wa: { archive: '' } } })).toThrow(/archive/);
  });

  test('manifest lives under the tiles Alias, not the page tree', () => {
    expect(basemapManifestUrl()).toBe('/basemap/tiles/manifest.json');
  });
});

const ORIGIN = 'https://beeatlas.net';

describe('style construction', () => {
  const style = buildBasemapStyle(MANIFEST, { origin: ORIGIN });

  test('is a v8 style with layers', () => {
    expect(style.version).toBe(8);
    expect(style.layers.length).toBeGreaterThan(50);
  });

  test('sources the archive through the pmtiles protocol', () => {
    const src = style.sources.protomaps as { type: string; url: string; attribution: string };
    expect(src.type).toBe('vector');
    expect(src.url).toBe(`pmtiles://${ORIGIN}/basemap/tiles/wa-20260801.pmtiles`);
    // ODbL requires attribution; it must survive into the rendered map.
    expect(src.attribution).toMatch(/OpenStreetMap/);
  });

  test('asset URLs are absolute — MapLibre v6 rejects a relative sprite', () => {
    // "Invalid sprite URL, must be absolute" is a hard error in v6, and it only
    // surfaces when a map is actually constructed — no unit test of the object
    // shape catches it, so pin the absolute form here.
    expect(style.glyphs).toBe(`${ORIGIN}/basemap/fonts/{fontstack}/{range}.pbf`);
    expect(style.sprite).toBe(`${ORIGIN}/basemap/sprites/light`);
  });

  test('every URL is same-origin — nothing phones home', () => {
    // Stronger than "no mapbox": assert that no host other than our own appears
    // anywhere in the style, so a future theme bump cannot smuggle a CDN in.
    const hosts = new Set<string>();
    for (const m of JSON.stringify(style).matchAll(/https?:\/\/[^"'\\/]+/g)) hosts.add(m[0]);
    expect([...hosts]).toEqual([ORIGIN]);
    expect(JSON.stringify(style)).not.toMatch(/mapbox/i);
  });

  test('unknown region fails loudly', () => {
    expect(() => buildBasemapStyle(MANIFEST, { region: 'bc' })).toThrow(/no region "bc"/);
  });

  test('theme resolved to real colors, not nulls', () => {
    // protomaps-themes-base v4.5 layers() takes a theme OBJECT; passing the name
    // string instead yields null colors and MapLibre rejects the whole style at
    // runtime. Two traps here, both of which produced a green-but-worthless test
    // on the way in: the bad values land as ARRAY ELEMENTS inside ["case", …]
    // expressions, so a /:null/ regex never matches; and they are `undefined`,
    // which only LOOKS like null because JSON.stringify renders array holes as
    // null. Walk the structure and reject both.
    const nullPaths: string[] = [];
    const walk = (v: unknown, path: string): void => {
      if (v === null || v === undefined) { nullPaths.push(path); return; }
      if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
      if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
      }
    };
    walk(style.layers, 'layers');
    expect(nullPaths, `null values in style: ${nullPaths.slice(0, 5).join(', ')}`).toEqual([]);
  });
});

describe('field overrides — what volunteers asked for', () => {
  const style = buildBasemapStyle(MANIFEST, { origin: ORIGIN });
  const byId = new Map(style.layers.map((l) => [l.id, l as unknown as Record<string, unknown>]));

  test.each(['roads_other', 'roads_bridges_other', 'roads_tunnels_other'])(
    '%s renders trails as visible dashed lines from z13',
    (id) => {
      const l = byId.get(id);
      expect(l, `${id} missing from the theme`).toBeDefined();
      const paint = l!.paint as Record<string, unknown>;
      expect(paint['line-color']).toBe('#9a6b3f');
      expect(paint['line-dasharray']).toEqual([2, 1.2]);
      // The stock theme starts width at 0 until z14, which is why trails were
      // invisible; ours must be non-zero at the zoom where paths first exist.
      expect(JSON.stringify(paint['line-width'])).toContain('13');
      expect(l!.minzoom).toBe(FIELD_DETAIL_MINZOOM);
    },
  );

  test('streams are darkened and thickened', () => {
    const paint = byId.get('water_stream')!.paint as Record<string, unknown>;
    expect(paint['line-color']).toBe('#3d8fb0');
    expect(paint['line-width']).not.toBe(0.5);
  });

  test('peaks get their own labelled layer above the theme', () => {
    const peaks = byId.get('field_peaks');
    expect(peaks).toBeDefined();
    expect(peaks!.type).toBe('symbol');
    expect(peaks!['source-layer']).toBe('pois');
    expect(peaks!.filter).toEqual(['==', ['get', 'kind'], 'peak']);
    // Last in the array = drawn on top of everything else.
    expect(style.layers.at(-1)?.id).toBe('field_peaks');
  });

  test('field detail is gated at the zoom where the data actually exists', () => {
    // Paths/streams/peaks do not enter the Protomaps schema below z13. Painting
    // them lower would render an empty map that reads as "no trails here".
    expect(FIELD_DETAIL_MINZOOM).toBe(13);
  });
});

describe('glyph coverage — offline correctness', () => {
  const style = buildBasemapStyle(MANIFEST, { origin: ORIGIN });

  test('references only fontstacks we have vendored', () => {
    // MapLibre fetches glyph ranges lazily BY CODEPOINT. A stack we have not
    // shipped fails offline as blank boxes with no error and no failed build —
    // so the allowlist is enforced here rather than discovered in the field.
    const used = collectFontstacks(style);
    expect(used.length).toBeGreaterThan(0);
    for (const stack of used) {
      expect(VENDORED_FONTSTACKS as readonly string[]).toContain(stack);
    }
  });

  test('every vendored stack and range is actually on disk', () => {
    for (const stack of VENDORED_FONTSTACKS) {
      for (const range of VENDORED_GLYPH_RANGES) {
        const p = resolve(ROOT, `public/basemap/fonts/${stack}/${range}.pbf`);
        expect(existsSync(p), `missing glyph file: ${stack}/${range}.pbf`).toBe(true);
      }
    }
  });

  test('no stray fontstack directories beyond the allowlist', () => {
    // Catches a half-removed stack, which would otherwise sit unused in the
    // bundle and quietly inflate the precache.
    const dir = resolve(ROOT, 'public/basemap/fonts');
    const onDisk = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory()).map((e) => e.name).sort();
    expect(onDisk).toEqual([...VENDORED_FONTSTACKS].sort());
  });

  test('sprite sheets are present at both densities', () => {
    for (const f of ['light.json', 'light.png', 'light@2x.json', 'light@2x.png']) {
      expect(existsSync(resolve(ROOT, `public/basemap/sprites/${f}`)), f).toBe(true);
    }
  });
});

describe('region model', () => {
  test('defaults to the one region that exists', () => {
    expect(DEFAULT_REGION).toBe('wa');
    expect(Object.keys(MANIFEST.regions)).toEqual(['wa']);
  });
});
