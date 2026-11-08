import {
  type Level, type PetKind, type XY, blocksSight, guardCanEnter, isHideTile, isPipe, key, petCanEnter,
} from './level';

/**
 * Deterministic game simulation (no rendering, no DOM): the browser game, the unit tests and the playtest bot
 * all drive this same code with a fixed time step.
 */
export const DT = 1 / 30;
export const WALK = 0.22;
export const RUN = 0.13;
export const DIG = 0.55;
export const JUMP = 0.32;
export const FOV = (33 * Math.PI) / 180; // half angle of a flashlight cone
export const CATCH_DIST = 1.05;

export type MoveType = 'walk' | 'run' | 'dig' | 'jump' | 'pipe';
export interface Move {
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
  type: MoveType;
}

export interface PetState {
  kind: PetKind;
  /** Tile the pet occupies (destination while moving). */
  tx: number;
  ty: number;
  move: Move | null;
  escaped: boolean;
  /** Queued step targets (tap-to-move). */
  path: XY[];
  running: boolean;
  /** Facing (rad) for the renderer. */
  dir: number;
}

export type GuardMode = 'patrol' | 'suspicious' | 'look' | 'chase' | 'return' | 'sleep';
export interface GuardState {
  x: number;
  y: number;
  dir: number;
  mode: GuardMode;
  meter: number;
  wp: number;
  forward: boolean;
  route: XY[];
  wait: number;
  timer: number;
  /** Investigation / chase target. */
  gx: number;
  gy: number;
  lostFor: number;
  baseDir: number;
  /** Sees a pet this tick. */
  sees: boolean;
}

export interface CamState {
  dir: number;
  meter: number;
  sees: boolean;
}

export type SimEvent =
  | { type: 'step' | 'dig' | 'jump' | 'pipe' | 'pipeOut'; pet: PetKind; run?: boolean }
  | { type: 'bone'; index: number; pet: PetKind }
  | { type: 'key'; pet: PetKind }
  | { type: 'locked'; pet: PetKind }
  | { type: 'escape'; pet: PetKind }
  | { type: 'noise'; x: number; y: number; r: number }
  | { type: 'suspicious' | 'alert' | 'calm' | 'wake'; guard: number }
  | { type: 'caught'; by: 'guard' | 'camera'; index: number; pet: PetKind }
  | { type: 'gate'; open: boolean }
  | { type: 'won' };

