import { test, expect, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSpaTaxonLink } from '../lib/spa-link.ts';
import { parseParams } from '../url-state.ts';  // crossing boundary OK in tests

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('buildSpaTaxonLink (LINK-01..03)', () => {
  test('species rank: emits legacy taxon+taxonRank URL format', () => {
    const link = buildSpaTaxonLink('Andrena anograe');
    // WR-03: spaces encoded as %20 to match SSR's urlencode filter output.
    expect(link).toBe('/?taxon=Andrena%20anograe&taxonRank=species');
  });

  test('genus rank: emits taxonRank=genus in legacy format', () => {
    const link = buildSpaTaxonLink('Bombus', 'genus');
    expect(link).toBe('/?taxon=Bombus&taxonRank=genus');
  });

  test('family rank: emits taxonRank=family in legacy format', () => {
    const link = buildSpaTaxonLink('Apidae', 'family');
    expect(link).toBe('/?taxon=Apidae&taxonRank=family');
  });

  test('default rank is species', () => {
    expect(buildSpaTaxonLink('Foo bar')).toMatch(/taxonRank=species/);
  });

  test('legacy URL format: parseParams produces no filter (async legacy resolution needed)', () => {
    // Phase 130: legacy name-format taxon URLs require async taxon-cache resolution.
    // parseParams returns no filter synchronously for non-integer taxon= values.
    const search = buildSpaTaxonLink('Bombus', 'genus').split('?')[1] ?? '';
    const parsed = parseParams(search);
    expect(parsed.filter).toBeUndefined();
  });
});

describe('LINK-04: src/url-state.ts header documents the taxon+taxonRank contract', () => {
  test('header comment names taxon and taxonRank as a stable interface', () => {
    const src = readFileSync(resolve(ROOT, 'src/url-state.ts'), 'utf8');
    // Header comment must mention both params and that BOTH are required.
    const headerEnd = src.indexOf('export ');
    const header = src.slice(0, headerEnd);
    expect(header).toMatch(/taxon/);
    expect(header).toMatch(/taxonRank/);
    expect(header).toMatch(/stable interface|stable URL contract|cross-route/i);
  });
});
