import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCollectorPages } from '../collector-pages.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('parseCollectorPages', () => {
  test('reads the published {href, name} shape', () => {
    expect(parseCollectorPages({
      mylodon: { href: '/collectors/mylodon/index.html', name: 'Ellery Newcomer' },
    })).toEqual({ mylodon: { href: '/collectors/mylodon/index.html', name: 'Ellery Newcomer' } });
  });

  test('a cached pre-2026-08-29 map still yields links, without names', () => {
    // The old shape was a bare href. Losing the names is the correct degradation;
    // throwing would lose the links too, which is what this map exists for.
    expect(parseCollectorPages({ mylodon: '/collectors/mylodon/index.html' }))
      .toEqual({ mylodon: { href: '/collectors/mylodon/index.html', name: null } });
  });

  test('entries without a usable href are dropped, not half-kept', () => {
    // A dead link is worse than a plain-text name (the module's standing rule).
    expect(parseCollectorPages({
      a: { name: 'No Href' }, b: null, c: 42, d: { href: '/ok', name: '' },
    })).toEqual({ d: { href: '/ok', name: null } });
  });

  test('a non-object payload is an empty map, never a throw', () => {
    for (const bad of [null, [], 'nope', 7]) expect(parseCollectorPages(bad)).toEqual({});
  });
});

describe('the emitter publishes what the loader reads', () => {
  // The two halves of one contract, in two languages: scripts/postbuild-data.mjs
  // writes the map and src/collector-pages.ts parses it. Nothing but this pins
  // them together, and the name half is new (beeatlas-8a7r).
  const emitter = readFileSync(resolve(ROOT, 'scripts/postbuild-data.mjs'), 'utf-8');

  test('the emitter writes href AND name per login', () => {
    expect(emitter).toMatch(/collectorPages\[c\.login\] = \{/);
    expect(emitter).toMatch(/href: `\/collectors\//);
    expect(emitter).toMatch(/name: c\.display_name \?\? null/);
  });
});
