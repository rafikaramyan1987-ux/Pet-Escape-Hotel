import * as THREE from 'three';
import { Bot } from '../core/bot';
import { type Level, type PetKind, type XY, isPipe, parseLevel } from '../core/level';
import { findPath } from '../core/path';
import { FLOOR_NAMES, ROOMS } from '../core/rooms';
import { DT, Sim, type SimEvent } from '../core/sim';
import { Pipeline } from '../render/pipeline';
import { RoomView } from '../render/roomView';
import type { Audio } from '../platform/audio';
import type { Platform } from '../platform/sdk';
import { renderPortraits } from '../ui/portraits';
import { type Lang, getLang, name, setLang, t } from './i18n';
import { type SaveData, SAVE_KEY, recordRoom, starsFor } from './save';
import { UI } from '../ui/screens';

export type Mode = 'menu' | 'play' | 'paused' | 'caught' | 'won' | 'intro';

/**
 * Game controller: owns the renderer, the current room (sim + 3D view), input, progress and the flow between
 * menus and rooms. The sim runs at a fixed 30 Hz step; rendering interpolates at display rate.
 */
export class Game {
  readonly camera = new THREE.PerspectiveCamera(36, 1, 0.3, 200);
  readonly pipe: Pipeline;
  readonly ui: UI;
  level: Level | null = null;
  sim: Sim | null = null;
  view: RoomView | null = null;
  bot: Bot | null = null;
  mode: Mode = 'menu';
  camMode: 'follow' | 'map' = 'follow';
  private acc = 0;
  private last = performance.now();
  private introLeft = 0;
  private menuScene: RoomView | null = null;
  private menuT = 0;
  portraits: Record<PetKind, string> | null = null;
  /** Capture mode: time is advanced by the script, not the clock. */
  readonly manual: boolean;
  autoplay = false;
  private hintUntil = 0;
  private held = new Set<string>();
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly canvas: HTMLCanvasElement, readonly uiRoot: HTMLElement, readonly save: SaveData, readonly platform: Platform, readonly audio: Audio, opts: { quality: 'high' | 'low'; manual: boolean }) {
    this.manual = opts.manual;
    const empty = new THREE.Scene();
    this.pipe = new Pipeline(canvas, empty, this.camera, { ao: opts.quality === 'high', bloom: true, pixelRatio: Math.min(window.devicePixelRatio, opts.quality === 'high' ? 2 : 1.5) });
    this.pipe.setBloom(0.55, 0.6, 1.0);
    this.quality = opts.quality;
    this.ui = new UI(this, uiRoot);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindInput();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'play') this.pause();
    });
  }

  readonly quality: 'high' | 'low';

  persist(): void {
    this.platform.setItem(SAVE_KEY, JSON.stringify(this.save));
  }

  refreshPortraits(): void {
    this.portraits = renderPortraits(160, this.save.looks);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 40 : 34;
    this.camera.updateProjectionMatrix();
    this.pipe.setSize(w, h);
  }

  // ─── rooms ───────────────────────────────────────────────────────────────
  roomIndex(id: string): number {
    return ROOMS.findIndex((r) => r.id === id);
  }

  isUnlocked(i: number): boolean {
    if (i <= 0) return true;
    const prev = ROOMS[i - 1].id;
    return !!this.save.rooms[prev] || this.save.skipped.includes(prev);
  }

  /** First room not finished yet (or the last one). */
  currentRoom(): number {
    const i = ROOMS.findIndex((r, idx) => this.isUnlocked(idx) && !this.save.rooms[r.id] && !this.save.skipped.includes(r.id));
    return i < 0 ? ROOMS.length - 1 : i;
  }

  showMenuScene(): void {
    if (!this.menuScene) {
      this.menuScene = new RoomView(parseLevel(ROOMS[7]), this.save.looks, this.quality);
    }
    this.view?.dispose();
    this.view = null;
    this.sim = null;
    this.level = null;
    this.pipe.setScene(this.menuScene.scene);
    this.mode = 'menu';
    this.platform.gameplayStop();
  }

  startRoom(i: number): void {
    const def = ROOMS[i];
    this.level = parseLevel(def);
    this.view?.dispose();
    this.view = new RoomView(this.level, this.save.looks, this.quality);
    this.sim = new Sim(this.level);
    this.bot = new Bot(this.sim, {});
    this.pipe.setScene(this.view.scene);
    this.camMode = 'map';
    this.view.updateCamera(this.camera, 1, 'map', null);
    this.introLeft = 1.6;
    this.mode = 'intro';
    this.hintUntil = 0;
    this.view.showHint(null);
    this.ui.hud();
    const tipFloor = def.room === 1 && !this.save.seenTips.includes(def.floor) && !this.manual;
    if (tipFloor) {
      this.mode = 'paused';
      this.ui.tip(def.floor, () => {
        this.save.seenTips.push(def.floor);
        this.persist();
        this.mode = 'intro';
        this.ui.hud();
      });
    }
    this.platform.gameplayStart();
  }

  restart(): void {
    if (this.level) this.startRoom(this.roomIndex(this.level.id));
  }

  pause(): void {
    if (this.mode !== 'play' && this.mode !== 'intro') return;
    this.mode = 'paused';
    this.platform.gameplayStop();
    this.ui.pause();
  }

  resume(): void {
    if (!this.sim) return;
    this.mode = 'play';
    this.platform.gameplayStart();
    this.ui.hud();
  }

  // ─── hints / skip ────────────────────────────────────────────────────────
  hintPath(): XY[] {
    if (!this.level || !this.sim) return [];
    const s = new Sim(this.level);
    s.gateOpen = true;
    const pos: Partial<Record<PetKind, XY>> = { ...this.level.starts };
    const out: XY[] = [];
    for (const step of this.level.def.plan) {
      const [fx, fy] = pos[step.pet]!;
      const p = findPath(s, step.pet, fx, fy, step.to[0], step.to[1], { gate: true }) ?? [];
      out.push(...p);
      pos[step.pet] = step.to;
    }
    return out;
  }

  showHint(): void {
    if (!this.view) return;
    this.view.showHint(this.hintPath());
    this.hintUntil = performance.now() + 9000;
    this.toast(t('hintShown'));
  }

  async skipRoom(): Promise<boolean | 'unavailable'> {
    if (!this.level) return false;
    const ok = await this.platform.rewarded();
    if (ok !== true) return ok;
    if (!this.save.skipped.includes(this.level.id)) this.save.skipped.push(this.level.id);
    this.persist();
    const i = this.roomIndex(this.level.id);
    if (i + 1 < ROOMS.length) this.startRoom(i + 1);
    else this.goHome();
    return true;
  }

  goHome(): void {
    this.showMenuScene();
    this.ui.home();
  }

  async nextRoom(): Promise<void> {
    if (!this.level) return;
    const i = this.roomIndex(this.level.id);
    this.platform.policy.roomsDone++;
    await this.platform.maybeMidgame();
    if (i + 1 < ROOMS.length) this.startRoom(i + 1);
    else this.goHome();
  }

  // ─── abilities / commands ────────────────────────────────────────────────
  setActive(kind: PetKind): void {
    if (!this.sim) return;
    const p = this.sim.pet(kind);
    if (!p || p.escaped || this.sim.active === kind) return;
    this.sim.setActive(kind);
    this.audio.play('switch');
    this.camMode = 'follow';
    this.ui.updateHud();
  }

  cycle(): void {
    if (!this.sim) return;
    this.sim.cycle();
    this.audio.play('switch');
    this.camMode = 'follow';
    this.ui.updateHud();
  }

  /** The context ability next to the active pet, as a 1–2 step path. */
  abilityMove(): XY[] | null {
    const sim = this.sim;
    if (!sim) return null;
    const p = sim.pet(sim.active);
    if (!p || p.escaped || p.move) return null;
    const dirs: XY[] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    // prefer the facing direction
    const fx = Math.round(Math.cos(p.dir));
    const fy = Math.round(Math.sin(p.dir));
    dirs.sort((a, b) => (b[0] === fx && b[1] === fy ? 1 : 0) - (a[0] === fx && a[1] === fy ? 1 : 0));
    const here = sim.tile(p.tx, p.ty);
    for (const [dx, dy] of dirs) {
      const nx = p.tx + dx;
      const ny = p.ty + dy;
      const ch = sim.tile(nx, ny);
      if (p.kind === 'dog' && ch === 'F') {
        const bx = nx + dx;
        const by = ny + dy;
        return sim.canEnter('dog', bx, by) && sim.tile(bx, by) !== 'F' ? [[nx, ny], [bx, by]] : [[nx, ny]];
      }
      if (p.kind === 'cat' && ch === 'H' && here !== 'H') return [[nx, ny]];
      if (p.kind === 'cat' && here === 'H' && ch !== 'H' && sim.canEnter('cat', nx, ny)) return [[nx, ny]];
      if (p.kind === 'hamster' && ch === 'h') {
        const bx = nx + dx;
        const by = ny + dy;
        return sim.canEnter('hamster', bx, by) ? [[nx, ny], [bx, by]] : [[nx, ny]];
      }
      if (p.kind === 'hamster' && isPipe(ch)) return [[nx, ny]];
    }
    return null;
  }

  useAbility(): void {
    const m = this.abilityMove();
    if (!m || !this.sim) return;
    this.sim.moveTo(this.sim.active, m);
  }

  tapAt(nx: number, ny: number): void {
    if (!this.sim || !this.view || this.mode !== 'play') return;
    const pet = this.view.pickPet(this.camera, nx, ny);
    if (pet && pet !== this.sim.active) {
      this.setActive(pet);
      return;
    }
    const tile = this.view.pick(this.camera, nx, ny);
    if (!tile) return;
    const p = this.sim.pet(this.sim.active)!;
    const path = findPath(this.sim, p.kind, p.tx, p.ty, tile[0], tile[1]);
    if (path) {
      this.sim.moveTo(p.kind, path);
      this.camMode = 'follow';
      this.ui.tapMarker(nx, ny, true);
    } else this.ui.tapMarker(nx, ny, false);
  }

  private bindInput(): void {
    let down: { x: number; y: number; id: number } | null = null;
    this.canvas.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      down = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!down || down.id !== e.pointerId) return;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < 14) {
        const r = this.canvas.getBoundingClientRect();
        this.tapAt(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      }
      down = null;
    });
    window.addEventListener('keydown', (e) => {
      this.audio.unlock();
      if (e.repeat && !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const k = e.key.toLowerCase();
      if (this.mode !== 'play' && this.mode !== 'intro') {
        if (k === 'escape' && this.mode === 'paused' && this.sim) this.resume();
        return;
      }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'z', 'q'].includes(k)) {
        this.held.add(k);
        e.preventDefault();
      }
      if (k === 'shift') this.setRun(true);
      if (k === '1') this.setActive('dog');
      if (k === '2') this.setActive('cat');
      if (k === '3') this.setActive('hamster');
      if (k === 'tab') {
        e.preventDefault();
        this.cycle();
      }
      if (k === ' ' || k === 'e') {
        e.preventDefault();
        this.useAbility();
      }
      if (k === 'm') this.toggleMap();
      if (k === 'r') this.restart();
      if (k === 'escape' || k === 'p') this.pause();
      this.updateHeld();
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      this.held.delete(k);
      if (k === 'shift') this.setRun(false);
      this.updateHeld();
    });
    window.addEventListener('blur', () => {
      this.held.clear();
      this.updateHeld();
    });
  }

  private updateHeld(): void {
    if (!this.sim) return;
    const h = this.held;
    let dx = 0;
    let dy = 0;
    if (h.has('arrowup') || h.has('w') || h.has('z')) dy = -1;
    else if (h.has('arrowdown') || h.has('s')) dy = 1;
    else if (h.has('arrowleft') || h.has('a') || h.has('q')) dx = -1;
    else if (h.has('arrowright') || h.has('d')) dx = 1;
    this.sim.held = dx || dy ? [dx, dy] : null;
    if (dx || dy) this.camMode = 'follow';
  }

  setRun(on: boolean): void {
    if (!this.sim) return;
    this.sim.run = on;
    this.ui.updateHud();
  }

  toggleMap(): void {
    this.camMode = this.camMode === 'map' ? 'follow' : 'map';
    this.ui.updateHud();
  }

  setLang(l: Lang): void {
    setLang(l);
    this.save.settings.lang = l;
    this.persist();
  }

  get lang(): Lang {
    return getLang();
  }

  // ─── frame ───────────────────────────────────────────────────────────────
  private onEvents(ev: SimEvent[]): void {
    const sim = this.sim!;
    for (const e of ev) {
      switch (e.type) {
        case 'step':
          if (e.pet === sim.active) this.audio.play(e.run ? 'run' : 'step');
          if (sim.tile(sim.pet(e.pet)!.tx, sim.pet(e.pet)!.ty) === '~') this.audio.play('squeak');
          break;
        case 'dig': this.audio.play('dig'); break;
        case 'jump': this.audio.play('jump'); break;
        case 'pipe': this.audio.play('pipe'); break;
        case 'bone':
          this.audio.play('bone');
          this.toast(`${t('gotBone')} ${sim.bones.filter(Boolean).length}/${sim.bones.length}`);
          break;
        case 'key':
          this.audio.play('key');
          this.toast(t('gotKey'));
          break;
        case 'locked':
          this.audio.play('locked');
          this.toast(t('needKey'));
          break;
        case 'escape': this.audio.play('coin'); break;
        case 'gate': this.audio.play('gate'); break;
        case 'suspicious': this.audio.play('suspicious'); break;
        case 'wake': this.audio.play('wake'); break;
        case 'alert': this.audio.play('alert'); break;
        case 'caught': this.onCaught(e); break;
        case 'won': this.onWon(); break;
      }
    }
    if (ev.some((e) => e.type === 'bone' || e.type === 'escape' || e.type === 'key')) this.ui.updateHud();
  }

  private onCaught(e: Extract<SimEvent, { type: 'caught' }>): void {
    this.audio.play('caught');
    this.mode = 'caught';
    this.platform.gameplayStop();
    const id = this.level!.id;
    this.save.fails[id] = (this.save.fails[id] ?? 0) + 1;
    this.persist();
    const who = e.by === 'camera' ? null : t((this.level!.def.guards[e.index].skin ?? 'porter') as 'porter');
    this.ui.caught(who, t(e.pet), this.save.fails[id]);
  }

  private onWon(): void {
    const sim = this.sim!;
    const level = this.level!;
    this.audio.play('win');
    this.mode = 'won';
    const bones = sim.bones.filter(Boolean).length;
    const stars = starsFor(bones, level.bones.length, sim.spotted);
    const coins = recordRoom(this.save, level.id, stars, bones, sim.t);
    this.persist();
    if (level.def.room === 8) this.platform.happytime();
    this.platform.gameplayStop();
    this.ui.won(stars, bones, !sim.spotted, coins, level.def.room === 8 ? level.def.floor : 0);
  }

  toast(msg: string): void {
    this.ui.toast(msg);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.ui.toast(''), 2200);
  }

  /** Advance the game by dt seconds (real time or capture). */
  advance(dt: number, render = true): void {
    dt = Math.min(dt, 0.1);
    if (this.mode === 'menu' && this.menuScene) {
      this.menuT += dt;
      const ms = this.menuScene;
      const sim = this.menuSim ?? (this.menuSim = new Sim(ms.level));
      for (const g of sim.guards) g.mode = 'sleep';
      ms.sync(sim, dt, 'dog');
      const f = ms.hull();
      const c = new THREE.Vector3();
      for (const p of f) c.add(p);
      c.divideScalar(f.length);
      const portrait = this.camera.aspect < 1;
      const yaw = 18 + Math.sin(this.menuT * 0.12) * 14;
      const target = c.clone();
      target.y = 0.4;
      this.camera.position.set(target.x + Math.sin((yaw * Math.PI) / 180) * 14, portrait ? 19 : 13, target.z + Math.cos((yaw * Math.PI) / 180) * 14 + (portrait ? 4 : 0));
      this.camera.lookAt(target.x, portrait ? -1.5 : 0, target.z - (portrait ? 1 : 0));
      if (render) this.pipe.render();
      return;
    }
    const sim = this.sim;
    const view = this.view;
    if (!sim || !view) {
      if (render) this.pipe.render();
      return;
    }
    if (this.mode === 'intro') {
      this.introLeft -= dt;
      if (this.introLeft <= 0) {
        this.mode = 'play';
        this.camMode = 'follow';
      }
    }
    if (this.mode === 'play') {
      this.acc += dt;
      while (this.acc >= DT) {
        this.acc -= DT;
        if (this.autoplay && this.bot) this.bot.think();
        const ev = sim.step(DT);
        if (ev.length) this.onEvents(ev);
        if (sim.status !== 'play') break;
      }
    }
    if (this.hintUntil && performance.now() > this.hintUntil && !this.manual) {
      view.showHint(null);
      this.hintUntil = 0;
    }
    if (sim.active !== this.lastActive) {
      this.lastActive = sim.active;
      this.ui.updateHud();
    }
    view.sync(sim, dt, sim.active);
    const active = view.pets.get(sim.active);
    view.updateCamera(this.camera, dt, this.mode === 'intro' ? 'map' : this.camMode, active && active.root.visible ? active.root.position : null);
    this.ui.frame();
    if (render) this.pipe.render();
  }

  private menuSim: Sim | null = null;
  private lastActive: PetKind | null = null;

  loop = (): void => {
    const now = performance.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    if (!this.manual) this.advance(dt);
    requestAnimationFrame(this.loop);
  };

  floorName(f: number): string {
    return name(FLOOR_NAMES[f - 1]);
  }
}
