// Phase 80 Wave 0 — RED contract for PAGE-01 (front-matter) and PAGE-04 (entry script).
// readFileSync + regex pattern from src/tests/seed-species-photos.test.ts.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('_pages/species.njk (Phase 96 — index page, PAGE-01)', () => {
  test('declares layout: default.njk and permalink: /species/index.html (PAGE-01)', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toMatch(/^---[\s\S]*layout:\s*default\.njk[\s\S]*---/);
    expect(src).toMatch(/permalink:\s*\/species\/index\.html/);
  });

  test('references the species-index entry script (Phase 96)', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toMatch(/<script\s+type="module"\s+src="\/src\/entries\/species-index\.ts"/);
  });
});

describe('_pages/collector-events-page.njk (Phase 171 — sub-page template, STREAM-03)', () => {
  const src = readFileSync(resolve(ROOT, '_pages/collector-events-page.njk'), 'utf-8');
  const detailSrc = readFileSync(resolve(ROOT, '_pages/collector-detail.njk'), 'utf-8');

  test('declares layout: default.njk', () => {
    expect(src).toMatch(/^---[\s\S]*layout:\s*default\.njk[\s\S]*---/);
  });

  test('paginates collectors.collectorEventPages with size: 1', () => {
    expect(src).toMatch(/data:\s*collectors\.collectorEventPages/);
    expect(src).toMatch(/size:\s*1/);
  });

  test('has permalink /collectors/{login}/page/{N}/index.html', () => {
    expect(src).toMatch(/\/collectors\/\{\{ evpage\.login \| urlencode \}\}\/page\/\{\{ evpage\.page_num \}\}\/index\.html/);
  });

  test('collector-detail.njk contains class="event-feed" (feed section wired, STREAM-01)', () => {
    expect(detailSrc).toMatch(/class="event-feed"/);
  });

  test('neither template contains <script (JS-free invariant — Pitfall 5)', () => {
    expect(src).not.toMatch(/<script/i);
    expect(detailSrc).not.toMatch(/<script/i);
  });

  test('neither template uses | safe (auto-escaping enforced — T-171-01)', () => {
    expect(src).not.toMatch(/\|\s*safe/);
    expect(detailSrc).not.toMatch(/\|\s*safe/);
  });
});
