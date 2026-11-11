import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

/**
 * Build-time platform layer: VITE_PLATFORM = web | crazygames | gd | gamepix | playgama | gamemonetize | y8 (or `--mode <platform>`).
 * `__PLATFORM__` is defined as a literal, so each build only contains its own portal SDK code (src/platform/sdk.ts).
 *  - web (default, GitHub Pages → dist/): icons, no external script, no SDK, no ads.
 *  - crazygames (→ dist-crazygames/): the CrazyGames SDK v3 script tag in <head>.
 *  - gd (→ dist-gd/): GameDistribution; GD_OPTIONS + main.min.js are set up at boot (src/platform/gd.ts).
 *  - gamepix (→ dist-gamepix/): `window.GamePixConfig = { lifecycle: 'manual' }` and gamepix.sdk.js in <head>,
 *    before the game bundle.
 *  - playgama (→ dist-playgama/): Playgama Bridge from Playgama's CDN, the first script in <head>, initialized
 *    before the game bundle runs, plus `playgama-bridge-config.json`; index.html + assets/ with relative paths (not a
 *    single file), no icons.
 *  - gamemonetize (→ dist-gamemonetize/): GameMonetize; SDK_OPTIONS + sdk.js are set up once at boot (src/platform/gamemonetize.ts).
 *  - y8 (→ dist-y8/): `<script src="https://cdn.y8.com/minimal-sdk/2-0/y8.min.js" async>` in <head>, from Y8's CDN
 *    only (never bundled); initialized by src/platform/y8.ts.
 * Portal builds are one self-contained index.html: styles, code and fonts inlined, no manifest, no icons, no
 * asset files, so the game makes no request of its own that could fail or be flagged as missing.
 */
const PLATFORMS = ['web', 'crazygames', 'gd', 'gamepix', 'playgama', 'gamemonetize', 'y8'] as const;
type PlatformName = (typeof PLATFORMS)[number];

export const CRAZYGAMES_SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
export const GAMEPIX_SDK_URL = 'https://integration.gamepix.com/sdk/v3/gamepix.sdk.js';
export const Y8_SDK_URL = 'https://cdn.y8.com/minimal-sdk/2-0/y8.min.js';

function platformFor(mode: string): PlatformName {
  const p = process.env.VITE_PLATFORM || (PLATFORMS.includes(mode as PlatformName) ? mode : 'web');
  if (!PLATFORMS.includes(p as PlatformName)) throw new Error(`unknown VITE_PLATFORM "${p}" (web | crazygames | gd | gamepix | playgama | gamemonetize | y8)`);
  return p as PlatformName;
}

const SDK_TAGS: Record<PlatformName, string> = {
  web: '',
  crazygames: `<script src="${CRAZYGAMES_SDK_URL}"></script>`,
  gd: '',
  gamepix: `<script>window.GamePixConfig = { lifecycle: 'manual' };</script>\n    <script src="${GAMEPIX_SDK_URL}"></script>`,
  playgama: '',
  gamemonetize: '',
  y8: `<script src="${Y8_SDK_URL}" async></script>`,
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
 * Playgama build, as Playgama's docs set it up for plain JS (wiki.playgama.com/playgama/bridge-sdk/setup and
 * bridge-sdk/api "Required steps"):
 * - Bridge from Playgama's CDN, `https://bridge.playgama.com/v2/stable/playgama-bridge.js` (the recommended option: it
 *   loads the adapter of the platform the game runs on, the QA Tool's `qa_tool` one included), the first script in
 *   <head>, loaded normally (not async / defer / module);
 * - right after it, scripts/playgama/boot.js inlined: `bridge.initialize()`, and the game bundle starts only once that
 *   has settled (the module script is held as <script type="text/plain" data-playgama-game data-src=…> until then);
 * - `playgama-bridge-config.json` beside index.html (Bridge loads it from `./playgama-bridge-config.json`).
 */
export const PLAYGAMA_BRIDGE_CDN = 'https://bridge.playgama.com/v2/stable/playgama-bridge.js';
/** scripts/playgama/boot.js without its comment lines (they name the tags it handles) */
const playgamaBoot = () =>
  readFileSync('scripts/playgama/boot.js', 'utf8')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n')
    .trim();
function playgamaBridge(): Plugin {
  return {
    name: 'playgama-bridge',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => ({
        html,
        tags: [
          { tag: 'script', attrs: { src: PLAYGAMA_BRIDGE_CDN }, injectTo: 'head-prepend' },
          { tag: 'script', children: playgamaBoot(), injectTo: 'head-prepend' },
        ],
      }),
    },
    generateBundle: {
      order: 'post',
      handler(_o, bundle) {
        this.emitFile({ type: 'asset', fileName: 'playgama-bridge-config.json', source: readFileSync('scripts/playgama/playgama-bridge-config.json') });
        const html = Object.values(bundle).find((a) => a.type === 'asset' && a.fileName.endsWith('.html'));
        if (!html || html.type !== 'asset' || typeof html.source !== 'string') return;
        let held = 0;
        // hold every game module script until boot.js starts it
        html.source = html.source.replace(/<script type="module"([^>]*)>/g, (_m, attrs: string) => {
          held++;
          const src = attrs.match(/\ssrc="([^"]+)"/)?.[1];
          return `<script type="text/plain" data-playgama-game${src ? ` data-src="${src}"` : ''}>`;
        });
        if (!held) throw new Error('playgama build: no game module script to hold until bridge.initialize()');
      },
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
