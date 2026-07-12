// Post-build deploy gate (beeatlas-b59 follow-ups 3+4): prove the PRODUCTION
// build actually boots in a real browser before it is allowed to reach S3.
//
// Two real, ALL-GREEN-BUILD outages motivated this (both only manifested in the
// rolldown/oxc production output, and unit tests miss them because bee-map is
// mocked):
//   MODE 1 — raw Lit decorators leak into the chunks (`@n({attribute:!1})`),
//            browsers reject `@` => "illegal character U+0040" => every JS file
//            fails to parse => site fully down.
//   MODE 2 — oxc stops honoring useDefineForClassFields:false, so a declare-only
//            `@query('#map') mapElement!` is emitted as a class field that shadows
//            the decorator's prototype getter => this.mapElement is undefined =>
//            new mapboxgl.Map({container: undefined}) throws => map never renders.
//
// Gate design:
//   1. Parse every _site/assets/*.js as an ES module (acorn). Catches MODE 1 with
//      zero regex false-positives and no browser — a fast fail-fast.
//   2. Boot the built site in headless chromium and assert:
//        - <bee-atlas> and <bee-map> custom elements upgrade (MODE 1 backstop),
//        - bee-map's @query mapElement accessor resolves to the #map div
//          (MODE 2 — WebGL-independent, so mapbox/CI WebGL flakiness can't
//          false-fail it; the bug makes this undefined),
//        - no page error with a gross-breakage signature (SyntaxError, illegal
//          character, "is not a constructor"). Mapbox token / WebGL / network
//          errors are TOLERATED — they don't indicate the b59 failure modes.
//
// Run in the deploy `build` job AFTER `npm run build` and BEFORE the artifact is
// uploaded: a failure fails the build job, so the deploy job (needs: build) never
// syncs a broken build to prod. Exit 0 = ship it; non-zero = block the deploy.
//
// Usage: node scripts/smoke-boot.mjs [--site <dir>] [--port <n>]

import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { parse as acornParse } from 'acorn';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const SITE = resolve(getArg('--site', '_site'));
const PORT = Number(getArg('--port', '4319'));
const BOOT_TIMEOUT_MS = 20_000;

// Gross-breakage page-error signatures. Deliberately NARROW: mapbox token / WebGL
// / network / data-load errors are expected in a tokenless or headless-CI context
// and must NOT trip the gate. MODE 2 is caught by the mapElement probe, not here.
const FATAL_ERROR = /illegal character|Unexpected token|SyntaxError|is not a constructor|useDefineForClassFields/i;

function die(msg) {
  console.error(`\n❌ smoke-boot FAILED: ${msg}\n`);
  process.exit(1);
}

// --- Gate 1: every asset chunk must parse as an ES module -------------------
function parseCheck() {
  const dir = join(SITE, 'assets');
  if (!existsSync(dir)) die(`${dir} not found — did \`npm run build\` run?`);
  const chunks = readdirSync(dir).filter((f) => f.endsWith('.js'));
  if (chunks.length === 0) die(`no JS chunks in ${dir}`);
  const failures = [];
  for (const f of chunks) {
    try {
      acornParse(readFileSync(join(dir, f), 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' });
    } catch (e) {
      failures.push(`${f}: ${e.message}`);
    }
  }
  if (failures.length) {
    die(`${failures.length} asset chunk(s) are not valid JS (raw decorator leak / MODE 1):\n  ` + failures.join('\n  '));
  }
  console.log(`✓ parse gate: all ${chunks.length} asset chunks are valid ES modules`);
}

// --- tiny static file server for _site --------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.geojson': 'application/json',
  '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.ico': 'image/x-icon', '.parquet': 'application/octet-stream',
  '.xml': 'application/xml', '.db': 'application/octet-stream',
};

function startServer() {
  const server = createServer((req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let fsPath = join(SITE, p);
      if (existsSync(fsPath) && statSync(fsPath).isDirectory()) fsPath = join(fsPath, 'index.html');
      else if (!existsSync(fsPath) && existsSync(fsPath + '.html')) fsPath = fsPath + '.html';
      if (!existsSync(fsPath) || !statSync(fsPath).isFile()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'content-type': MIME[extname(fsPath)] || 'application/octet-stream' });
      res.end(readFileSync(fsPath));
    } catch {
      res.writeHead(500); res.end('server error');
    }
  });
  return new Promise((res) => server.listen(PORT, () => res(server)));
}

// --- Gate 2: boot the built site in a real browser --------------------------
async function bootCheck() {
  const server = await startServer();
  const browser = await chromium.launch({
    // Software WebGL so mapbox can try to init in headless CI; the gate does not
    // DEPEND on WebGL succeeding, these flags just reduce noise.
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage();
  const fatal = [];
  page.on('pageerror', (err) => { if (FATAL_ERROR.test(err.message)) fatal.push(String(err.message)); });
  page.on('console', (m) => { if (m.type() === 'error' && FATAL_ERROR.test(m.text())) fatal.push(m.text()); });

  let booted = false;
  let detail = 'unknown';
  try {
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: BOOT_TIMEOUT_MS });
    // Poll until the components upgrade and the @query accessor resolves (good
    // build) — or time out (broken build). WebGL-independent.
    booted = await page.waitForFunction(() => {
      if (!customElements.get('bee-atlas') || !customElements.get('bee-map')) return false;
      const map = document.querySelector('bee-atlas')?.shadowRoot?.querySelector('bee-map');
      const el = map && map.mapElement; // @query('#map') accessor — undefined under MODE 2
      return el instanceof HTMLElement && el.id === 'map';
    }, { timeout: BOOT_TIMEOUT_MS, polling: 250 }).then(() => true).catch(() => false);

    // One diagnostic snapshot (same page) to explain a failure precisely.
    detail = await page.evaluate(() => {
      const beeAtlas = !!customElements.get('bee-atlas');
      const beeMap = !!customElements.get('bee-map');
      const map = document.querySelector('bee-atlas')?.shadowRoot?.querySelector('bee-map');
      const mapEl = !beeMap ? '(bee-map not defined)' : !map ? '(no bee-map element)'
        : map.mapElement === undefined ? 'undefined (MODE 2: @query shadowed by class field)'
        : (map.mapElement?.id ?? String(map.mapElement));
      return `bee-atlas defined=${beeAtlas}, bee-map defined=${beeMap}, mapElement=${mapEl}`;
    }).catch((e) => `probe error: ${e.message}`);
  } finally {
    await browser.close();
    server.close();
  }

  if (!booted) {
    die(`app did not boot cleanly in a real browser.\n  ${detail}` + (fatal.length ? `\n  page errors:\n    ${fatal.join('\n    ')}` : ''));
  }
  if (fatal.length) {
    die(`app booted but emitted fatal page error(s):\n    ${fatal.join('\n    ')}`);
  }
  console.log('✓ boot gate: <bee-atlas>/<bee-map> upgraded and @query mapElement resolved (no fatal errors)');
}

parseCheck();
await bootCheck();
console.log('\n✅ smoke-boot PASSED — build is safe to deploy\n');
