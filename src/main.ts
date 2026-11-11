import './style.css';
import { detectLang, setLang } from './game/i18n';
import { dailyStatus, parseSave, SAVE_KEY } from './game/save';
import { Audio } from './platform/audio';
import { createPlatform } from './platform/sdk';
import { Game } from './puzzle/game';
import { LEVELS } from './puzzle/levels';
import { ICON } from './ui/icons';

/**
 * Boot. The portal SDK first (`init`, loading events), then the save, the language (saved choice, else the
 * portal's locale, else the browser's) and the game. CrazyGames and the web build land straight in the current
 * level; GameDistribution, GamePix, GameMonetize and Y8 show a title screen first (GD / GameMonetize: the first Play click
 * is the pre-roll, Y8: the `start` ad break; GamePix: the title only shows once `lifecycle.loaded()` resolved).
 * Web-build tooling: `?level=3` opens a level, `?auto=1` lets the solver bot play, `?capture=1` gives a script
 * frame-exact control through `window.__game`, `?cover=1` adds the logo for cover art, `?lang=de` picks a language.
 */
async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  // test tooling: the web build, or an e2e-only portal build (VITE_E2E=1, never shipped)
  const tooling = __PLATFORM__ === 'web' || import.meta.env.VITE_E2E === '1';
  const platform = createPlatform();
  const fonts = Promise.all([
    document.fonts.load("400 64px 'Lilita One'"),
    document.fonts.load("600 32px 'Fredoka'"),
    document.fonts.load("700 32px 'Fredoka'"),
  ]).catch(() => undefined);
  if (__PLATFORM__ === 'crazygames') await fonts;
  await platform.init();
  platform.loadingStart();
  await fonts;
  platform.loadingProgress(40);
  const save = parseSave(platform.getItem(SAVE_KEY));
  setLang(detectLang((tooling && params.get('lang')) || save.settings.lang, platform.locale()));
  const audio = new Audio();
  audio.setSound(save.settings.sound);
  audio.setMusic(save.settings.music);
  audio.setExternalMute(platform.muted);
  platform.onMuteChange = (m) => audio.setExternalMute(m);
  const app = document.getElementById('app')!;
  platform.onAdStart = () => {
    audio.suspend(true);
    app.classList.add('blocked');
  };
  platform.onAdEnd = () => {
    audio.suspend(false);
    app.classList.remove('blocked');
  };
  platform.loadingProgress(60);

  const mobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 820;
  const capture = tooling && params.has('capture');
  const game = new Game(document.getElementById('view') as HTMLCanvasElement, document.getElementById('ui')!, save, platform, audio, {
    quality: params.get('q') === 'low' || (mobile && params.get('q') !== 'high') ? 'low' : 'high',
    manual: capture,
    speed: tooling ? Number(params.get('speed') ?? 1) : 1,
  });
  // the portal paused the game (ad, pause event): freeze it and block input until it resumes
  platform.onPause = (p) => {
    game.frozen = p;
    app.classList.toggle('frozen', p);
  };
  platform.loadingProgress(90);
  document.getElementById('boot')?.remove();
  platform.loadingStop();
  await platform.ready();

  const lv = tooling ? Number(params.get('level') ?? 0) : 0;
  const begin = () => {
    game.start(lv ? LEVELS.findIndex((l) => l.id === lv) : game.unlocked());
    // returning players get the daily gift offered once per session (never during the first levels)
    if (!capture && !lv && game.unlocked() >= 2 && dailyStatus(save, new Date()).available) game.hud.menu('daily');
    game.loop();
  };
  if (__PLATFORM__ === 'gd' || __PLATFORM__ === 'gamepix' || __PLATFORM__ === 'gamemonetize' || __PLATFORM__ === 'y8') {
    game.hud.title(async () => {
      audio.unlock();
      await platform.midgame('preroll');
      begin();
    });
  } else begin();

  if (tooling) {
    game.autoplay = params.get('auto') === '1' || params.get('auto') === 'random';
    game.autoRandom = params.get('auto') === 'random';
    if (params.has('cover')) {
      const logo = document.createElement('div');
      logo.className = `logo cover ${params.get('cover')}`;
      const layered = (cls: string, text: string) => `<span class="${cls}"><span class="sh">${text}</span><span class="ol">${text}</span><span class="fg">${text}</span></span>`;
      logo.innerHTML = `${layered('l1', 'SCREW &amp;')}${layered('l2', 'RESCUE')}<span class="bolt">${ICON.gear}</span>`;
      document.getElementById('app')!.appendChild(logo);
      document.getElementById('ui')!.style.display = 'none';
      game.view.coverExtras();
    }
  }
  // script hooks: tooling builds, and the Playgama build (scripts/playgama/test.mjs drives it through window.__game)
  if (tooling || __PLATFORM__ === 'playgama') {
    (window as unknown as { __game: unknown }).__game = {
      game,
      step: (dt: number, n = 1) => {
        for (let i = 0; i < n; i++) game.advance(dt, i === n - 1);
      },
      start: (id: number, auto = true) => {
        game.start(LEVELS.findIndex((l) => l.id === id));
        game.autoplay = auto;
      },
      state: () => ({ level: LEVELS[game.index].id, mode: game.mode, taps: game.tapsDone, tray: game.puzzle.trayCount() }),
    };
  }
}

void boot();
