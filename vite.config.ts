import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

/**
 * Build-time platform layer: VITE_PLATFORM = web | crazygames | gd | gamepix | playgama (or `--mode <platform>`).
 * `__PLATFORM__` is defined as a literal, so each build only contains its own portal SDK code (src/platform/sdk.ts).
 *  - web (default, GitHub Pages → dist/): icons, no external script, no SDK, no ads.
 *  - crazygames (→ dist-crazygames/): the CrazyGames SDK v3 script tag in <head>.
 *  - gd (→ dist-gd/): GameDistribution; GD_OPTIONS + main.min.js are set up at boot (src/platform/gd.ts).
 *  - gamepix (→ dist-gamepix/): `window.GamePixConfig = { lifecycle: 'manual' }` and gamepix.sdk.js in <head>,
 *    before the game bundle.
 *  - playgama (→ dist-playgama/): Playgama Bridge 2.4.1 as `./playgama-bridge.js`, the first script in <head>, plus
 *    `playgama-bridge-config.json`; index.html + assets/ with relative paths (not a single file), no icons.
 * Portal builds are one self-contained index.html: styles, code and fonts inlined, no manifest, no icons, no
 * asset files, so the game makes no request of its own that could fail or be flagged as missing.
 */
const PLATFORMS = ['web', 'crazygames', 'gd', 'gamepix', 'playgama'] as const;
type PlatformName = (typeof PLATFORMS)[number];

export const CRAZYGAMES_SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
export const GAMEPIX_SDK_URL = 'https://integration.gamepix.com/sdk/v3/gamepix.sdk.js';

function platformFor(mode: string): PlatformName {
  const p = process.env.VITE_PLATFORM || (PLATFORMS.includes(mode as PlatformName) ? mode : 'web');
  if (!PLATFORMS.includes(p as PlatformName)) throw new Error(`unknown VITE_PLATFORM "${p}" (web | crazygames | gd | gamepix | playgama)`);
  return p as PlatformName;
}

const SDK_TAGS: Record<PlatformName, string> = {
  web: '',
  crazygames: `<script src="${CRAZYGAMES_SDK_URL}"></script>`,
  gd: '',
  gamepix: `<script>window.GamePixConfig = { lifecycle: 'manual' };</script>\n    <script src="${GAMEPIX_SDK_URL}"></script>`,
  playgama: '',
};

function portalBuild(platform: PlatformName): Plugin {
  return {
    name: 'portal-build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (platform === 'web') return html.replace(/\s*<!--\/?web-only-->/g, '').replace(/\s*<!--PLATFORM_SDK-->/, '');
        let out = html.replace(/\s*<!--web-only-->[\s\S]*?<!--\/web-only-->/, '');
        // Playgama: index.html + assets/ as files (Bridge is added by playgamaBridge())
        if (platform === 'playgama') return out.replace(/\s*<!--PLATFORM_SDK-->/, '');
        out = SDK_TAGS[platform] ? out.replace('<!--PLATFORM_SDK-->', SDK_TAGS[platform]) : out.replace(/\s*<!--PLATFORM_SDK-->/, '');
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

/**
 * Playgama build: Playgama Bridge 2.4.1 (vendor/playgama-bridge/, the official standalone `playgama` build) as
 * `./playgama-bridge.js`, the first script in <head>, loaded normally (not async), and `playgama-bridge-config.json`
 * beside index.html (Bridge loads it from there).
 */
function playgamaBridge(): Plugin {
  return {
    name: 'playgama-bridge',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => ({ html, tags: [{ tag: 'script', attrs: { src: './playgama-bridge.js' }, injectTo: 'head-prepend' }] }),
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'playgama-bridge.js', source: readFileSync('vendor/playgama-bridge/playgama-bridge.js') });
      this.emitFile({ type: 'asset', fileName: 'playgama-bridge-config.json', source: readFileSync('scripts/playgama/playgama-bridge-config.json') });
    },
  };
}

export default defineConfig(({ mode }) => {
  const platform = platformFor(mode);
  const portal = platform !== 'web';
  // CrazyGames / GD / GamePix: one self-contained index.html; web and Playgama: index.html + assets/
  const single = portal && platform !== 'playgama';
  return {
    base: './',
    define: {
      __PLATFORM__: JSON.stringify(platform),
    },
    plugins: [portalBuild(platform), ...(platform === 'playgama' ? [playgamaBridge()] : [])],
    // icons only for the web build
    publicDir: portal ? false : 'public',
    build: {
      // VITE_OUTDIR: e2e-only builds go elsewhere, so they never overwrite a shipped build
      outDir: process.env.VITE_OUTDIR || (portal ? `dist-${platform}` : 'dist'),
      target: 'es2020',
      // single-file portal builds: fonts and any other asset become data: URIs inside the single index.html
      assetsInlineLimit: single ? 100_000_000 : 0,
      chunkSizeWarningLimit: 2000,
      reportCompressedSize: false,
      modulePreload: false,
    },
  };
});
