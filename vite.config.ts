import { defineConfig, type Plugin } from 'vite';

/**
 * Two build targets:
 *  - default ("production"): GitHub Pages build (icons, PWA manifest, no external scripts at all).
 *  - "crazygames": the official CrazyGames SDK v3 script tag in <head> (loaded from CrazyGames' own URL,
 *    as their docs require), and everything else inlined into a single index.html: no manifest, no icons,
 *    no asset files, so the game makes no request of its own that could fail or be flagged as missing.
 */
function crazyGames(enabled: boolean): Plugin {
  return {
    name: 'crazygames-build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!enabled) return html.replace(/\s*<!--\/?web-only-->/g, '');
        let out = html
          .replace(/\s*<!--web-only-->[\s\S]*?<!--\/web-only-->/, '')
          .replace('<!--CRAZYGAMES_SDK-->', '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>');
        const bundle = ctx.bundle;
        if (!bundle) return out;
        // inline the stylesheet and the module script, then drop the files from the output
        out = out.replace(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/, (tag, file: string) => {
          const asset = bundle[file];
          if (!asset || asset.type !== 'asset') return tag;
          delete bundle[file];
          return `<style>${String(asset.source)}</style>`;
        });
        out = out.replace(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/, (tag, file: string) => {
          const chunk = bundle[file];
          if (!chunk || chunk.type !== 'chunk') return tag;
          delete bundle[file];
          return `<script type="module">${chunk.code.replace(/<\/script/gi, '<\\/script')}</script>`;
        });
        return out;
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const cg = mode === 'crazygames';
  return {
    base: './',
    define: {
      __TARGET__: JSON.stringify(cg ? 'crazygames' : 'web'),
    },
    plugins: [crazyGames(cg)],
    // icons only for the web build
    publicDir: cg ? false : 'public',
    build: {
      outDir: cg ? 'dist-crazygames' : 'dist',
      target: 'es2020',
      // CrazyGames: fonts and any other asset become data: URIs inside the single index.html
      assetsInlineLimit: cg ? 100_000_000 : 0,
      chunkSizeWarningLimit: 2000,
      reportCompressedSize: false,
      modulePreload: false,
    },
  };
});
