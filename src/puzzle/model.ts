import type { PetKind } from '../art/pets';

/**
 * Screw & Rescue puzzle model (pure, deterministic, no rendering).
 *
 * A level is the front of a 3D object (crate, cage, kennel…) covered by planks. Each plank is held by
 * coloured screws. Tapping a free screw sends it to the open toolbox of its colour (3 screws per box), or
 * to the holding tray when no such box is open. A full box closes and the next box in the queue opens,
 * pulling matching screws out of the tray. A plank falls when its last screw is out. A screw is free only
 * when no plank on a higher layer covers it. Run out of tray space: level failed. All planks gone: the pet
 * inside is rescued.
 *
 * Coordinates: the front plane of the object, x right, y up, in world units (the opening is ~3.4 × 2.8).
 */
export const COLORS = ['red', 'blue', 'yellow', 'green', 'purple', 'orange', 'pink', 'teal'] as const;
export type Color = (typeof COLORS)[number];
export type ObjectKind = 'crate' | 'cage' | 'kennel' | 'carrier' | 'toybox';

export const BOX_SIZE = 3;
export const SCREW_R = 0.26;
export const PLANK_W = 0.72;

export interface PlankSpec {
  x: number;
  y: number;
  len: number;
  /** Degrees, counter-clockwise. */
  angle: number;
  layer: number;
  /** Screw colours, spread evenly along the plank. */
  screws: Color[];
  /** Pastel paint index (cosmetic). */
  tint?: number;
}

export interface LevelDef {
  id: number;
  object: ObjectKind;
  pet: PetKind;
  planks: PlankSpec[];
  /** Toolbox colours in the order they arrive. */
  queue: Color[];
  /** Toolboxes open at the same time. */
  open: number;
  /** Holding tray slots. */
  tray: number;
  tutorial?: boolean;
}

export type Action = { t: 'tap'; id: number } | { t: 'slot' } | { t: 'hammer'; plank: number };

export interface Screw {
  id: number;
  plank: number;
  color: Color;
  x: number;
  y: number;
  layer: number;
}

export interface Plank {
  id: number;
  spec: PlankSpec;
  screws: number[];
}

export interface Box {
  /** Unique per box instance (the view animates instances). */
  uid: number;
  color: Color;
  screws: number[];
}

export type PuzzleEvent =
  | { type: 'toBox'; screw: number; box: number; uid: number; slot: number }
  | { type: 'toTray'; screw: number; slot: number }
  | { type: 'trayToBox'; screw: number; from: number; box: number; uid: number; slot: number }
  | { type: 'boxFull'; box: number; uid: number }
  | { type: 'boxOpen'; box: number; uid: number; color: Color }
  | { type: 'plankFall'; plank: number }
  | { type: 'hammer'; plank: number; screws: number[] }
  | { type: 'ghostToBox'; color: Color; box: number; uid: number; slot: number }
  | { type: 'traySlot'; slots: number }
  | { type: 'won' }
  | { type: 'lost' };

/** Build planks and screws (positions) from a level definition. */
export function buildLevel(def: LevelDef): { planks: Plank[]; screws: Screw[] } {
  const planks: Plank[] = [];
  const screws: Screw[] = [];
  def.planks.forEach((spec, pi) => {
    const a = (spec.angle * Math.PI) / 180;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const n = spec.screws.length;
    const inset = 0.42;
    const ids: number[] = [];
    spec.screws.forEach((color, i) => {
      const t = n === 1 ? 0 : -spec.len / 2 + inset + ((spec.len - 2 * inset) * i) / (n - 1);
      const id = screws.length;
      screws.push({ id, plank: pi, color, x: spec.x + ux * t, y: spec.y + uy * t, layer: spec.layer });
      ids.push(id);
    });
    planks.push({ id: pi, spec, screws: ids });
  });
  return { planks, screws };
}

/** Is point (px, py) on plank `p` (with a margin)? */
export function plankCovers(p: PlankSpec, px: number, py: number, margin = SCREW_R * 0.75): boolean {
  const a = (-p.angle * Math.PI) / 180;
  const dx = px - p.x;
  const dy = py - p.y;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= p.len / 2 + margin && Math.abs(ly) <= PLANK_W / 2 + margin;
}

