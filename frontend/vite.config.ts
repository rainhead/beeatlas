import { defineConfig } from 'vite';

export default defineConfig({
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
