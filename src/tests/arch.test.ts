// Phase 80/96 architectural boundary tests.
// Guards three boundaries:
//   (a) ARCH-04 / PAGE-08: no src/species/**.ts file (seasonality-viz.ts)
//       may import the SPA's mapbox-gl / wa-sqlite /
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

  // After Model Y, src/species/ contains only seasonality-viz.ts (the runtime
  // seasonality-cache.ts died with the slim manifest — seasonality is baked at
  // build time). The ARCH-04 boundary still applies.
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
    // beeatlas-0of.2: county/ecoregion presence filtering. Both additions are
    // dependency-free by inspection — species-presence.ts imports NOTHING, and
    // manifest.ts is a standalone fetch+cache with no imports of its own — so the
    // guarantee this allowlist exists to protect (the static page pulls in no SPA
    // machinery: no sqlite, no filter.ts, no Lit component tree, no mapbox) holds.
    '../species-presence.ts', '../species-presence',
    '../manifest.ts', '../manifest',
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

// (c) beeatlas-96m — nothing `define`d into the bundle may come from the clock.
//
// A `define`d value lands inside a content-hashed chunk, so if it varies with wall
// time then every build mints new chunk hashes, every page's asset URLs change, and
// the nightly republishes the whole bundle for unchanged source — defeating the point
// of hashed filenames and re-costing every returning visitor ~2 MB. __APP_VERSION__
// did exactly this (a minute-resolution `new Date()`), which is how it was found: two
// full builds of one commit produced pages differing only in asset URLs.
//
// This is a source-level guard, not a proof. The real property is "two builds of the
// same tree produce the same filenames", which costs two full builds to assert; this
// catches the specific way it was broken, for free.
/**
 * Strip `//` comments only — NOT `/* *\/` blocks.
 *
 * The obvious block-comment regex is actively dangerous here. vite.config.ts contains
 * glob strings like '**\/_site/**', and `**\/` supplies a `*\/` while `/**` supplies a
 * `/*` — so a non-greedy /\\/\\*[\\s\\S]*?\\*\\//g swallows everything between two unrelated
 * globs. Measured: it cut the file from 11,274 characters to 1,115, taking `publicDir`
 * and `rollupOptions` with it, which made the guards below inspect a tenth of the file.
 * That is how a guard passes while proving nothing — and why the negative test for
 * these appends its tamper in several positions, not just at the end.
 *
 * Only line comments are stripped, and the anchor (`^\\s*`) means a `//` inside a string
 * mid-line — a URL, say — is left alone. There are no block comments in that file.
 */
function stripLineComments(src: string): string {
  return src.replace(/^\s*\/\/.*$/gm, '');
}

describe('bundle determinism (beeatlas-96m)', () => {
  const CONFIG = resolve(ROOT, 'vite.config.ts');

  test('vite.config.ts has no define block at all', () => {
    // Stronger than the clock check below, and it is what ADR 0019 actually claims.
    // The old guard would have passed a sha-derived define — which is exactly what
    // beeatlas-4uj removed, and exactly what would silently put the gate back to
    // rebuilding on every commit. A CONSTANT define would be harmless in principle,
    // but the rule is kept absolute because the failure is invisible: nothing breaks,
    // the bundle just quietly stops being reusable and every client re-downloads it.
    const code = stripLineComments(readFileSync(CONFIG, 'utf8'));
    expect(
      /^\s*define\s*:/m.test(code),
      'vite.config.ts declares a `define`. Anything defined lands inside a ' +
      'content-hashed chunk, so if it varies per build it changes every asset URL ' +
      '(beeatlas-96m, beeatlas-4uj). Put build metadata in the slim manifest instead.',
    ).toBe(false);
  });

  test('the config draws on the source tree, not the clock', () => {
    // Comments legitimately discuss the clock; strip them before matching so the
    // rationale above a fix cannot fail the test that guards it.
    const code = stripLineComments(readFileSync(CONFIG, 'utf8'));
    // Word-boundary regexes, not substrings: `Date(` as a substring also matches
    // `formatDate(`, and a guard that fails on an innocent helper name teaches people
    // to delete the guard. \b before Date rules that out, while `Date(` still covers
    // BOTH `new Date(...)` and the bare `Date(...)` call form.
    const CLOCKS = [/\bDate\s*\(/, /\bDate\.now\s*\(/, /SOURCE_DATE_EPOCH/];
    for (const clock of CLOCKS) {
      expect(
        clock.test(code),
        `vite.config.ts matches ${clock} — a build clock in a define makes every ` +
        `build change every chunk hash (beeatlas-96m). Put times in the slim manifest, ` +
        `which is not content-hashed.`,
      ).toBe(false);
    }
  });
});