export class Puzzle {
  readonly def: LevelDef;
  readonly planks: Plank[];
  readonly screws: Screw[];
  /** For each screw: the planks above it that cover it. */
  private coveredBy: number[][];
  removed: boolean[];
  plankGone: boolean[];
  boxes: (Box | null)[];
  tray: (number | null)[];
  next: number;
  status: 'play' | 'won' | 'lost' = 'play';
  private uid = 0;
  /** Every action so far (taps and boosters), so a state can be rebuilt for undo. */
  history: Action[] = [];
  /** Hammered screws not yet counted in a box (a box of that colour opens later). */
  credit: Partial<Record<Color, number>> = {};

  constructor(def: LevelDef) {
    this.def = def;
    const { planks, screws } = buildLevel(def);
    this.planks = planks;
    this.screws = screws;
    this.coveredBy = screws.map((s) => planks.filter((p) => p.spec.layer > s.layer && plankCovers(p.spec, s.x, s.y)).map((p) => p.id));
    this.removed = screws.map(() => false);
    this.plankGone = planks.map(() => false);
    this.tray = Array.from({ length: def.tray }, () => null);
    this.boxes = [];
    this.next = 0;
    for (let i = 0; i < def.open; i++) this.boxes.push(this.nextBox());
  }

  private nextBox(): Box | null {
    if (this.next >= this.def.queue.length) return null;
    return { uid: ++this.uid, color: this.def.queue[this.next++], screws: [] };
  }

  clone(): Puzzle {
    const c = Object.create(Puzzle.prototype) as Puzzle;
    Object.assign(c, this);
    c.removed = this.removed.slice();
    c.plankGone = this.plankGone.slice();
    c.boxes = this.boxes.map((b) => (b ? { ...b, screws: b.screws.slice() } : null));
    c.tray = this.tray.slice();
    c.history = this.history.slice();
    c.credit = { ...this.credit };
    return c;
  }

  isFree(id: number): boolean {
    if (this.removed[id]) return false;
    return this.coveredBy[id].every((p) => this.plankGone[p]);
  }

