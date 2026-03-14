import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// Plugin to handle .geojson imports as JSON modules (same as Vite's built-in JSON handling)
const geojsonPlugin = {
  name: 'geojson',
  transform(_code: string, id: string) {
    if (!id.endsWith('.geojson')) return null;
    const json = readFileSync(id, 'utf-8');
    return { code: `export default ${json};`, map: null };
  },
};

export default defineConfig({
  build: {
    sourcemap: true,
  },
  plugins: [geojsonPlugin],
});
