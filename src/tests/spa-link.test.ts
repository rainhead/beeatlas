import { test, expect, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSpaTaxonLink } from '../lib/spa-link.ts';
import { parseParams } from '../url-state.ts';  // crossing boundary OK in tests

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('buildSpaTaxonLink (LINK-01..03)', () => {
  test('species rank: round-trips through SPA parseParams', () => {
    const link = buildSpaTaxonLink('Andrena anograe');
    // WR-03: spaces encoded as %20 to match SSR's urlencode filter output.
    // The previous expected value used + (URLSearchParams default), which
    // diverged from SSR-emitted hrefs in _pages/species.njk and fragmented
    // analytics cache keys. Both encodings round-trip via URLSearchParams.
    expect(link).toBe('/?taxon=Andrena%20anograe&taxonRank=species');
    const search = link.split('?')[1] ?? '';
    const parsed = parseParams(search);
    expect(parsed.filter?.taxonName).toBe('Andrena anograe');
    expect(parsed.filter?.taxonRank).toBe('species');
  });

  test('genus rank: emits taxonRank=genus and round-trips', () => {
    const link = buildSpaTaxonLink('Bombus', 'genus');
    expect(link).toBe('/?taxon=Bombus&taxonRank=genus');
    const parsed = parseParams(link.split('?')[1] ?? '');
    expect(parsed.filter?.taxonName).toBe('Bombus');
    expect(parsed.filter?.taxonRank).toBe('genus');
  });

  test('family rank: emits taxonRank=family and round-trips', () => {
    const link = buildSpaTaxonLink('Apidae', 'family');
    expect(link).toBe('/?taxon=Apidae&taxonRank=family');
    const parsed = parseParams(link.split('?')[1] ?? '');
    expect(parsed.filter?.taxonName).toBe('Apidae');
    expect(parsed.filter?.taxonRank).toBe('family');
  });

  test('default rank is species', () => {
    expect(buildSpaTaxonLink('Foo bar')).toMatch(/taxonRank=species/);
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
