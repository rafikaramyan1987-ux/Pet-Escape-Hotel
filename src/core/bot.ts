import { type Level, type PetKind, type XY } from './level';
import { findPath } from './path';
import { DT, Sim } from './sim';

/**
 * Playtest bot. It follows the room's reference plan (waypoints per pet) but plays it for real against the
 * live staff AI: before every step it simulates ahead and only moves when the step (and a short pause after
 * it) stays out of every flashlight; otherwise it waits, backs off or ducks into a hiding spot.
 * The "noisy" variant plays like a person: shorter look-ahead, reaction delays, the occasional impatient step.
 */
export interface BotOptions {
  seed?: number;
  noisy?: boolean;
  maxTime?: number;
  /** Seconds a single plan step may take before the bot gives up. */
  stepTimeout?: number;
}

export interface BotResult {
  won: boolean;
  caught: boolean;
  time: number;
  bones: number;
  spotted: boolean;
  stuck: string | null;
  /** Tiles each pet stood on (for the audit). */
  visited: Set<number>;
}

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

type Action = { kind: 'move'; to: XY } | { kind: 'wait' };

export class Bot {
  private stepIdx = 0;
  private stepTime = 0;
  private delay = 0;
  private waited = 0;
  private patience = 5;
  private rand: () => number;
  stuck: string | null = null;
  readonly visited = new Set<number>();

  constructor(private sim: Sim, private opts: BotOptions = {}) {
    this.rand = rng(opts.seed ?? 1);
  }

  get done(): boolean {
    return this.stepIdx >= this.sim.level.def.plan.length;
  }

  /** The plan step the bot works on (used by hints). */
  current(): { pet: PetKind; to: XY } | null {
    return this.sim.level.def.plan[this.stepIdx] ?? null;
  }

