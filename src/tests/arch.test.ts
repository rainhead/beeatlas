// Phase 80/96 architectural boundary tests.
// Guards three boundaries:
//   (a) ARCH-04 / PAGE-08: no src/species/**.ts file (seasonality-viz.ts,
//       seasonality-cache.ts) may import the SPA's mapbox-gl / wa-sqlite /
//       sqlite / filter / bee-map / bee-atlas modules (static OR dynamic).
//   (b) IDX-02 (Phase 96): src/entries/species-index.ts is restricted to
//       CSS side-effects + bee-header — no SPA modules allowed.

import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const SPECIES_DIR = resolve(ROOT, 'src/species');

// ARCH-04 / PAGE-08 — forbidden imports under src/species/**.ts
const FORBIDDEN = [
  'mapbox-gl',
  'wa-sqlite',
  '../sqlite.ts', '../sqlite',
  '../filter.ts', '../filter',
  '../bee-map.ts', '../bee-map',
  '../bee-atlas.ts', '../bee-atlas',
];

// Static `from '...'` and bare `import '...'` (side-effect)
const STATIC_IMPORT_RE = /(?:^|\s)(?:from|import)\s+['"]([^'"]+)['"]/g;
// Dynamic `import('...')` — Pitfall 3 mitigation
const DYNAMIC_IMPORT_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function listTsFiles(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .flatMap(d => {
        const p = join(dir, d.name);
        if (d.isDirectory()) return listTsFiles(p);
        return d.isFile() && d.name.endsWith('.ts') ? [p] : [];
      });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}

function isForbidden(spec: string): boolean {
  return FORBIDDEN.some(bad => spec === bad || spec.startsWith(bad + '/'));
}

function extractImports(src: string, re: RegExp): string[] {
  // Strip line comments and block comments to avoid false positives.
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  // Re-clone the regex per call: global RegExps are stateful (lastIndex).
  const localRe = new RegExp(re.source, re.flags);
  return [...stripped.matchAll(localRe)].map(m => m[1]).filter((s): s is string => s !== undefined);
}

describe('ARCH-04: src/species boundary (PAGE-08)', () => {
  const files = listTsFiles(SPECIES_DIR);

  // After Phase 96, src/species/ contains only seasonality-viz.ts and
  // seasonality-cache.ts. The ARCH-04 boundary still applies to those files.
  test('src/species/ contains at least one TypeScript file', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const rel = file.slice(ROOT.length + 1);
    const src = readFileSync(file, 'utf8');

    test(`${rel} has no forbidden static imports`, () => {
      const imports = extractImports(src, STATIC_IMPORT_RE);
      const violations = imports.filter(isForbidden);
      expect(violations, `${rel} forbidden static imports: ${violations.join(', ')}`).toEqual([]);
    });

    test(`${rel} has no forbidden dynamic imports (Pitfall 3)`, () => {
      const imports = extractImports(src, DYNAMIC_IMPORT_RE);
      const violations = imports.filter(isForbidden);
      expect(violations, `${rel} forbidden dynamic imports: ${violations.join(', ')}`).toEqual([]);
    });
  }
});

// Phase 96 IDX-02 — species-index.ts entry allowlist.
// The new species index entry must only import CSS side-effects and bee-header;
// it must not pull in any SPA modules or old monolith components.
describe('src/entries/species-index.ts allowlist (IDX-02, Phase 96)', () => {
  const ENTRY_FILE_INDEX = resolve(ROOT, 'src/entries/species-index.ts');
  const ALLOWED_INDEX = new Set([
    '../index.css',
    '../styles/taxon-pages.css',
    '../bee-header.ts', '../bee-header',
    // Phase 133 gap closure: tree behavior extracted to a pure DOM module
    // (no SPA/heavy imports) so it is unit-testable under happy-dom.
    '../species-tree.ts', '../species-tree',
  ]);
  const FORBIDDEN_PATTERNS = [
    'bee-species-page', 'bee-species-filter', 'bee-atlas',
    'wa-sqlite', 'mapbox-gl',
  ];

  test('only imports CSS side-effects + bee-header (no SPA modules)', () => {
    const src = readFileSync(ENTRY_FILE_INDEX, 'utf8');
    const imports = [
      ...extractImports(src, STATIC_IMPORT_RE),
      ...extractImports(src, DYNAMIC_IMPORT_RE),
    ];
    const disallowed = imports.filter(spec => !ALLOWED_INDEX.has(spec));
    expect(disallowed, `unexpected imports: ${disallowed.join(', ')}`).toEqual([]);
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(src, `src contains forbidden pattern '${pattern}'`).not.toContain(pattern);
    }
  });
});