const rad = (deg: number): number => (deg * Math.PI) / 180;
const wrap = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export class Sim {
  readonly level: Level;
  t = 0;
  pets: PetState[];
  guards: GuardState[];
  cams: CamState[];
  bones: boolean[];
  hasKey: boolean;
  active: PetKind;
  run = false;
  held: XY | null = null;
  status: 'play' | 'won' | 'caught' = 'play';
  spotted = false;
  gateOpen = false;
  events: SimEvent[] = [];

  constructor(level: Level) {
    this.level = level;
    this.pets = level.pets.map((kind) => {
      const [x, y] = level.starts[kind]!;
      return { kind, tx: x, ty: y, move: null, escaped: false, path: [], running: false, dir: Math.PI / 2 };
    });
    this.active = level.pets[0];
    this.bones = level.bones.map(() => false);
    this.hasKey = level.key === null;
    this.guards = level.def.guards.map((g) => {
      const [x, y] = g.path[0];
      const face = rad(g.face ?? (g.turn ? g.turn[0] : 90));
      return {
        x, y, dir: face, baseDir: face, mode: g.sleep ? 'sleep' : 'patrol', meter: 0, wp: 0, forward: true,
        route: [], wait: g.path.length > 1 ? 0.6 : 0, timer: 0, gx: x, gy: y, lostFor: 0, sees: false,
      };
    });
    this.cams = (level.def.cams ?? []).map((c) => ({ dir: rad(c.from), meter: 0, sees: false }));
    this.updateGate();
  }

  clone(): Sim {
    const s = Object.create(Sim.prototype) as Sim;
    Object.assign(s, this);
    s.pets = this.pets.map((p) => ({ ...p, move: p.move ? { ...p.move } : null, path: p.path.slice() }));
    s.guards = this.guards.map((g) => ({ ...g, route: g.route.slice() }));
    s.cams = this.cams.map((c) => ({ ...c }));
    s.bones = this.bones.slice();
    s.events = [];
    s.held = this.held ? [this.held[0], this.held[1]] : null;
    return s;
  }

  // ─── queries ──────────────────────────────────────────────────────────────
  tile(x: number, y: number): string {
    if (x < 0 || y < 0 || x >= this.level.w || y >= this.level.h) return '#';
    return this.level.tiles[y][x];
  }

  pet(kind: PetKind): PetState | undefined {
    return this.pets.find((p) => p.kind === kind);
  }

  /** Continuous position of a pet (tile units). */
  petPos(p: PetState): XY {
    if (!p.move || p.move.type === 'pipe') return [p.tx, p.ty];
    const k = Math.min(1, p.move.t / p.move.dur);
    return [p.move.fx + (p.move.tx - p.move.fx) * k, p.move.fy + (p.move.ty - p.move.fy) * k];
  }

  /** The tile that counts for detection: the one the pet is mostly in. */
  petTile(p: PetState): XY {
    if (!p.move) return [p.tx, p.ty];
    return p.move.t / p.move.dur < 0.5 ? [p.move.fx, p.move.fy] : [p.move.tx, p.move.ty];
  }

  isHidden(p: PetState): boolean {
    if (p.escaped) return true;
    if (p.move?.type === 'pipe') return true;
    const [x, y] = this.petTile(p);
    const ch = this.tile(x, y);
    if (isHideTile(ch)) return true;
    if (ch === 'H' && p.kind === 'cat') return true;
    if (ch === 'h') return true;
    return false;
  }

  canEnter(kind: PetKind, x: number, y: number): boolean {
    return petCanEnter(kind, this.tile(x, y), this.gateOpen || this.gateHeld(x, y));
  }

  private gateHeld(x: number, y: number): boolean {
    return this.tile(x, y) === 'X' && this.pets.some((p) => !p.escaped && p.tx === x && p.ty === y);
  }

  sightBlocked(x: number, y: number): boolean {
    const ch = this.tile(x, y);
    if (blocksSight(ch)) return true;
    if (ch === 'X' && !this.gateOpen) return true;
    return false;
  }

  /** March a ray from (x,y) along `dir`; returns the free distance up to `range`. */
  castRay(x: number, y: number, dir: number, range: number): number {
    const step = 0.1;
    const dx = Math.cos(dir);
    const dy = Math.sin(dir);
    const sx = Math.round(x);
    const sy = Math.round(y);
    for (let d = step; d <= range; d += step) {
      const cx = Math.round(x + dx * d);
      const cy = Math.round(y + dy * d);
      if (cx === sx && cy === sy) continue; // cameras sit on a wall tile
      if (this.sightBlocked(cx, cy)) return Math.max(0, d - step);
    }
    return range;
  }

  lineOfSight(ax: number, ay: number, bx: number, by: number): boolean {
    const dist = Math.hypot(bx - ax, by - ay);
    const n = Math.ceil(dist / 0.1);
    for (let i = 1; i < n; i++) {
      const k = i / n;
      const cx = Math.round(ax + (bx - ax) * k);
      const cy = Math.round(ay + (by - ay) * k);
      if (cx === Math.round(bx) && cy === Math.round(by)) return true;
      if (cx === Math.round(ax) && cy === Math.round(ay)) continue;
      if (this.sightBlocked(cx, cy)) return false;
    }
    return true;
  }

  guardRange(i: number): number {
    return this.level.def.guards[i].range ?? 4.5;
  }

  /** Can the light (guard i or camera) at (x,y) facing dir with range r see the tile point (px,py)? */
  sees(x: number, y: number, dir: number, r: number, px: number, py: number): boolean {
    const dx = px - x;
    const dy = py - y;
    const d = Math.hypot(dx, dy);
    if (d > r) return false;
    if (d > 0.6 && Math.abs(wrap(Math.atan2(dy, dx) - dir)) > FOV) return false;
    return this.lineOfSight(x, y, px, py);
  }

  remainingRequired(): PetKind[] {
    return this.level.required.filter((k) => !this.pet(k)!.escaped);
  }

  // ─── commands ─────────────────────────────────────────────────────────────
  setActive(kind: PetKind): void {
    const p = this.pet(kind);
    if (p && !p.escaped) this.active = kind;
  }

  cycle(): void {
    const alive = this.pets.filter((p) => !p.escaped);
    if (!alive.length) return;
    const i = alive.findIndex((p) => p.kind === this.active);
    this.active = alive[(i + 1) % alive.length].kind;
  }

  /** Queue a path for a pet (tap-to-move). Returns false when unreachable. */
  moveTo(kind: PetKind, path: XY[] | null): boolean {
    const p = this.pet(kind);
    if (!p || p.escaped) return false;
    if (!path) return false;
    p.path = path;
    p.running = this.run;
    return true;
  }

  // ─── step ────────────────────────────────────────────────────────────────
  step(dt = DT): SimEvent[] {
    this.events = [];
    if (this.status !== 'play') return this.events;
    this.t += dt;
    for (const p of this.pets) this.updatePet(p, dt);
    this.updateGate();
    const noises = this.events.filter((e): e is Extract<SimEvent, { type: 'noise' }> => e.type === 'noise');
    for (let i = 0; i < this.guards.length; i++) this.updateGuard(i, dt, noises);
    for (let i = 0; i < this.cams.length; i++) this.updateCam(i, dt);
    if (this.status === 'play' && this.remainingRequired().length === 0) {
      this.status = 'won';
      this.events.push({ type: 'won' });
    }
    return this.events;
  }

  private updateGate(): void {
    const open = this.pets.some((p) => !p.escaped && this.tile(...this.petTile(p)) === 'x');
    if (open !== this.gateOpen) {
      this.gateOpen = open;
      this.events.push({ type: 'gate', open });
    }
  }

  private updatePet(p: PetState, dt: number): void {
    if (p.escaped) return;
    if (p.move) {
      p.move.t += dt;
      if (p.move.t >= p.move.dur) this.arrive(p);
      return;
    }
    let next: XY | null = null;
    if (p.kind === this.active && this.held) {
      next = [p.tx + this.held[0], p.ty + this.held[1]];
      p.path = [];
      p.running = this.run;
    } else if (p.path.length) {
      next = p.path[0];
    }
    if (!next) return;
    const [nx, ny] = next;
    if (Math.abs(nx - p.tx) + Math.abs(ny - p.ty) !== 1 || !this.canEnter(p.kind, nx, ny)) {
      p.path = [];
      return;
    }
    if (p.path.length && p.path[0] === next) p.path.shift();
    this.startMove(p, nx, ny, p.kind === this.active ? this.run || p.running : p.running);
  }

  private startMove(p: PetState, nx: number, ny: number, running: boolean): void {
    const from = this.tile(p.tx, p.ty);
    const to = this.tile(nx, ny);
    let type: MoveType = running ? 'run' : 'walk';
    let dur = running ? RUN : WALK;
    if (to === 'F' && p.kind === 'dog') {
      type = 'dig';
      dur = DIG;
      this.noise(nx, ny, 1.5);
      this.events.push({ type: 'dig', pet: p.kind });
    } else if ((to === 'H') !== (from === 'H')) {
      type = 'jump';
      dur = JUMP;
      this.events.push({ type: 'jump', pet: p.kind });
    } else if (to === 'h') {
      dur = WALK * 1.4;
    }
    p.dir = Math.atan2(ny - p.ty, nx - p.tx);
    p.move = { fx: p.tx, fy: p.ty, tx: nx, ty: ny, t: 0, dur, type };
    p.tx = nx;
    p.ty = ny;
  }

  private arrive(p: PetState): void {
    const m = p.move!;
    p.move = null;
    const ch = this.tile(p.tx, p.ty);
    if (m.type === 'pipe') {
      this.events.push({ type: 'pipeOut', pet: p.kind });
    } else {
      this.events.push({ type: 'step', pet: p.kind, run: m.type === 'run' });
      if (m.type === 'run') this.noise(p.tx, p.ty, 3);
      if (ch === '~') this.noise(p.tx, p.ty, m.type === 'run' ? 4 : 3.2);
      if (p.kind === 'hamster' && isPipe(ch)) {
        const [ox, oy] = this.level.pipes.get(key(p.tx, p.ty))!;
        const dur = 0.3 + 0.08 * (Math.abs(ox - p.tx) + Math.abs(oy - p.ty));
        p.move = { fx: p.tx, fy: p.ty, tx: ox, ty: oy, t: 0, dur, type: 'pipe' };
        p.tx = ox;
        p.ty = oy;
        this.events.push({ type: 'pipe', pet: p.kind });
        return;
      }
    }
    this.level.bones.forEach(([bx, by], i) => {
      if (!this.bones[i] && bx === p.tx && by === p.ty) {
        this.bones[i] = true;
        this.events.push({ type: 'bone', index: i, pet: p.kind });
      }
    });
    if (this.level.key && !this.hasKey && this.level.key[0] === p.tx && this.level.key[1] === p.ty) {
      this.hasKey = true;
      this.events.push({ type: 'key', pet: p.kind });
    }
    if (ch === 'E') {
      if (!this.hasKey) {
        this.events.push({ type: 'locked', pet: p.kind });
      } else {
        p.escaped = true;
        p.path = [];
        this.events.push({ type: 'escape', pet: p.kind });
        if (this.active === p.kind) {
          const next = this.pets.find((q) => !q.escaped);
          if (next) this.active = next.kind;
        }
      }
    }
  }

  private noise(x: number, y: number, r: number): void {
    this.events.push({ type: 'noise', x, y, r });
  }

  // ─── staff ───────────────────────────────────────────────────────────────
  private route(fx: number, fy: number, tx: number, ty: number): XY[] {
    const sx = Math.round(fx);
    const sy = Math.round(fy);
    if (sx === tx && sy === ty) return [[tx, ty]];
    const prev = new Map<number, number>();
    const q: XY[] = [[sx, sy]];
    prev.set(key(sx, sy), -1);
    let found = false;
    // unreachable targets: head for the closest reachable tile instead
    let bestK = key(sx, sy);
    let bestD = Math.hypot(tx - sx, ty - sy);
    while (q.length) {
      const [x, y] = q.shift()!;
      if (x === tx && y === ty) {
        found = true;
        break;
      }
      const d = Math.hypot(tx - x, ty - y);
      if (d < bestD) {
        bestD = d;
        bestK = key(x, y);
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        const k = key(nx, ny);
        if (prev.has(k)) continue;
        const ch = this.tile(nx, ny);
        if (!(guardCanEnter(ch, this.gateOpen) || (nx === tx && ny === ty && ch !== '#'))) continue;
        prev.set(k, key(x, y));
        q.push([nx, ny]);
      }
    }
    const out: XY[] = [];
    let k = found ? key(tx, ty) : bestK;
    while (k !== key(sx, sy)) {
      out.unshift([k % 64, Math.floor(k / 64)]);
      k = prev.get(k)!;
    }
    return out;
  }

  private turnTo(g: GuardState, target: number, dt: number, speed = 5): void {
    const d = wrap(target - g.dir);
    const s = speed * dt;
    g.dir = wrap(g.dir + Math.max(-s, Math.min(s, d)));
  }

  private walk(g: GuardState, speed: number, dt: number): boolean {
    if (!g.route.length) return true;
    const [tx, ty] = g.route[0];
    const dx = tx - g.x;
    const dy = ty - g.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-3) {
      g.route.shift();
      return !g.route.length;
    }
    this.turnTo(g, Math.atan2(dy, dx), dt, 7);
    const s = Math.min(d, speed * dt);
    g.x += (dx / d) * s;
    g.y += (dy / d) * s;
    if (s >= d - 1e-6) {
      g.x = tx;
      g.y = ty;
      g.route.shift();
    }
    return !g.route.length;
  }

  private updateGuard(i: number, dt: number, noises: Extract<SimEvent, { type: 'noise' }>[]): void {
    const g = this.guards[i];
    const def = this.level.def.guards[i];
    const speed = def.speed ?? 1.7;
    const range = this.guardRange(i);
    g.timer += dt;

    // hearing
    for (const n of noises) {
      if (g.mode === 'chase') break;
      if (Math.hypot(n.x - g.x, n.y - g.y) <= n.r) {
        if (g.mode === 'sleep') this.events.push({ type: 'wake', guard: i });
        if (g.mode !== 'suspicious') this.events.push({ type: 'suspicious', guard: i });
        g.mode = 'suspicious';
        g.timer = 0;
        g.gx = n.x;
        g.gy = n.y;
        g.route = [];
        g.meter = Math.max(g.meter, 0.25);
      }
    }

    // sight
    let seen: PetState | null = null;
    let seenD = Infinity;
    if (g.mode !== 'sleep') {
      for (const p of this.pets) {
        if (this.isHidden(p)) continue;
        const [px, py] = this.petPos(p);
        if (this.sees(g.x, g.y, g.dir, range, px, py)) {
          const d = Math.hypot(px - g.x, py - g.y);
          if (d < seenD) {
            seen = p;
            seenD = d;
          }
        }
      }
    }
    g.sees = seen !== null;
    if (seen) {
      const [px, py] = this.petPos(seen);
      g.gx = Math.round(px);
      g.gy = Math.round(py);
      g.lostFor = 0;
      if (g.mode === 'chase') {
        if (seenD <= CATCH_DIST) {
          this.status = 'caught';
          this.events.push({ type: 'caught', by: 'guard', index: i, pet: seen.kind });
          return;
        }
      } else {
        g.meter += dt * (0.9 + 1.8 * (1 - seenD / range));
        if (g.mode !== 'suspicious') {
          this.events.push({ type: 'suspicious', guard: i });
          g.mode = 'suspicious';
          g.route = [];
        }
        g.timer = 0;
        if (g.meter >= 1) {
          g.meter = 1;
          g.mode = 'chase';
          g.route = [];
          g.timer = 0;
          this.spotted = true;
          this.events.push({ type: 'alert', guard: i });
        }
      }
    } else if (g.mode !== 'chase') {
      g.meter = Math.max(0, g.meter - dt * 0.4);
    }

    switch (g.mode) {
      case 'sleep':
        return;
      case 'patrol': {
        if (def.path.length === 1) {
          if (def.turn) {
            const period = 5;
            const k = 0.5 - 0.5 * Math.cos((this.t / period) * Math.PI * 2);
            const a = rad(def.turn[0]);
            const b = rad(def.turn[1]);
            g.dir = wrap(a + wrap(b - a) * k);
          } else this.turnTo(g, g.baseDir, dt);
          return;
        }
        if (g.wait > 0) {
          g.wait -= dt;
          g.dir = wrap(g.baseDir + Math.sin(g.timer * 2.2) * 0.45);
          if (g.wait <= 0) {
            const n = def.path.length;
            if (def.pingpong) {
              if (g.forward && g.wp === n - 1) g.forward = false;
              else if (!g.forward && g.wp === 0) g.forward = true;
              g.wp += g.forward ? 1 : -1;
            } else g.wp = (g.wp + 1) % n;
            const [wx, wy] = def.path[g.wp];
            g.route = this.route(g.x, g.y, wx, wy);
          }
          return;
        }
        if (this.walk(g, speed, dt)) {
          g.wait = def.wait ?? 0.9;
          g.baseDir = g.dir;
          g.timer = 0;
        }
        return;
      }
      case 'suspicious':
        this.turnTo(g, Math.atan2(g.gy - g.y, g.gx - g.x), dt, 4);
        if (!seen && g.timer > 1.1) {
          g.mode = 'look';
          g.timer = 0;
          g.route = this.route(g.x, g.y, g.gx, g.gy);
          if (g.route.length > 4) g.route = g.route.slice(0, 4);
        }
        return;
      case 'look':
        if (g.route.length) {
          this.walk(g, speed * 1.15, dt);
          g.timer = 0;
        } else {
          g.dir = wrap(g.dir + dt * 2.2);
          if (g.timer > 2.4) {
            g.mode = 'return';
            this.events.push({ type: 'calm', guard: i });
            g.timer = 0;
            const [hx, hy] = def.path[def.sleep ? 0 : g.wp];
            g.route = this.route(g.x, g.y, hx, hy);
          }
        }
        return;
      case 'chase': {
        // a pet out of reach (on a shelf edge, in an alcove): give up after a while
        if (g.timer > 6) {
          g.mode = 'look';
          g.meter = 0.5;
          g.timer = 0;
          g.route = [];
          return;
        }
        if (!seen) {
          g.lostFor += dt;
          if (g.lostFor > 0.4) {
            g.mode = 'look';
            g.meter = 0.6;
            g.timer = 0;
            g.route = this.route(g.x, g.y, g.gx, g.gy);
            return;
          }
        }
        const last = g.route[g.route.length - 1];
        if (!last || last[0] !== g.gx || last[1] !== g.gy) g.route = this.route(g.x, g.y, g.gx, g.gy);
        this.walk(g, 3.4, dt);
        return;
      }
      case 'return':
        if (this.walk(g, speed * 1.1, dt)) {
          g.meter = 0;
          if (def.sleep) {
            g.mode = 'sleep';
            g.dir = rad(def.face ?? 90);
          } else {
            g.mode = 'patrol';
            g.wait = 0.4;
            g.baseDir = g.dir;
          }
        }
        return;
    }
  }

  private updateCam(i: number, dt: number): void {
    const def = this.level.def.cams![i];
    const c = this.cams[i];
    const k = 0.5 - 0.5 * Math.cos((this.t / (def.period ?? 6)) * Math.PI * 2);
    const a = rad(def.from);
    c.dir = wrap(a + wrap(rad(def.to) - a) * k);
    let seen: PetState | null = null;
    for (const p of this.pets) {
      if (this.isHidden(p)) continue;
      const [px, py] = this.petPos(p);
      if (this.sees(def.x, def.y, c.dir, def.range ?? 4, px, py)) seen = p;
    }
    c.sees = seen !== null;
    if (seen) {
      c.meter += dt * 1.25;
      if (c.meter >= 1) {
        this.status = 'caught';
        this.spotted = true;
        this.events.push({ type: 'caught', by: 'camera', index: i, pet: seen.kind });
      }
    } else c.meter = Math.max(0, c.meter - dt * 0.6);
  }

  /** Highest alert level (0..1) for the stealth meter. */
  alertLevel(): number {
    let m = 0;
    for (const g of this.guards) m = Math.max(m, g.mode === 'chase' ? 1 : g.meter);
    for (const c of this.cams) m = Math.max(m, c.meter);
    return m;
  }
}
