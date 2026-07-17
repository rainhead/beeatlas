// Where the build-time data readers (_data/*.js, scripts/validate-*.mjs) load
// artifacts from. Stelis's `site` task (st-ak1, stelis ADR 0007) injects
// EXPORT_DIR into the render's env so Eleventy reads the artifacts of the build
// that invoked it; without it (npm run dev, vitest, a bare npm run build) the
// committed/local public/data is the source.
import { isAbsolute, join, resolve } from 'node:path';

export function buildDataDir(repoRoot) {
  const dir = process.env.EXPORT_DIR;
  if (dir) return isAbsolute(dir) ? dir : resolve(dir);
  return join(repoRoot, 'public', 'data');
}
