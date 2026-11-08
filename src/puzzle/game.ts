import { Pipeline } from '../render/pipeline';
import type { Audio } from '../platform/audio';
import type { Platform } from '../platform/sdk';
import { type SaveData, SAVE_KEY, recordRoom } from '../game/save';
import { t } from '../game/i18n';
import { LEVELS } from './levels';
import { Puzzle } from './model';
import { hint } from './solver';
import { PuzzleView } from './view';
import { Hud } from '../ui/hud';

export type Mode = 'play' | 'won' | 'lost';

/** Coins for a rescue: grows slowly with the level, a bonus on boss levels, a little less after retries. */
export function rewardFor(level: number, fails: number): number {
  const base = 10 + Math.floor(level / 2) + (level % 10 === 0 ? 25 : 0);
  return Math.max(5, base - fails * 2);
}

/**
 * Screw & Rescue controller: one level at a time (model + 3D view), tap input, tutorial hand,
 * results, progress and the CrazyGames gameplay events around real play only.
 */
export class Game {
  readonly pipe: Pipeline;
  readonly hud: Hud;
  puzzle!: Puzzle;
  view!: PuzzleView;
  index = 0;
  mode: Mode = 'play';
  autoplay = false;
  private botWait = 0.9;
  private resultShown = false;
  private last = performance.now();
  private taps = 0;
  /** Fails on the current level (stars, hints). */
  fails = 0;
  vibrate = true;
  private autoNext = 0;

  constructor(readonly canvas: HTMLCanvasElement, uiRoot: HTMLElement, readonly save: SaveData, readonly platform: Platform, readonly audio: Audio, readonly opts: { quality: 'high' | 'low'; manual: boolean }) {
    const first = new PuzzleView(new Puzzle(LEVELS[0]), save.looks.dog, opts.quality);
    this.pipe = new Pipeline(canvas, first.scene, first.camera, { ao: opts.quality === 'high', bloom: true, pixelRatio: Math.min(window.devicePixelRatio, opts.quality === 'high' ? 2 : 1.5) });
    this.pipe.setBloom(0.35, 0.5, 1.1);
    this.pipe.setVignette(0.22);
    this.hud = new Hud(this, uiRoot);
    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('pointerdown', (e) => this.onPointer(e));
  }

  persist(): void {
    this.platform.setItem(SAVE_KEY, JSON.stringify(this.save));
  }

  /** Highest level the player may open (index). */
  unlocked(): number {
    let i = 0;
    while (i < LEVELS.length - 1 && this.save.rooms[String(LEVELS[i].id)]) i++;
    return i;
  }

  start(index: number): void {
    this.index = Math.max(0, Math.min(LEVELS.length - 1, index));
    const def = LEVELS[this.index];
    this.puzzle = new Puzzle(def);
    this.view = new PuzzleView(this.puzzle, this.save.looks[def.pet], this.opts.quality);
    this.view.onSound = (s) => this.audio.play(s);
    this.pipe.setScene(this.view.scene);
    this.pipe.setCamera(this.view.camera);
    this.resize();
    this.mode = 'play';
    this.resultShown = false;
    this.taps = 0;
    this.fails = 0;
    this.botWait = 1.2;
    this.hud.level(def.id, def.tutorial === true);
    this.platform.gameplayStart();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.pipe.setSize(w, h);
    this.view?.layout(w / h);
  }

  private onPointer(e: PointerEvent): void {
    this.audio.unlock();
    if (this.mode !== 'play' || this.autoplay) return;
    const r = this.canvas.getBoundingClientRect();
    const id = this.view.pick(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    if (id >= 0) this.tap(id);
    else this.hud.ripple(e.clientX, e.clientY, false);
  }

  tap(id: number): void {
    const ev = this.puzzle.tap(id);
    if (!ev.length) return;
    this.taps++;
    const r = this.canvas.getBoundingClientRect();
    const sc = this.view.screenOf(id, r.width, r.height);
    this.hud.ripple(sc.x + r.left, sc.y + r.top, true);
    this.view.apply(ev);
    if (this.vibrate && this.save.settings.sound) navigator.vibrate?.(12);
    if (ev.some((e) => e.type === 'won')) this.mode = 'won';
    if (ev.some((e) => e.type === 'lost')) this.mode = 'lost';
  }

  /** The tutorial hand / hint target: the solver's best next screw. */
  hintScrew(): number {
    if (this.mode !== 'play') return -1;
    return hint(this.puzzle);
  }

  next(): void {
    this.platform.policy.roomsDone++;
    void this.platform.maybeMidgame().then(() => {
      const n = this.index + 1;
      if (n >= LEVELS.length) {
        this.hud.moreSoon();
        return;
      }
      this.start(n);
    });
  }

  retry(): void {
    const keep = this.fails + 1;
    this.start(this.index);
    this.fails = keep;
  }

  private finish(): void {
    this.resultShown = true;
    this.platform.gameplayStop();
    if (this.mode === 'won') {
      const def = LEVELS[this.index];
      this.platform.happytime();
      const coins = rewardFor(def.id, this.fails);
      const before = this.save.coins;
      const stars = this.fails === 0 ? 3 : this.fails === 1 ? 2 : 1;
      recordRoom(this.save, String(def.id), stars, 3, 0);
      this.save.coins = before + coins;
      this.persist();
      this.audio.play('coin');
      this.hud.won(t(def.pet), coins, stars, before);
    } else {
      this.hud.lost();
    }
  }

  advance(dt: number, render = true): void {
    dt = Math.min(dt, 0.1);
    this.view.update(dt);
    if (this.mode === 'play' && this.autoplay) {
      this.botWait -= dt;
      if (this.botWait <= 0 && !this.view.busy()) this.botWait = 0;
      if (this.botWait <= 0) {
        const s = hint(this.puzzle);
        if (s >= 0) this.tap(s);
        this.botWait = 1.0;
      }
    }
    if (!this.resultShown && this.mode === 'won' && this.view.rescueTime > 1.8) {
      this.finish();
      this.autoNext = 1.6;
    }
    // the bot (recordings, e2e) presses "Next" by itself
    if (this.autoplay && this.resultShown && this.mode === 'won' && this.autoNext > 0) {
      this.autoNext -= dt;
      if (this.autoNext <= 0 && this.index + 1 < LEVELS.length) this.start(this.index + 1);
    }
    if (!this.resultShown && this.mode === 'lost' && !this.view.busy()) this.finish();
    this.hud.frame(dt);
    if (render) this.pipe.render();
  }

  loop = (): void => {
    const now = performance.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    if (!this.opts.manual) this.advance(dt);
    requestAnimationFrame(this.loop);
  };

  get tapsDone(): number {
    return this.taps;
  }
}
