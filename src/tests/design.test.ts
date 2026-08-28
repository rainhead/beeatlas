import { describe, test, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import design from '../../_data/design.js';
import { PROOFS } from '../design/proofs.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

describe('/design section register (ADR 0039)', () => {
  test('every listed section has proofs, and every proof set is listed', () => {
    const listed = design.sections.map(s => s.slug).sort();
    const registered = Object.keys(PROOFS).sort();
    // Both directions on purpose: a section listed with nothing to show is a
    // dead link, and a proof set nobody lists is unreachable.
    expect(registered).toEqual(listed);
  });

  test('every section carries a label and a lede', () => {
    for (const section of design.sections) {
      expect(section.label, section.slug).toBeTruthy();
      expect(section.lede, section.slug).toBeTruthy();
    }
  });

  test('state ids are unique within a section, so an anchor points at one thing', () => {
    for (const [slug, states] of Object.entries(PROOFS)) {
      const ids = states.map(s => s.id);
      expect(new Set(ids).size, slug).toBe(ids.length);
    }
  });

  test('the section pages and the entry agree on the container contract', () => {
    const page = read('_pages/design-section.njk');
    expect(page).toContain('data-design-section="{{ section.slug }}"');
    expect(page).toContain('{% viteAssets "src/entries/design.ts" %}');
    expect(read('_pages/design.njk')).toContain('{% viteAssets "src/entries/design.ts" %}');
    // A template asking for an unlisted entry fails the build (see the input
    // list's comment); assert the listing rather than discovering it there.
    expect(read('vite.config.ts')).toContain("'src/entries/design.ts'");
  });
});

describe('/design carries no data layer and no service worker', () => {
  // The vite.config.ts input list exists to make it impossible for a template to
  // mount the map without registering the worker. A proofing page is the most
  // likely template to do that by accident, so pin it here too.
  const entry = read('src/entries/design.ts');
  const proofs = read('src/design/proofs.ts');

  test('the entry imports no app shell, map, or worker registration', () => {
    for (const forbidden of ['app-entry', 'bee-atlas', 'bee-map', 'sw-registration', 'prime-orchestrator']) {
      expect(entry, forbidden).not.toMatch(new RegExp(`from '[^']*${forbidden}`));
    }
  });

  test('proofs import filter.ts for types only, keeping wa-sqlite out of the page', () => {
    // A value import of filter.ts pulls sqlite.ts, and with it the INLINED
    // wa-sqlite worker — megabytes onto a page that shows fixtures.
    const filterImports = [...proofs.matchAll(/^import (type )?\{[^}]*\} from '[^']*filter\.ts';$/gm)];
    expect(filterImports.length).toBeGreaterThan(0);
    for (const m of filterImports) expect(m[1], m[0]).toBe('type ');
  });
});

describe('/design proof states all render', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  // The point of the surface: every state is reachable by setting properties.
  // A state that throws, or that quietly renders nothing where it should render
  // something, fails here rather than in front of whoever opened the page.
  for (const [slug, states] of Object.entries(PROOFS)) {
    for (const state of states) {
      test(`${slug}/${state.id} mounts from fixtures alone`, async () => {
        const el = state.render();
        document.body.append(el);
        await (el as HTMLElement & { updateComplete?: Promise<unknown> }).updateComplete;
        expect(el.shadowRoot, state.id).not.toBeNull();
        const rendered = (el.shadowRoot?.textContent ?? '').trim();
        // 'empty' is the one state whose whole point is rendering nothing.
        if (state.id === 'empty') expect(rendered).toBe('');
        else expect(rendered, state.id).not.toBe('');
      });
    }
  }
});
