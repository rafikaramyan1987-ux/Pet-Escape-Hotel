import './style.css';
import { detectLang, setLang } from './game/i18n';
import { dailyStatus, parseSave, SAVE_KEY } from './game/save';
import { Audio } from './platform/audio';
import { detectSdk, Platform } from './platform/sdk';
import { Game } from './puzzle/game';
import { LEVELS } from './puzzle/levels';
import { ICON } from './ui/icons';

/**
 * Boot. CrazyGames: SDK.init() first, then loading events, and players land straight in the current level.
 * Web-build tooling: `?level=3` opens a level, `?auto=1` lets the solver bot play, `?capture=1` gives a script
 * frame-exact control through `window.__game`, `?cover=1` adds the logo for cover art.
 */
async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  await Promise.all([
    document.fonts.load("400 64px 'Lilita One'"),
    document.fonts.load("600 32px 'Fredoka'"),
    document.fonts.load("700 32px 'Fredoka'"),
  ]).catch(() => undefined);

  const platform = new Platform(detectSdk());
  await platform.init();
  platform.loadingStart();
  const save = parseSave(platform.getItem(SAVE_KEY));
  setLang(detectLang(save.settings.lang));
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

  const tooling = __TARGET__ !== 'crazygames';
  const mobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 820;
  const capture = tooling && params.has('capture');
  const game = new Game(document.getElementById('view') as HTMLCanvasElement, document.getElementById('ui')!, save, platform, audio, {
    quality: params.get('q') === 'low' || (mobile && params.get('q') !== 'high') ? 'low' : 'high',
    manual: capture,
  });
  document.getElementById('boot')?.remove();
  platform.loadingStop();
  const lv = tooling ? Number(params.get('level') ?? 0) : 0;
  game.start(lv ? LEVELS.findIndex((l) => l.id === lv) : game.unlocked());
  // returning players get the daily gift offered once per session (never during the first levels)
  if (!capture && !lv && game.unlocked() >= 2 && dailyStatus(save, new Date()).available) game.hud.menu('daily');
  if (tooling) {
    game.autoplay = params.get('auto') === '1';
    if (params.has('cover')) {
      const logo = document.createElement('div');
      logo.className = `logo cover ${params.get('cover')}`;
      const layered = (cls: string, text: string) => `<span class="${cls}"><span class="sh">${text}</span><span class="ol">${text}</span><span class="fg">${text}</span></span>`;
      logo.innerHTML = `${layered('l1', 'SCREW &amp;')}${layered('l2', 'RESCUE')}<span class="bolt">${ICON.gear}</span>`;
      document.getElementById('app')!.appendChild(logo);
      document.getElementById('ui')!.style.display = 'none';
      game.view.coverExtras();
    }
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
  game.loop();
}

void boot();
