import { Pipeline } from '../render/pipeline';
import type { Audio } from '../platform/audio';
import type { Platform } from '../platform/sdk';
import { BOOSTER_PRICE, type Booster, type SaveData, SAVE_KEY, recordLevel } from '../game/save';
import { bossHat, petId, petOfLevel, type PetVariant } from '../game/collection';
import { itemName } from '../game/shop';
import { t } from '../game/i18n';
import { LEVELS } from './levels';
import { type LoseReason, Puzzle } from './model';
import { MECHANIC_INTRO, type Mechanic } from './mechanics';
import { hint } from './solver';
import { PuzzleView } from './view';
import { Hud } from '../ui/hud';

export type Mode = 'play' | 'won' | 'lost';

/** Coins for a rescue: grows slowly with the level, a bonus on boss levels, a little less after retries. */
export function rewardFor(level: number, fails: number): number {
  const base = 10 + Math.floor(level / 2) + (level % 10 === 0 ? 25 : 0);
  return Math.max(5, base - fails * 2);
}

/** Camera rotation is offered from this level on (never needed to solve a level). */
export const ORBIT_FROM = 20;
/** The hint bulb appears after this many fails on a level (never automatic). */
export const HINT_AFTER = 2;
export const MAX_TRAY = 8;

/**
 * Screw & Rescue controller: one level at a time (model + 3D view), tap input, tutorial hand, boosters, hints,
 * results, progress and the portal's gameplay events around real play only.
 */
export class Game {
  readonly pipe: Pipeline;
  readonly hud: Hud;
  puzzle!: Puzzle;
  view!: PuzzleView;
  pet!: PetVariant;
  index = 0;
  mode: Mode = 'play';
  autoplay = false;
  /** Waiting for the player to pick a plank to smash. */
  hammerMode = false;
  /** A menu panel is open (gameplay paused). */
  paused = false;
  /** The portal paused the game (an ad, a pause event): nothing moves and input is ignored until it resumes. */
  frozen = false;
  /** Autoplay bot: seconds between taps (recordings speed it up). */
  botDelay = 1.0;
  botWait = 0.9;
  /** Autoplay taps random removable screws instead of the solver's (shows how a careless player fails). */
  autoRandom = false;
  private seed = 12345;
  private rand(): number {
    this.seed = (this.seed * 1103515245 + 12345) >>> 0;
    return this.seed / 4294967296;
  }
  /** Autoplay presses "Next" by itself (off for trailers, which end on the result card). */
  autoAdvance = true;
  private resultShown = false;
  private last = performance.now();
  private taps = 0;
  /** Moves used on this level (taps, plus 2 per booster); undo does not give moves back. */
  moves = 0;
  /** The solver's minimum: every screw out once, ice screws take two taps. */
  minMoves = 0;
  /** Level whose "watch an ad for +1 slot" continue was used (once per level). */
  adContinueLevel = -1;
  /** Fails on the current level (hints). */
  fails = 0;
  private autoNext = 0;
  private orbit = 0;
  private drag: { x: number; o: number; id: number } | null = null;
  /** Hint screw currently shown (-1 none). */
  hintTarget = -1;
  /** Why the level was lost. */
  lostReason: LoseReason = 'tray';
  /** One continue per attempt, and each booster once per attempt, so boosters never make a level trivial. */
  continued = false;
  usedBoosters = new Set<Booster>();

