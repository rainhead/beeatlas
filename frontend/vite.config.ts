/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    sourcemap: true,
  },
  test: {
    environment: 'happy-dom',
  },
});
