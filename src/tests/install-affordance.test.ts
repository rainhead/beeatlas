// Phase 151 Wave 0 — source-analysis tests for install affordance (PWA-01, PWA-02).
//
// These are PURE source-string assertions using readFileSync — no DOM mounting,
// no <bee-atlas> (memory feedback_bee_atlas_test_mounting).
//
// Wave 0 RED state (intended):
//   - install-prompt.ts does NOT exist yet (created in Plan 03) → tests FAIL
//   - iOS gating strings in bee-header.ts absent until Plan 03 → tests FAIL
//
// These tests will pass (GREEN) after Plan 03 creates install-prompt.ts and
// adds the install affordance + iOS detection to bee-header.ts.

import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

describe('install-prompt.ts source (PWA-01 — beforeinstallprompt capture)', () => {
  // install-prompt.ts is created in Plan 03; these tests are RED until then.
  const INSTALL_PROMPT_FILE = resolve(ROOT, 'src/install-prompt.ts');

  test('src/install-prompt.ts exists (Plan 03)', () => {
    expect(existsSync(INSTALL_PROMPT_FILE), 'src/install-prompt.ts not yet created (Plan 03)').toBe(true);
  });

  test('captures beforeinstallprompt event', () => {
    expect(existsSync(INSTALL_PROMPT_FILE), 'src/install-prompt.ts missing').toBe(true);
    const src = readFileSync(INSTALL_PROMPT_FILE, 'utf-8');
    expect(src).toContain('beforeinstallprompt');
  });

  test('calls preventDefault() to suppress mini-infobar (D-09)', () => {
    expect(existsSync(INSTALL_PROMPT_FILE), 'src/install-prompt.ts missing').toBe(true);
    const src = readFileSync(INSTALL_PROMPT_FILE, 'utf-8');
    expect(src).toContain('preventDefault');
  });

  test('listens for appinstalled to clear installable state (D-10)', () => {
    expect(existsSync(INSTALL_PROMPT_FILE), 'src/install-prompt.ts missing').toBe(true);
    const src = readFileSync(INSTALL_PROMPT_FILE, 'utf-8');
    expect(src).toContain('appinstalled');
  });
});

describe('iOS gating strings in bee-header.ts or bee-atlas.ts (PWA-02 — D-12)', () => {
  // These strings are added to bee-header.ts (or bee-atlas.ts) in Plan 03.
  // Currently absent — tests are RED until Plan 03 lands.

  function getSourceForIosDetection(): string {
    // iOS detection may be in bee-header.ts or bee-atlas.ts per plan guidance.
    const headerFile = resolve(ROOT, 'src/bee-header.ts');
    const atlasFile = resolve(ROOT, 'src/bee-atlas.ts');
    const headerSrc = existsSync(headerFile) ? readFileSync(headerFile, 'utf-8') : '';
    const atlasSrc = existsSync(atlasFile) ? readFileSync(atlasFile, 'utf-8') : '';
    return headerSrc + '\n' + atlasSrc;
  }

  test('checks navigator.standalone to detect iOS standalone mode (D-12)', () => {
    const src = getSourceForIosDetection();
    expect(src).toContain('navigator.standalone');
  });

  test('checks display-mode: standalone media query (D-10/D-12)', () => {
    const src = getSourceForIosDetection();
    expect(src).toContain('display-mode: standalone');
  });

  test('uses MacIntel or maxTouchPoints for iPadOS detection (D-12, Pitfall 5)', () => {
    const src = getSourceForIosDetection();
    // Either MacIntel (navigator.platform check) or maxTouchPoints heuristic must be present
    const hasMacIntel = src.includes('MacIntel');
    const hasMaxTouchPoints = src.includes('maxTouchPoints');
    expect(hasMacIntel || hasMaxTouchPoints,
      'neither MacIntel nor maxTouchPoints found — iPadOS desktop-mode UA detection missing'
    ).toBe(true);
  });

  test('excludes CriOS (Chrome on iOS) from iOS install instructions (D-12)', () => {
    const src = getSourceForIosDetection();
    expect(src).toContain('CriOS');
  });

  test('uses Safari string for iOS browser detection (D-12)', () => {
    const src = getSourceForIosDetection();
    expect(src).toContain('Safari');
  });
});
