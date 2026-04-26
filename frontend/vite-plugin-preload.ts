import type { Plugin } from 'vite';

/**
 * Injects <link rel="preload"> tags for critical assets so the browser
 * starts fetching them before JS execution discovers them.
 *
 * - WASM files: detected from the build output bundle (content-hashed names).
 * - Parquet data: known static path, preloaded as fetch.
 */
export default function preloadAssets(): Plugin {
  return {
    name: 'preload-assets',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const tags: ReturnType<Extract<Plugin['transformIndexHtml'], Function>> = [];
        // Scan bundle for WASM assets
        if (ctx.bundle) {
          for (const name of Object.keys(ctx.bundle)) {
            if (name.endsWith('.wasm')) {
              (tags as any[]).push({
                tag: 'link',
                attrs: {
                  rel: 'preload',
                  href: `/${name}`,
                  as: 'fetch',
                  crossorigin: 'anonymous',
                },
                injectTo: 'head',
              });
            }
          }
        }
        // Parquet data file (stable path, no content hash)
        (tags as any[]).push({
          tag: 'link',
          attrs: {
            rel: 'preload',
            href: '/data/occurrences.parquet',
            as: 'fetch',
            crossorigin: 'anonymous',
          },
          injectTo: 'head',
        });
        return tags as any;
      },
    },
  };
}
