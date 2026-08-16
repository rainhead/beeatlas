// Phase 80 Wave 0 — RED contract for PAGE-01 (front-matter) and PAGE-04 (entry script).
// readFileSync + regex pattern from src/tests/seed-species-photos.test.ts.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('_pages/species.njk (Phase 96 — index page)', () => {
  test('declares layout: default.njk and permalink: /species/index.html', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toMatch(/^---[\s\S]*layout:\s*default\.njk[\s\S]*---/);
    expect(src).toMatch(/permalink:\s*\/species\/index\.html/);
  });

  test('references the species-index entry script', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    // beeatlas-d3y: the raw <script src="/src/…"> became a viteAssets shortcode —
    // Eleventy now emits the hashed tag from the Vite manifest. Same claim, new spelling.
    expect(src).toMatch(/\{%\s*viteAssets\s+"src\/entries\/species-index\.ts"\s*%\}/);
  });
});

describe('_pages/collector-events-page.njk (Phase 171 — sub-page template)', () => {
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

  test('collector-detail.njk renders <table class="event-feed"> with <thead> (table conversion)', () => {
    expect(detailSrc).toMatch(/<table\s+class="event-feed"/);
    expect(detailSrc).toMatch(/<thead>/);
    expect(detailSrc).toMatch(/<th\s+scope="col">/);
    expect(detailSrc).toMatch(/<td\s+class="event-date"/);
  });

  test('both templates wrap the table in an overflow-x:auto container (.event-feed-wrap)', () => {
    expect(detailSrc).toMatch(/class="event-feed-wrap"/);
    expect(src).toMatch(/class="event-feed-wrap"/);
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

// beeatlas-na5u — the shared inline nav (_includes/inline-nav.njk) and the
// /places.html ÷ /ecoregions.html split it was built for.
describe('inline nav', () => {
  const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf-8');
  const macro = read('_includes/inline-nav.njk');
  const placesSrc = read('_pages/places.njk');
  const ecoSrc = read('_pages/ecoregions.njk');
  const collectorSrc = read('_pages/collector-detail.njk');

  test('marks the current item with aria-current="page", and nothing else', () => {
    // The whole "you are here" affordance — visual AND assistive — hangs off this one
    // attribute: src/index.css styles `.inline-nav [aria-current="page"]`, so losing it
    // silently drops both, leaving two links that look identical on both pages.
    const markup = macro.replace(/\{#[\s\S]*?#\}/g, '');   // the comments say it too
    expect(markup).toMatch(/<a href="\{\{ item\.href \}\}" aria-current="page">/);
    expect(markup.match(/aria-current/g)).toHaveLength(1);
  });

  test('skips falsy items, so a caller can inline a conditional', () => {
    // collector-detail.njk builds its list with `({...} if cond)` expressions, which
    // yield undefined when the section is absent. Without this guard those render as
    // empty <li>s — a nav of stray bullets pointing nowhere.
    expect(macro).toMatch(/\{%-?\s*if item\s*-?%\}/);
  });

  test('/ecoregions.html and /places.html each link the other, and flag themselves', () => {
    expect(ecoSrc).toMatch(/permalink:\s*\/ecoregions\.html/);
    expect(placesSrc).toMatch(/permalink:\s*\/places\.html/);
    for (const [self, other, src] of [
      ['/places.html', '/ecoregions.html', placesSrc],
      ['/ecoregions.html', '/places.html', ecoSrc],
    ] as const) {
      expect(src, `${self} links ${other}`).toContain(`href: "${other}"`);
      expect(src, `${self} flags itself current`).toMatch(
        new RegExp(`href: "${self.replace('.', '\\.')}"[^}]*current: true`),
      );
    }
  });

  test('the switcher precedes its h1; the collector jump nav follows one', () => {
    // The asymmetry is deliberate and looks like an oversight, so pin it. The switcher
    // NAMES the page — reading it first is reading the title. The jump nav does not:
    // above the h1 it would announce three section links before the person whose
    // sections they are, and it is the affordance assistive tech needs LEAST (heading
    // navigation already jumps between those sections), so it should not be what
    // delays the h1 for the people who gain nothing from it.
    for (const [page, src] of [['places', placesSrc], ['ecoregions', ecoSrc]] as const) {
      expect(src.indexOf('inlineNav('), `${page}: nav before h1`).toBeLessThan(src.indexOf('<h1>'));
    }
    expect(collectorSrc.indexOf('inlineNav(')).toBeGreaterThan(collectorSrc.indexOf('<h1>'));
  });

  test('the bullet separator carries empty alt text, so AT does not read it', () => {
    // Generated content IS announced by JAWS/NVDA/VoiceOver. Both declarations must
    // stay: the bare one is the fallback for browsers without the `/ ""` alt syntax.
    const css = read('src/index.css');
    expect(css).toMatch(/content:\s*"·";\s*\n\s*content:\s*"·"\s*\/\s*"";/);
  });

  test('the two index pages list one kind each — no ecoregions left on /places.html', () => {
    expect(placesSrc).toContain('places.sites');
    expect(placesSrc).not.toContain('ecoregionGroups');
    expect(ecoSrc).toContain('places.ecoregionGroups');
    expect(ecoSrc).not.toContain('places.sites');
  });

  test('every collector jump link points at a section id that exists (beeatlas-na5u)', () => {
    // The failure this guards is silent: rename a section's id and the nav still
    // renders, still looks right, and does nothing when clicked.
    const targets = [...collectorSrc.matchAll(/href: "#([\w-]+)"/g)].map((m) => m[1]);
    expect(targets).toEqual(['coverage', 'species', 'events']);
    for (const id of targets) {
      expect(collectorSrc, `#${id} has a target`).toMatch(new RegExp(`<section[^>]*id="${id}"`));
    }
  });
});
