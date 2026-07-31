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

export default {
  eleventyVersion: pkgVersion('@11ty/eleventy'),
  // No pluginVersion: @11ty/eleventy-plugin-vite is gone (beeatlas-d3y, ADR 0016).
  // Eleventy and Vite now run as separate build steps that meet at the manifest, so
  // there is no bridging plugin whose version means anything.
  viteVersion: pkgVersion('vite'),
  litVersion: pkgVersion('lit'),
  nodeVersion: process.version,
  builtAt: new Date().toISOString(),
  gitSha: gitSha(),
};