  constructor(readonly canvas: HTMLCanvasElement, uiRoot: HTMLElement, readonly save: SaveData, readonly platform: Platform, readonly audio: Audio, readonly opts: { quality: 'high' | 'low'; manual: boolean; speed?: number }) {
    const first = new PuzzleView(new Puzzle(LEVELS[0]), save.looks.dog, opts.quality);
    this.pipe = new Pipeline(canvas, first.scene, first.camera, { ao: opts.quality === 'high', bloom: true, pixelRatio: Math.min(window.devicePixelRatio, opts.quality === 'high' ? 2 : 1.5) });
    this.pipe.setBloom(0.35, 0.5, 1.1);
    this.pipe.setVignette(0.22);
    first.dispose();
    this.hud = new Hud(this, uiRoot);
    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('pointerdown', (e) => this.onPointer(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    const up = (e: PointerEvent) => {
      if (this.drag?.id === e.pointerId) this.drag = null;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }

  get def() {
    return LEVELS[this.index];
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

  /** Put the current puzzle on screen (a fresh level, or a rebuilt one after undo / continue). */
  private mount(): void {
    const old = this.view;
    this.view = new PuzzleView(this.puzzle, this.save.looks[this.def.pet], this.opts.quality, this.pet.fur);
    this.view.onSound = (s) => this.audio.play(s);
    this.pipe.setScene(this.view.scene);
    this.pipe.setCamera(this.view.camera);
    old?.dispose();
    this.resize();
    this.view.setOrbit(this.orbit);
  }

  start(index: number): void {
    this.index = Math.max(0, Math.min(LEVELS.length - 1, index));
    const def = this.def;
    this.pet = petOfLevel(def.id, def.pet);
    this.puzzle = new Puzzle(def);
    this.orbit = 0;
    this.mount();
    this.mode = 'play';
    this.resultShown = false;
    this.hammerMode = false;
    this.hintTarget = -1;
    this.taps = 0;
    this.moves = 0;
    this.minMoves = this.puzzle.screws.length + this.puzzle.screws.filter((x) => x.ice).length;
    if (this.adContinueLevel !== def.id) this.adContinueLevel = -1;
    this.continued = false;
    this.usedBoosters.clear();
    this.fails = this.save.fails[String(def.id)] ?? 0;
    this.botWait = 1.2;
    this.hud.level(def.id, def.tutorial === true);
    // a new mechanic gets a one-screen tip on its first level (once)
    const intro = (Object.keys(MECHANIC_INTRO) as Mechanic[]).find((m) => MECHANIC_INTRO[m] === def.id);
    if (intro && !this.save.seenTips.includes(def.id) && !this.autoplay && !this.opts.manual) {
      this.save.seenTips.push(def.id);
      this.persist();
      this.hud.mechanicTip(intro);
    }
    if (def.id === ORBIT_FROM && !this.save.seenTips.includes(ORBIT_FROM)) {
      this.save.seenTips.push(ORBIT_FROM);
      this.persist();
      this.hud.toast(t('rotateHint'), 3);
    } else if (def.id % 10 === 0 && def.id >= 20) this.hud.toast(t('bossLevel'), 2.5);
    if (!this.paused) this.platform.gameplayStart();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.pipe.setSize(w, h);
    this.view?.layout(w / h);
  }

  private local(e: PointerEvent): { x: number; y: number; w: number; h: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  }

  private onPointer(e: PointerEvent): void {
    this.audio.unlock();
    if (this.mode !== 'play' || this.autoplay || this.paused || this.frozen) return;
    const p = this.local(e);
    if (this.hammerMode) {
      const plank = this.view.pickPlank(p.x, p.y, p.w, p.h);
      if (plank >= 0) this.smash(plank);
      return;
    }
    const id = this.view.pick(p.x, p.y, p.w, p.h);
    if (id >= 0) {
      this.tap(id);
      return;
    }
    const blocked = this.view.blockedAt(p.x, p.y, p.w, p.h);
    if (blocked >= 0) {
      if (this.puzzle.isLocked(blocked)) {
        this.view.wiggleLock(blocked);
        this.hud.toast(t('lockedHint'), 1.8);
      } else this.hud.toast(t('stickyHint'), 1.8);
      return;
    }
    // from level 20 a drag on empty space turns the view a little (optional: every screw is reachable without it)
    if (this.def.id >= ORBIT_FROM) this.drag = { x: e.clientX, o: this.orbit, id: e.pointerId };
    else this.hud.ripple(e.clientX, e.clientY, false);
  }

  private onMove(e: PointerEvent): void {
    if (!this.drag || this.drag.id !== e.pointerId || this.mode !== 'play') return;
    this.orbit = Math.max(-0.55, Math.min(0.55, this.drag.o + ((e.clientX - this.drag.x) / window.innerWidth) * 1.6));
    this.view.setOrbit(this.orbit);
  }

  tap(id: number): void {
    const ev = this.puzzle.tap(id);
    if (!ev.length) return;
    this.taps++;
    this.moves++;
    if (this.hintTarget >= 0) this.showHint(-1);
    const r = this.canvas.getBoundingClientRect();
    const sc = this.view.screenOf(id, r.width, r.height);
    this.hud.ripple(sc.x + r.left, sc.y + r.top, true);
    this.view.apply(ev);
    this.buzz(12);
    this.afterMove(ev);
  }

  private afterMove(ev: ReturnType<Puzzle['tap']>): void {
    this.hud.moves();
    for (const e of ev) {
      if (e.type === 'won') this.mode = 'won';
      if (e.type === 'lost') {
        this.mode = 'lost';
        this.lostReason = e.reason;
      }
    }
    this.hud.boosters();
  }

  private buzz(ms: number): void {
    if (this.save.settings.vibration) navigator.vibrate?.(ms);
  }

  /** The tutorial hand / hint target: the solver's best next screw. */
  hintScrew(): number {
    if (this.mode !== 'play') return -1;
    return hint(this.puzzle);
  }

  get hintAvailable(): boolean {
    return this.fails >= HINT_AFTER && this.mode === 'play';
  }

  /** Show (or clear with -1) the hint ring + hand on a screw. */
  showHint(id = this.hintScrew()): void {
    this.hintTarget = id;
    this.view.highlight(id);
  }

  // ─── boosters ────────────────────────────────────────────────────────────
  canUse(b: Booster): boolean {
    if (this.mode !== 'play' || this.paused || this.autoplay || this.usedBoosters.has(b)) return false;
    if (b === 'slot') return this.puzzle.tray.length < MAX_TRAY;
    if (b === 'undo') return this.puzzle.undoActions() !== null;
    return this.puzzle.plankGone.some((g) => !g);
  }

  /** Pay for a booster: from stock, then coins, else an optional rewarded ad. Resolves true when paid. */
  async pay(b: Booster): Promise<boolean> {
    if (this.save.boosters[b] > 0) {
      this.save.boosters[b]--;
      this.persist();
      return true;
    }
    if (this.save.coins >= BOOSTER_PRICE[b]) {
      this.save.coins -= BOOSTER_PRICE[b];
      this.persist();
      return true;
    }
    // no ads in this build (web): the button just says the coins are missing
    if (!this.platform.adsEnabled) {
      this.hud.toast(t('notEnough'), 1.6);
      return false;
    }
    if (await this.watchAd()) return true;
    this.hud.noAd(b);
    return false;
  }

  /** Optional rewarded ad, only ever from a button the player tapped. Rewarded only if the ad really completed. */
  async watchAd(): Promise<boolean> {
    return (await this.platform.requestAd('rewarded')) === 'finished';
  }

  /** Stars by moves used, against the solver's minimum. */
  starsFor(moves: number): number {
    return moves <= this.minMoves ? 3 : moves <= this.minMoves + 3 ? 2 : 1;
  }

  async useBooster(b: Booster): Promise<void> {
    if (b === 'hammer' && this.hammerMode) {
      this.hammerMode = false;
      this.hud.toast('');
      this.hud.boosters();
      return;
    }
    if (!this.canUse(b)) {
      if (b === 'undo') this.hud.toast(t('nothingToUndo'), 1.6);
      return;
    }
    if (b === 'hammer') {
      // pay only once a plank is picked
      this.hammerMode = true;
      this.hud.toast(t('hammerHint'), 0);
      this.hud.boosters();
      return;
    }
    if (!(await this.pay(b)) || !this.canUse(b)) return;
    this.usedBoosters.add(b);
    this.moves += 2;
    this.audio.play('pop');
    if (b === 'slot') {
      this.view.apply(this.puzzle.addTraySlot());
    } else {
      this.puzzle = Puzzle.replay(this.def, this.puzzle.undoActions()!);
      this.mount();
    }
    this.hud.boosters();
  }

  private async smash(plank: number): Promise<void> {
    this.hammerMode = false;
    this.hud.toast('');
    if (!(await this.pay('hammer'))) {
      this.hud.boosters();
      return;
    }
    const ev = this.puzzle.hammer(plank);
    this.usedBoosters.add('hammer');
    this.moves += 2;
    this.view.apply(ev);
    this.buzz(30);
    this.afterMove(ev);
  }

  /**
   * Fail card: "Watch an ad for +1 tray slot and continue", once per level (the same moves replayed with one more
   * slot; only when the tray filled up and one more slot really gets you going again).
   */
  canContinue(): boolean {
    if (!this.platform.adsEnabled || this.mode !== 'lost' || this.lostReason !== 'tray' || this.adContinueLevel === this.def.id || this.puzzle.tray.length >= MAX_TRAY) return false;
    return Puzzle.replay(this.def, [{ t: 'slot' }, ...this.puzzle.history]).status === 'play';
  }

  async continueWithAd(): Promise<void> {
    if (!this.canContinue()) return;
    if (!(await this.watchAd())) {
      this.hud.noAd('continue');
      return;
    }
    this.adContinueLevel = this.def.id;
    this.continued = true;
    this.puzzle = Puzzle.replay(this.def, [{ t: 'slot' }, ...this.puzzle.history]);
    this.mount();
    this.mode = this.puzzle.status === 'won' ? 'won' : 'play';
    this.resultShown = false;
    this.hud.level(this.def.id, false);
    this.platform.gameplayStart();
  }

  // ─── flow ────────────────────────────────────────────────────────────────
  next(): void {
    this.platform.policy.roomsDone++;
    void this.platform.midgame('between').then(() => {
      const n = this.index + 1;
      if (n >= LEVELS.length) {
        this.hud.moreSoon();
        return;
      }
      this.start(n);
    });
  }

  retry(): void {
    // Y8: Retry on the fail card is a natural break too (a `next` ad break, paced by the Y8 SDK); other builds: instant
    if (__PLATFORM__ === 'y8') {
      void this.platform.midgame('between').then(() => this.start(this.index));
      return;
    }
    this.start(this.index);
  }

  setPaused(p: boolean): void {
    this.paused = p;
    if (p) this.platform.gameplayStop();
    else if (this.mode === 'play') this.platform.gameplayStart();
  }

  private finish(): void {
    this.resultShown = true;
    this.platform.gameplayStop();
    const def = this.def;
    if (this.mode === 'won') {
      this.platform.happytime();
      const coins = rewardFor(def.id, this.fails);
      const before = this.save.coins;
      const stars = this.starsFor(this.moves);
      recordLevel(this.save, def.id, stars);
      this.save.coins = before + coins;
      const pid = petId(this.pet);
      const newPet = !this.save.pets.includes(pid);
      if (newPet) this.save.pets.push(pid);
      const hat = bossHat(def.id);
      const newHat = hat && !this.save.owned.includes(hat) ? hat : null;
      if (newHat) this.save.owned.push(newHat);
      this.persist();
      this.audio.play('coin');
      const petName = this.pet.v === 0 ? t(def.pet) : this.pet.name;
      const extra = [newPet ? t('newPet') : '', newHat ? t('newHat', { hat: itemName(newHat) }) : ''].filter(Boolean);
      this.hud.won(petName, coins, stars, before, extra);
    } else {
      this.fails++;
      this.save.fails[String(def.id)] = this.fails;
      this.persist();
      this.platform.sadMoment();
      this.audio.play('fail');
      this.buzz(60);
      this.hud.lost(this.lostReason);
    }
  }

  advance(dt: number, render = true): void {
    dt = Math.min(dt, 0.1);
    if (this.frozen) {
      if (render) this.pipe.render();
      return;
    }
    this.view.update(dt);
    if (this.mode === 'play' && this.autoplay && !this.paused) {
      this.botWait -= dt;
      if (this.botWait <= 0 && !this.view.busy()) this.botWait = 0;
      if (this.botWait <= 0) {
        // the solver bot, or (recordings) a bot that taps a random removable screw
        const free = this.puzzle.freeScrews();
        const s = this.autoRandom ? (free.length ? free[Math.floor(this.rand() * free.length)] : -1) : hint(this.puzzle);
        if (s >= 0) this.tap(s);
        this.botWait = this.botDelay;
      }
    }
    if (!this.resultShown && this.mode === 'won' && this.view.rescueTime > 1.8) {
      this.finish();
      this.autoNext = 1.6;
    }
    // the bot (recordings, e2e) presses "Next" by itself
    if (this.autoplay && this.autoAdvance && this.resultShown && this.mode === 'won' && this.autoNext > 0) {
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
    // tooling (`?speed=3`, e2e): several game steps per rendered frame, so slow software rendering can't stretch a test
    const n = Math.max(1, Math.min(8, Math.round(this.opts.speed ?? 1)));
    if (!this.opts.manual) for (let i = 0; i < n; i++) this.advance(dt, i === n - 1);
    requestAnimationFrame(this.loop);
  };

  get tapsDone(): number {
    return this.taps;
  }
}
