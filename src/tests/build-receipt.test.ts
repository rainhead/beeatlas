// beeatlas-ky6d, ADR 0045: a deploy skips its full render when the build receipt says a
// full build of these inputs is already what is served. The risk is all on one side: a
// skip that should not have happened leaves a stale site until the next nightly, while
// a render that was not needed costs only time. So what is pinned here is which changes
// may skip, and above all which may not.
//
// The receipt resolves its root from its own location, so it runs from a copy in a
// scratch repo, against a scratch data dir: the same script, disposable state.
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

let root: string;
let data: string;

function put(rel: string, body: string) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), body);
}

function receipt(mode: string): number {
  const r = spawnSync(process.execPath, [join(root, 'scripts/build-receipt.mjs'), mode],
    { env: { ...process.env, EXPORT_DIR: data }, encoding: 'utf8' });
  return r.status ?? -1;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'receipt-'));
  data = mkdtempSync(join(tmpdir(), 'receipt-data-'));
  for (const f of ['scripts/build-receipt.mjs', 'lib/build-data-dir.js', 'lib/vite-manifest.js']) {
    mkdirSync(dirname(join(root, f)), { recursive: true });
    copyFileSync(join(ROOT, f), join(root, f));
  }
  // A small repo with one file in each kind of place the rule distinguishes.
  for (const [rel, body] of Object.entries({
    'package.json': '{}',
    'pnpm-lock.yaml': 'lockfileVersion: 9',
    '.nvmrc': '26.12',
    '.env.production': 'VITE_DATA_BASE_URL=/data',
    'src/app.ts': 'export {}',
    '_pages/index.njk': 'page',
    'public/pwa/icon.svg': '<svg/>',
    'scripts/build-app.mjs': '// builds the bundle',
    'scripts/fetch-data.sh': '# runs Stelis',
    'data/dbt/seeds/occurrence_synonyms.csv': 'synonym,accepted',
    'data/dbt/seeds/bee_traits_beegap.csv': 'genus,trait',
    'docs/adr/0001.md': 'a decision',
    'data/nightly.sh': '# the pipeline',
    'api/main.py': '# the API',
    'fly/start.sh': '# the Machine',
    'README.md': 'readme',
    '_site/index.html': 'built',
  })) put(rel, body);
  writeFileSync(join(data, 'species.json'), '[]');
  expect(receipt('--write')).toBe(0);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(data, { recursive: true, force: true });
});

describe('a deploy may skip its render', () => {
  test('when nothing changed', () => {
    expect(receipt('--check-deploy')).toBe(0);
  });

  test.each([
    'docs/adr/0001.md', 'README.md', 'data/nightly.sh', 'api/main.py', 'fly/start.sh',
    'scripts/fetch-data.sh',
  ])('when only %s changed, which no page is built from', (rel) => {
    put(rel, 'changed');
    expect(receipt('--check-deploy')).toBe(0);
  });
});

describe('a deploy renders in full', () => {
  test.each([
    'src/app.ts', '_pages/index.njk',
    // What the note path's receipt leaves out but a full build reads.
    'pnpm-lock.yaml', '.nvmrc', '.env.production', 'public/pwa/icon.svg', 'scripts/build-app.mjs',
    // Under data/, which is otherwise left out, but the synonym pages are rendered from
    // it (_data/synonyms.js), so it is a render input and wins over the broad entry.
    'data/dbt/seeds/occurrence_synonyms.csv',
  ])('when %s changed', (rel) => {
    put(rel, 'changed');
    expect(receipt('--check-deploy')).toBe(1);
  });

  test('when a file appears that nothing has classified, since that is the safe default', () => {
    put('scripts/new-build-step.mjs', '// a step someone adds to the build');
    expect(receipt('--check-deploy')).toBe(1);
  });

  test('when the data dir changed', () => {
    writeFileSync(join(data, 'species.json'), '[1]');
    expect(receipt('--check-deploy')).toBe(1);
  });

  test('when the receipt predates the deploy component', () => {
    const path = join(root, '.cache/beeatlas-build/receipt.json');
    const { deploy: _, ...older } = JSON.parse(readFileSync(path, 'utf8'));
    writeFileSync(path, JSON.stringify(older));
    expect(receipt('--check-deploy')).toBe(1);
    expect(receipt('--check')).toBe(0);
  });

  test('when there is no receipt', () => {
    expect(receipt('--invalidate')).toBe(0);
    expect(receipt('--check-deploy')).toBe(1);
  });
});

test('a note save also re-renders in full after a seed the pages are built from changed', () => {
  put('data/dbt/seeds/occurrence_synonyms.csv', 'changed');
  expect(receipt('--check')).toBe(1);
});

describe('a note save still ignores what only a deploy reads', () => {
  // A dependency bump does not make a scoped render unsound (build-receipt.mjs's
  // RENDER_INPUTS note), and the deploy that brings it renders in full anyway.
  test.each(['pnpm-lock.yaml', 'public/pwa/icon.svg'])('%s', (rel) => {
    put(rel, 'changed');
    expect(receipt('--check')).toBe(0);
    expect(receipt('--check-deploy')).toBe(1);
  });
});
