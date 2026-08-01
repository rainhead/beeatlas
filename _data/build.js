import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

function pkgVersion(name) {
  try {
    const p = JSON.parse(
      readFileSync(join(repoRoot, 'node_modules', name, 'package.json'), 'utf8')
    );
    return p.version;
  } catch {
    return 'unknown';
  }
}

function gitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: repoRoot })
      .toString().trim();
  } catch {
    return 'unknown';
  }
}

/**
 * The build's timestamp, honoring SOURCE_DATE_EPOCH (the reproducible-builds
 * convention) when it is set — so two builds of one source snapshot produce a
 * byte-identical page (beeatlas-8df).
 *
 * This matters far out of proportion to the page it lands on.
 * `_scaffold-check/index.html` is an orphan diagnostic, but it is also the ONLY
 * file that differs between any two builds of the same inputs — ADR 0017 measured
 * exactly that while proving a scoped render equivalent to a full one, and had to
 * carve it out as an exception. Once the render is a Stelis graph node whose
 * identity is a tree digest over the page tree (stelis st-hdm), one wall-clock
 * stamp anywhere in that tree means the artifact can never cut off, and every
 * downstream step reruns on every build forever.
 *
 * data/feeds.py and data/topology_postprocess.py already honor it for the same
 * reason. This also extends the rule ADR 0019 stated for the bundle — "nothing
 * clock- or HEAD-derived belongs inside a content-hashed artifact" — to the pages.
 *
 * NOT fixed here: gitSha below, which changes on every commit whether or not it
 * touched the site. That costs early cutoff across commits rather than
 * determinism within one, and dropping it would remove real diagnostic value from
 * a page that exists to be diagnostic — so it is a deliberate leftover, not an
 * oversight.
 */
function builtAt() {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch) {
    const seconds = Number(epoch);
    // malformed → treat as unset, per the SOURCE_DATE_EPOCH spec
    if (Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString();
  }
  return new Date().toISOString();
}

export default {
  eleventyVersion: pkgVersion('@11ty/eleventy'),
  // No pluginVersion: @11ty/eleventy-plugin-vite is gone (beeatlas-d3y, ADR 0016).
  // Eleventy and Vite now run as separate build steps that meet at the manifest, so
  // there is no bridging plugin whose version means anything.
  viteVersion: pkgVersion('vite'),
  litVersion: pkgVersion('lit'),
  nodeVersion: process.version,
  builtAt: builtAt(),
  gitSha: gitSha(),
};
