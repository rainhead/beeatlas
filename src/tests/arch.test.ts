// Phase 80 Wave 0 — RED architectural test.
// Encodes the contract from RESEARCH.md Pattern 4 (lines 351-412):
//   - ARCH-04 / PAGE-08: no src/species/**.ts file may import the SPA's
//     mapbox-gl / wa-sqlite / sqlite / filter / bee-map / bee-atlas modules
//     (static OR dynamic — Pitfall 3 mitigation).
//   - PAGE-06: presenter files under src/species/ (any file whose basename is
//     NOT bee-species-page.ts) MUST NOT import the coordinator
//     bee-species-page.ts, statically OR dynamically.
//   - PAGE-04 (partial): src/entries/species.ts is restricted to side-effect
//     imports of bee-header + species components.
//
// RED state: src/species/ and src/entries/species.ts do not exist yet
// (Plan 03 creates them). Tests asserting "directory contains files" fail
// until then; that is desired.

import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const SPECIES_DIR = resolve(ROOT, 'src/species');
const ENTRY_FILE = resolve(ROOT, 'src/entries/species.ts');

// ARCH-04 / PAGE-08 — forbidden imports under src/species/**.ts
const FORBIDDEN = [
  'mapbox-gl',
  'wa-sqlite',
  '../sqlite.ts', '../sqlite',
  '../filter.ts', '../filter',
  '../bee-map.ts', '../bee-map',
  '../bee-atlas.ts', '../bee-atlas',
];

// PAGE-06 — presenters must never import the coordinator.
// Match every spelling that could resolve to bee-species-page.ts:
//   './bee-species-page', './bee-species-page.ts'              (sibling, the common case)
//   '../species/bee-species-page', '../species/bee-species-page.ts' (from outside src/species/)
const PAGE_COORDINATOR_FORBIDDEN = [
  './bee-species-page', './bee-species-page.ts',
  '../species/bee-species-page', '../species/bee-species-page.ts',
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

function isCoordinatorImport(spec: string): boolean {
  return PAGE_COORDINATOR_FORBIDDEN.some(bad => spec === bad);
}

function extractImports(src: string, re: RegExp): string[] {
  // Strip line comments and block comments to avoid false positives.
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  // Re-clone the regex per call: global RegExps are stateful (lastIndex).
  const localRe = new RegExp(re.source, re.flags);
  return [...stripped.matchAll(localRe)].map(m => m[1]);
}

describe('ARCH-04: src/species boundary (PAGE-08)', () => {
  const files = listTsFiles(SPECIES_DIR);

  // RED until Plan 03 creates src/species/. This test PINS the contract:
  // once src/species/ has at least one .ts file, every file is checked.
  test('src/species/ contains at least one TypeScript file (after Plan 03)', () => {
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

// PAGE-06 — presenters under src/species/ must never import the coordinator
// bee-species-page.ts. Per REQUIREMENTS.md line 71 verbatim: "never import
// from bee-species-page.ts". Phase 80 ships only bee-species-card.ts as a
// presenter, but this contract pre-empts every Phase 81 presenter
// (bee-taxon-nav, bee-species-grid, bee-species-filter, seasonality-viz).
describe('PAGE-06: presenter→coordinator non-import', () => {
  const files = listTsFiles(SPECIES_DIR).filter(
    f => basename(f) !== 'bee-species-page.ts'
  );

  // RED until Plan 03 creates at least one presenter file in src/species/.
  test('src/species/ contains at least one presenter file (non-coordinator)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const rel = file.slice(ROOT.length + 1);
    const src = readFileSync(file, 'utf8');

    test(`${rel} does not import bee-species-page (static)`, () => {
      const imports = extractImports(src, STATIC_IMPORT_RE);
      const violations = imports.filter(isCoordinatorImport);
      expect(violations, `${rel} static-imports coordinator: ${violations.join(', ')}`).toEqual([]);
    });

    test(`${rel} does not import bee-species-page (dynamic)`, () => {
      const imports = extractImports(src, DYNAMIC_IMPORT_RE);
      const violations = imports.filter(isCoordinatorImport);
      expect(violations, `${rel} dynamic-imports coordinator: ${violations.join(', ')}`).toEqual([]);
    });
  }
});

describe('src/entries/species.ts allowlist (PAGE-04 partial)', () => {
  // RED until Plan 03 creates src/entries/species.ts.
  const ALLOWED = new Set([
    '../bee-header.ts', '../bee-header',
    '../species/bee-species-page.ts', '../species/bee-species-page',
    '../species/bee-species-card.ts', '../species/bee-species-card',
  ]);

  test('only side-effect imports of bee-header + species components', () => {
    let src: string;
    try {
      src = readFileSync(ENTRY_FILE, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        // Will fail until Plan 03 creates the file; that is desired RED state.
        throw new Error('src/entries/species.ts does not exist yet (Plan 03 creates it)');
      }
      throw e;
    }
    const imports = [
      ...extractImports(src, STATIC_IMPORT_RE),
      ...extractImports(src, DYNAMIC_IMPORT_RE),
    ];
    const disallowed = imports.filter(spec => !ALLOWED.has(spec));
    expect(disallowed, `unexpected imports in src/entries/species.ts: ${disallowed.join(', ')}`).toEqual([]);
  });
});