  freeScrews(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.screws.length; i++) if (this.isFree(i)) out.push(i);
    return out;
  }

  trayCount(): number {
    return this.tray.filter((t) => t !== null).length;
  }

  /** Tap a screw. Returns what happened, in order (empty when the tap is not allowed). */
  tap(id: number): PuzzleEvent[] {
    if (this.status !== 'play' || !this.isFree(id)) return [];
    const ev: PuzzleEvent[] = [];
    const s = this.screws[id];
    this.removed[id] = true;
    this.history.push({ t: 'tap', id });
    const bi = this.boxes.findIndex((b) => b && b.color === s.color && b.screws.length < BOX_SIZE);
    if (bi >= 0) {
      const b = this.boxes[bi]!;
      b.screws.push(id);
      ev.push({ type: 'toBox', screw: id, box: bi, uid: b.uid, slot: b.screws.length - 1 });
      this.settleBoxes(ev);
    } else {
      const slot = this.tray.indexOf(null);
      if (slot < 0) {
        // no room anywhere: the level is lost (the screw stays out, nowhere to go)
        this.status = 'lost';
        ev.push({ type: 'lost' });
        return ev;
      }
      this.tray[slot] = id;
      ev.push({ type: 'toTray', screw: id, slot });
    }
    // plank falls when its last screw is out
    const p = this.planks[s.plank];
    if (!this.plankGone[p.id] && p.screws.every((k) => this.removed[k])) {
      this.plankGone[p.id] = true;
      ev.push({ type: 'plankFall', plank: p.id });
    }
    if (this.plankGone.every(Boolean)) {
      this.status = 'won';
      ev.push({ type: 'won' });
    } else if (this.trayCount() === this.tray.length && !this.freeScrews().some((k) => this.boxes.some((b) => b && b.color === this.screws[k].color))) {
      // tray full and no free screw can go into an open box: stuck
      this.status = 'lost';
      ev.push({ type: 'lost' });
    }
    return ev;
  }

  /** Close full boxes, open the next ones, and pull matching screws from the tray. */
  private settleBoxes(ev: PuzzleEvent[]): void {
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < this.boxes.length; i++) {
        const b = this.boxes[i];
        if (b && b.screws.length >= BOX_SIZE) {
          ev.push({ type: 'boxFull', box: i, uid: b.uid });
          const nb = this.nextBox();
          this.boxes[i] = nb;
          if (nb) ev.push({ type: 'boxOpen', box: i, uid: nb.uid, color: nb.color });
          changed = true;
        }
      }
      for (let i = 0; i < this.boxes.length; i++) {
        const b = this.boxes[i];
        if (!b) continue;
        while ((this.credit[b.color] ?? 0) > 0 && b.screws.length < BOX_SIZE) {
          this.credit[b.color]!--;
          b.screws.push(-1);
          ev.push({ type: 'ghostToBox', color: b.color, box: i, uid: b.uid, slot: b.screws.length - 1 });
          changed = true;
        }
        for (let t = 0; t < this.tray.length && b.screws.length < BOX_SIZE; t++) {
          const sid = this.tray[t];
          if (sid !== null && this.screws[sid].color === b.color) {
            this.tray[t] = null;
            b.screws.push(sid);
            ev.push({ type: 'trayToBox', screw: sid, from: t, box: i, uid: b.uid, slot: b.screws.length - 1 });
            changed = true;
          }
        }
      }
    }
  }

  /** Booster: one more tray slot for this level. */
  addTraySlot(): PuzzleEvent[] {
    if (this.status !== 'play') return [];
    this.tray.push(null);
    this.history.push({ t: 'slot' });
    return [{ type: 'traySlot', slots: this.tray.length }];
  }

  /** Booster: smash a plank. Its screws count towards their colour's boxes (now, or when that box opens). */
  hammer(plank: number): PuzzleEvent[] {
    if (this.status !== 'play' || this.plankGone[plank]) return [];
    const p = this.planks[plank];
    const ev: PuzzleEvent[] = [];
    const ids = p.screws.filter((k) => !this.removed[k]);
    this.history.push({ t: 'hammer', plank });
    ev.push({ type: 'hammer', plank, screws: ids });
    for (const k of ids) {
      this.removed[k] = true;
      const c = this.screws[k].color;
      this.credit[c] = (this.credit[c] ?? 0) + 1;
    }
    this.plankGone[plank] = true;
    this.settleBoxes(ev);
    ev.push({ type: 'plankFall', plank });
    if (this.plankGone.every(Boolean)) {
      this.status = 'won';
      ev.push({ type: 'won' });
    }
    return ev;
  }

  /** Replay a list of actions on a fresh puzzle (undo = replay all but the last tap). */
  static replay(def: LevelDef, actions: Action[]): Puzzle {
    const p = new Puzzle(def);
    for (const a of actions) {
      if (a.t === 'tap') p.tap(a.id);
      else if (a.t === 'slot') p.addTraySlot();
      else p.hammer(a.plank);
    }
    return p;
  }

  /** History without the last tap (boosters stay used). null when there is nothing to undo. */
  undoActions(): Action[] | null {
    const i = this.history.map((a) => a.t).lastIndexOf('tap');
    if (i < 0) return null;
    return this.history.slice(0, i).concat(this.history.slice(i + 1).filter((a) => a.t !== 'tap'));
  }

  /** Canonical key of the gameplay-relevant state (for the solver). */
  key(): string {
    let k = '';
    for (const r of this.removed) k += r ? '1' : '0';
    k += `|${this.next}|`;
    for (const b of this.boxes) k += b ? `${b.color[0]}${b.color[1]}${b.screws.length},` : '-,';
    const tray = this.tray.filter((t) => t !== null).map((t) => this.screws[t!].color).sort();
    return k + tray.join('') + (this.tray.length !== this.def.tray ? `#${this.tray.length}` : '');
  }
}

/** Sanity checks every level must pass. */
export function validateLevel(def: LevelDef): string[] {
  const problems: string[] = [];
  const count = new Map<Color, number>();
  for (const p of def.planks) for (const c of p.screws) count.set(c, (count.get(c) ?? 0) + 1);
  const boxes = new Map<Color, number>();
  for (const c of def.queue) boxes.set(c, (boxes.get(c) ?? 0) + 1);
  for (const [c, n] of count) {
    if (n % BOX_SIZE !== 0) problems.push(`${n} ${c} screws (not a multiple of ${BOX_SIZE})`);
    if ((boxes.get(c) ?? 0) * BOX_SIZE !== n) problems.push(`${c}: ${n} screws but ${(boxes.get(c) ?? 0)} boxes`);
  }
  for (const c of boxes.keys()) if (!count.has(c)) problems.push(`box for ${c} with no ${c} screws`);
  if (!def.planks.length) problems.push('no planks');
  for (const p of def.planks) if (!p.screws.length) problems.push('plank without screws');
  return problems;
}