  /** Decide inputs for the next sim step. */
  think(): void {
    const sim = this.sim;
    if (sim.status !== 'play' || this.done) return;
    const step = sim.level.def.plan[this.stepIdx];
    const pet = sim.pet(step.pet);
    if (!pet || pet.escaped) {
      this.advance();
      return;
    }
    sim.held = null;
    for (const p of sim.pets) this.visited.add(p.ty * 64 + p.tx);
    if (pet.move) return;
    if (pet.tx === step.to[0] && pet.ty === step.to[1]) {
      this.advance();
      return;
    }
    this.stepTime += DT;
    if (this.stepTime > (this.opts.stepTimeout ?? 50)) {
      this.stuck = `${sim.level.id} step ${this.stepIdx} (${step.pet} → ${step.to})`;
      return;
    }
    if (this.delay > 0) {
      this.delay -= DT;
      return;
    }
    if (sim.active !== step.pet) sim.setActive(step.pet);
    // plan around the staff: tiles right next to a guard cost extra
    const fixed = sim.level.def.guards.flatMap((d) => (d.path.length === 1 && !d.sleep ? [d.path[0]] : []));
    const avoid = (x: number, y: number) => (fixed.some(([gx, gy]) => Math.hypot(gx - x, gy - y) < 1.6) ? 6 : 0);
    const path = findPath(sim, step.pet, pet.tx, pet.ty, step.to[0], step.to[1], { cost: avoid });
    if (!path || !path.length) {
      // a gate may be closed right now: wait for it
      if (!findPath(sim, step.pet, pet.tx, pet.ty, step.to[0], step.to[1], { gate: true })) this.stuck = `${sim.level.id} step ${this.stepIdx}: no path`;
      return;
    }
    const noisy = this.opts.noisy;
    const horizon = noisy ? 0.6 + this.rand() * 0.6 : Math.max(0.6, 1.5 - this.waited * 0.06);
    const forward: Action = { kind: 'move', to: path[0] };
    // a person gets impatient after waiting a while and just goes for it
    if (noisy && this.waited > this.patience) {
      this.apply(pet.kind, forward);
      this.waited = 0;
      this.patience = 2.5 + this.rand() * 6;
      this.delay = this.rand() * 0.2;
      return;
    }
    // commit to a short dash: check the next few steps together, not just one
    const dash = path.slice(1, 3);
    if (path.length === 4 && sim.tile(path[3][0], path[3][1]) === 'E') dash.push(path[3]);
    let fwdRisk = this.risk(pet.kind, forward, horizon, dash.length ? dash : undefined);
    if (fwdRisk > 0 && dash.length) fwdRisk = Math.min(fwdRisk, this.risk(pet.kind, forward, horizon));
    if (fwdRisk === 0) {
      this.waited = 0;
      this.apply(pet.kind, forward);
      if (noisy) this.delay = this.rand() < 0.2 ? this.rand() * 0.35 : 0;
      return;
    }
    // forward is dangerous: compare waiting with stepping to any neighbour (prefer hiding spots)
    const options: Action[] = [{ kind: 'wait' }];
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const nx = pet.tx + dx;
      const ny = pet.ty + dy;
      if (sim.canEnter(pet.kind, nx, ny) && sim.tile(nx, ny) !== 'E') options.push({ kind: 'move', to: [nx, ny] });
    }
    let best: Action = options[0];
    let bestRisk = this.risk(pet.kind, best, horizon);
    for (const o of options.slice(1)) {
      if (bestRisk === 0) break;
      const r = this.risk(pet.kind, o, horizon, undefined, true);
      if (r < bestRisk - 0.01) {
        best = o;
        bestRisk = r;
      }
    }
    // still exposed: look two steps ahead (step out of a corridor, then around a corner)
    if (bestRisk > 0 && !noisy) {
      for (const o of options.slice(1)) {
        if (o.kind !== 'move') continue;
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
          const n: XY = [o.to[0] + dx, o.to[1] + dy];
          if ((n[0] === pet.tx && n[1] === pet.ty) || !sim.canEnter(pet.kind, n[0], n[1]) || sim.tile(n[0], n[1]) === 'E') continue;
          const r = this.risk(pet.kind, o, horizon, n, true);
          if (r < bestRisk - 0.01) {
            best = o;
            bestRisk = r;
          }
        }
      }
    }
    if (fwdRisk < bestRisk) best = forward;
    if (best !== forward) this.waited += DT;
    this.apply(pet.kind, best);
    if (noisy) this.delay = this.rand() * 0.25;
  }

  private advance(): void {
    this.stepIdx++;
    this.stepTime = 0;
  }

  private apply(kind: PetKind, a: Action): void {
    const p = this.sim.pet(kind)!;
    p.path = a.kind === 'move' ? [a.to] : [];
    p.running = false;
  }

  /** How bad an action looks over the next `horizon` seconds (0 = nobody notices anything). */
  private risk(kind: PetKind, a: Action, horizon: number, then?: XY | XY[], dodge = false): number {
    const s = this.sim.clone();
    const p = s.pet(kind)!;
    const more: XY[] = then ? (Array.isArray(then[0]) ? (then as XY[]) : [then as XY]) : [];
    p.path = a.kind === 'move' ? [a.to, ...more] : [];
    s.held = null;
    // only this pet acts in the look-ahead
    for (const q of s.pets) if (q !== p) q.path = [];
    let worst = 0;
    const ticks = Math.ceil(((a.kind === 'move' ? 0.35 : 0) + more.length * 0.3 + horizon) / DT);
    for (let i = 0; i < ticks; i++) {
      const ev = s.step(DT);
      if (s.status === 'caught') return 10;
      // dodging onto squeaky boards just brings the staff over
      if (dodge && ev.some((e) => e.type === 'noise')) worst = Math.max(worst, 0.3);
      s.guards.forEach((g) => {
        if (g.mode === 'chase') worst = Math.max(worst, 5);
        if (g.sees) worst = Math.max(worst, 0.1 + g.meter);
      });
      // don't tail-gate: staying right behind a guard is how you get caught when they turn round
      const [px, py] = s.petPos(p);
      if (!s.isHidden(p) && s.guards.some((g) => g.mode === 'patrol' && g.route.length > 0 && Math.hypot(g.x - px, g.y - py) < 1.6)) worst = Math.max(worst, 0.05);
            s.cams.forEach((c) => {
        if (c.sees) worst = Math.max(worst, 0.1 + c.meter);
      });
    }
    return worst;
  }
}

export function playRoom(level: Level, opts: BotOptions = {}): BotResult {
  const sim = new Sim(level);
  const bot = new Bot(sim, opts);
  const max = opts.maxTime ?? 240;
  while (sim.status === 'play' && sim.t < max && !bot.stuck) {
    bot.think();
    if (bot.stuck) break;
    sim.step(DT);
    if (bot.done && sim.status === 'play') {
      bot.stuck = `${level.id}: plan finished but the room is not won`;
    }
  }
  return {
    won: sim.status === 'won',
    caught: sim.status === 'caught',
    time: sim.t,
    bones: sim.bones.filter(Boolean).length,
    spotted: sim.spotted,
    stuck: bot.stuck,
    visited: bot.visited,
  };
}

