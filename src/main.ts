import './style.css';
import { ROOMS } from './core/rooms';
import { Game } from './game/game';
import { detectLang, setLang } from './game/i18n';
import { parseSave, SAVE_KEY } from './game/save';
import { Audio } from './platform/audio';
import { detectSdk, Platform } from './platform/sdk';

/**
 * Boot. `?shot=…` keeps the phase-1 art showcase (renders in docs/art). Otherwise the game runs.
 * Tooling (web build only): `?room=2-4` jumps to a room, `?auto=1` lets the playtest bot play it,
 * `?capture=1` gives a script frame-exact control through `window.__game`.
 */
async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  await Promise.all([
    document.fonts.load("400 64px 'Lilita One'"),
    document.fonts.load("600 32px 'Fredoka'"),
    document.fonts.load("700 32px 'Fredoka'"),
  ]).catch(() => undefined);

  if (__TARGET__ !== 'crazygames' && params.has('shot')) {
    const { bootShowcase } = await import('./showcase/boot');
    await bootShowcase(params);
    return;
  }

  const platform = new Platform(detectSdk());
  await platform.init(); // SDK.init() first, then every other SDK call
  platform.loadingStart();
  const save = parseSave(platform.getItem(SAVE_KEY));
  setLang(detectLang(save.settings.lang));
  const audio = new Audio();
  audio.setSound(save.settings.sound);
  audio.setMusic(save.settings.music);
  audio.setExternalMute(platform.muted);
  platform.onMuteChange = (m) => audio.setExternalMute(m);
  const input = document.getElementById('app')!;
  platform.onAdStart = () => {
    audio.suspend(true);
    input.classList.add('blocked');
  };
  platform.onAdEnd = () => {
    audio.suspend(false);
    input.classList.remove('blocked');
  };

  const mobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 820;
  const tooling = __TARGET__ !== 'crazygames';
  const capture = tooling && params.has('capture');
  const game = new Game(document.getElementById('view') as HTMLCanvasElement, document.getElementById('ui')!, save, platform, audio, {
    quality: params.get('q') === 'low' || (mobile && params.get('q') !== 'high') ? 'low' : 'high',
    manual: capture,
  });
  document.getElementById('boot')?.remove();
  platform.loadingStop();

  const roomParam = tooling ? params.get('room') : null;
  if (roomParam) {
    const i = ROOMS.findIndex((r) => r.id === roomParam);
    save.seenTips = [1, 2, 3, 4, 5];
    game.startRoom(Math.max(0, i));
    game.autoplay = params.get('auto') === '1';
  } else if (__TARGET__ === 'crazygames') {
    // players land directly in gameplay, on their current room
    game.startRoom(game.currentRoom());
  } else {
    game.showMenuScene();
    game.ui.home();
  }
  if (tooling) {
    (window as unknown as { __game: unknown }).__game = {
      game,
      step: (dt: number, n = 1) => {
        for (let i = 0; i < n; i++) game.advance(dt, i === n - 1);
      },
      start: (id: string, auto = true) => {
        save.seenTips = [1, 2, 3, 4, 5];
        game.startRoom(ROOMS.findIndex((r) => r.id === id));
        game.autoplay = auto;
      },
      state: () => ({ mode: game.mode, status: game.sim?.status, room: game.level?.id, active: game.sim?.active }),
    };
  }
  game.loop();
}

void boot();
