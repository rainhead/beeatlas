import { defineConfig } from 'vite';
import preloadAssets from './vite-plugin-preload.ts';

export default defineConfig({
  plugins: [preloadAssets()],
  optimizeDeps: {
    exclude: ['wa-sqlite'],
  },
  build: {
    sourcemap: true,
  },
  test: {
    environment: 'happy-dom',
    passWithNoTests: true,
  },
});
