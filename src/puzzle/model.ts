import type { PetKind } from '../art/pets';

/**
 * Screw & Rescue puzzle model (pure, deterministic, no rendering).
 *
 * A level is the front of a 3D object (crate, cage, kennel…) covered by planks. Each plank is held by
 * coloured screws. Two colour boxes are active at a time; tapping a removable screw sends it to the active box
 * of its colour (3 screws per box), or to the holding tray when no such box is active. A full box leaves and the
 * next box of the queue takes its place, pulling matching screws out of the tray. A plank falls when its last
 * screw is out. A screw is removable only when no plank on a higher layer covers its head. Tray full (every
 * slot taken): level failed. All planks gone: the pet inside is rescued.
 *
 * Mechanics mixed in as levels progress:
 *  - locked plank: its screws can't be taken until the key screw (same symbol) is out
 *  - ice: the first tap cracks the ice, the second unscrews
 *  - hidden "?": the colour shows only once the plank above it has fallen
 *  - chain: chained planks fall together, only when every plank of the chain has lost its screws
 *  - bomb screw: must be taken out within N taps (counting down on it), or the level is lost
 *  - sticky plank: once you touch one of its screws you must take all of them in one go — no other screw can
 *    be touched until the sticky plank is empty
 *
 * Coordinates: the front plane of the object, x right, y up, in world units (the opening is ~3.4 × 2.8).
 */
export const COLORS = ['red', 'blue', 'yellow', 'green', 'purple', 'orange', 'pink', 'teal'] as const;
export type Color = (typeof COLORS)[number];
export type ObjectKind = 'crate' | 'cage' | 'kennel' | 'carrier' | 'toybox';

export const BOX_SIZE = 3;
export const SCREW_R = 0.26;
/** Default plank width (planks can be narrower or wider: PlankSpec.w). */
export const PLANK_W = 0.72;
/** Colour boxes active at a time. */
export const OPEN_BOXES = 2;

/** Per-screw modifiers (aligned with PlankSpec.screws). */
export interface ScrewMod {
  ice?: 1;
  hidden?: 1;
  /** This screw is the key for the locked plank with symbol n. */
  key?: number;
  /** Bomb screw: must be taken out within this many taps. */
  bomb?: number;
}

/** Plank looks (cosmetic): wood, painted metal strip, striped, plywood, rounded stick, board with cut corners. */
export type PlankStyle = 0 | 1 | 2 | 3 | 4 | 5;

export interface PlankSpec {
  x: number;
  y: number;
  len: number;
  /** Degrees, counter-clockwise. */
  angle: number;
  layer: number;
  /** Screw colours, spread evenly along the plank. */
  screws: Color[];
  /** Plank width (default PLANK_W). */
  w?: number;
  /** Pastel paint index (cosmetic). */
  tint?: number;
  style?: PlankStyle;
  mods?: (ScrewMod | null)[];
  /** Planks with the same chain id fall together. */
  chain?: number;
  /** Locked plank: its screws wait for the key screw with this symbol. */
  lock?: number;
  /** Sticky plank: its screws must be taken in one go. */
  sticky?: 1;
}

export interface LevelDef {
  id: number;
  object: ObjectKind;
  pet: PetKind;
  planks: PlankSpec[];
  /** Box colours in the order they arrive. */
  queue: Color[];
  /** Boxes active at the same time. */
  open: number;
  /** Holding tray slots. */
  tray: number;
  tutorial?: boolean;
}

export type LoseReason = 'tray' | 'bomb' | 'stuck';

export type Action = { t: 'tap'; id: number } | { t: 'slot' } | { t: 'hammer'; plank: number };

export interface Screw {
  id: number;
  plank: number;
  color: Color;
  x: number;
  y: number;
  layer: number;
  ice: boolean;
  hidden: boolean;
  key: number;
  bomb: number;
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
  | { type: 'ice'; screw: number }
  | { type: 'reveal'; screw: number }
  | { type: 'unlock'; plank: number }
  | { type: 'sticky'; plank: number }
  | { type: 'won' }
  | { type: 'lost'; reason: LoseReason; screw?: number };

export const plankWidth = (p: PlankSpec): number => p.w ?? PLANK_W;

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
      const m = spec.mods?.[i] ?? null;
      screws.push({
        id, plank: pi, color, x: spec.x + ux * t, y: spec.y + uy * t, layer: spec.layer,
        ice: !!m?.ice, hidden: !!m?.hidden, key: m?.key ?? -1, bomb: m?.bomb ?? 0,
      });
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
  return Math.abs(lx) <= p.len / 2 + margin && Math.abs(ly) <= plankWidth(p) / 2 + margin;
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
  /** Screws still under ice. */
  iced: boolean[];
  /** Taps so far (bomb counters run down with every tap). */
  taps = 0;
  /** Sticky plank in progress (its screws must all come out before any other screw), or -1. */
  stickyOpen = -1;
  /** For each locked plank: its key screw (-1 = not locked). */
  private keyOf: number[];
  private hasIce: boolean;
  private hasBomb: boolean;
  /** Hidden screws (watched for reveal events). */
  private watch: number[];

  constructor(def: LevelDef) {
    this.def = def;
    const { planks, screws } = buildLevel(def);
    this.planks = planks;
    this.screws = screws;
    this.coveredBy = screws.map((s) => planks.filter((p) => p.spec.layer > s.layer && plankCovers(p.spec, s.x, s.y)).map((p) => p.id));
    this.removed = screws.map(() => false);
    this.plankGone = planks.map(() => false);
    this.tray = Array.from({ length: def.tray }, () => null);
    this.iced = screws.map((x) => x.ice);
    this.keyOf = planks.map((p) => (p.spec.lock !== undefined ? screws.findIndex((k) => k.key === p.spec.lock) : -1));
    this.hasIce = this.iced.some(Boolean);
    this.hasBomb = screws.some((x) => x.bomb > 0);
    this.watch = screws.filter((x) => x.hidden).map((x) => x.id);
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
    c.iced = this.iced.slice();
    return c;
  }

  /** Not under a plank (the head is visible: a hidden screw shows its colour). */
  isUncovered(id: number): boolean {
    return this.coveredBy[id].every((p) => this.plankGone[p]);
  }

  /** Is this plank still locked (its key screw not out yet)? */
  plankLocked(plank: number): boolean {
    const k = this.keyOf[plank];
    return k >= 0 && !this.removed[k];
  }

  isLocked(id: number): boolean {
    return this.plankLocked(this.screws[id].plank);
  }

  /** Blocked because a sticky plank is in progress elsewhere. */
  isStuckBySticky(id: number): boolean {
    return this.stickyOpen >= 0 && this.screws[id].plank !== this.stickyOpen;
  }

  isFree(id: number): boolean {
    if (this.removed[id]) return false;
    return this.isUncovered(id) && !this.isLocked(id) && !this.isStuckBySticky(id);
  }

  freeScrews(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.screws.length; i++) if (this.isFree(i)) out.push(i);
    return out;
  }

  trayCount(): number {
    return this.tray.filter((t) => t !== null).length;
  }

  /** Taps left before a bomb screw goes off (Infinity: not a bomb, or already out). */
  bombLeft(id: number): number {
    const s = this.screws[id];
    if (!s.bomb || this.removed[id]) return Infinity;
    return s.bomb - this.taps;
  }

  /** Is a colour's box active (with room)? */
  boxFor(color: Color): number {
    return this.boxes.findIndex((b) => b && b.color === color && b.screws.length < BOX_SIZE);
  }

  /** Empty tray slots. */
  trayFree(): number {
    return this.tray.length - this.trayCount();
  }

  /** Can this free screw be tapped without losing right away? (the last tray slot fills the tray: fail) */
  canTakeSafely(id: number): boolean {
    if (this.iced[id]) return true;
    return this.boxFor(this.screws[id].color) >= 0 || this.trayFree() > 1;
  }

  /** Tap a screw. Returns what happened, in order (empty when the tap is not allowed). */
  tap(id: number): PuzzleEvent[] {
    if (this.status !== 'play' || !this.isFree(id)) return [];
    const ev: PuzzleEvent[] = [];
    const s = this.screws[id];
    this.history.push({ t: 'tap', id });
    this.taps++;
    const sp = this.planks[s.plank];
    if (sp.spec.sticky && this.stickyOpen < 0) {
      this.stickyOpen = sp.id;
      ev.push({ type: 'sticky', plank: sp.id });
    }
    if (this.iced[id]) {
      this.iced[id] = false;
      ev.push({ type: 'ice', screw: id });
      this.afterTap(ev);
      return ev;
    }
    const wasFree = this.watch.map((k) => this.isUncovered(k));
    const lockedBefore = this.planks.map((_, i) => this.plankLocked(i));
    this.removed[id] = true;
    const bi = this.boxFor(s.color);
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
        ev.push({ type: 'lost', reason: 'tray' });
        return ev;
      }
      this.tray[slot] = id;
      ev.push({ type: 'toTray', screw: id, slot });
      if (!this.tray.includes(null)) {
        // tray full: level failed
        this.status = 'lost';
        ev.push({ type: 'lost', reason: 'tray' });
        return ev;
      }
    }
    if (this.stickyOpen >= 0 && this.planks[this.stickyOpen].screws.every((k) => this.removed[k])) this.stickyOpen = -1;
    this.dropPlanks(s.plank, ev);
    for (let i = 0; i < this.planks.length; i++) if (lockedBefore[i] && !this.plankLocked(i)) ev.push({ type: 'unlock', plank: i });
    for (let w = 0; w < this.watch.length; w++) {
      const k = this.watch[w];
      if (!wasFree[w] && this.isUncovered(k)) ev.push({ type: 'reveal', screw: k });
    }
    this.afterTap(ev);
    return ev;
  }

  /** A plank falls when its screws are out, and a chained plank only together with the rest of its chain. */
  private dropPlanks(plank: number, ev: PuzzleEvent[]): void {
    const spec = this.planks[plank].spec;
    const group = spec.chain === undefined ? [plank] : this.planks.filter((p) => p.spec.chain === spec.chain).map((p) => p.id);
    const empty = (i: number) => this.plankGone[i] || this.planks[i].screws.every((k) => this.removed[k]);
    if (!group.every(empty)) return;
    for (const i of group) {
      if (this.plankGone[i]) continue;
      this.plankGone[i] = true;
      ev.push({ type: 'plankFall', plank: i });
    }
  }

  /** Win, bomb and stuck checks after every tap. */
  private afterTap(ev: PuzzleEvent[]): void {
    if (this.plankGone.every(Boolean)) {
      this.status = 'won';
      ev.push({ type: 'won' });
      return;
    }
    if (this.hasBomb) {
      for (const s of this.screws) {
        if (this.bombLeft(s.id) <= 0) {
          this.status = 'lost';
          ev.push({ type: 'lost', reason: 'bomb', screw: s.id });
          return;
        }
      }
    }
    const free = this.freeScrews();
    if (!free.some((k) => this.canTakeSafely(k))) {
      // nothing can be taken without overflowing the tray (or nothing is free at all): stuck
      this.status = 'lost';
      ev.push({ type: 'lost', reason: free.length ? 'tray' : 'stuck' });
    }
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
    if (this.stickyOpen === plank) this.stickyOpen = -1;
    this.settleBoxes(ev);
    ev.push({ type: 'plankFall', plank });
    // a chained partner whose screws are already out comes down with it
    for (const q of this.planks) if (!this.plankGone[q.id] && q.spec.chain !== undefined && q.spec.chain === p.spec.chain) this.dropPlanks(q.id, ev);
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

  /** History without the last `n` taps (boosters stay used). null when there is no tap to undo. */
  undoActions(n = 1): Action[] | null {
    const taps = this.history.map((a, i) => (a.t === 'tap' ? i : -1)).filter((i) => i >= 0);
    if (!taps.length) return null;
    const drop = new Set(taps.slice(-n));
    return this.history.filter((_, i) => !drop.has(i));
  }

  /** Canonical key of the gameplay-relevant state (for the solver). */
  key(): string {
    let k = '';
    for (const r of this.removed) k += r ? '1' : '0';
    k += `|${this.next}|`;
    for (const b of this.boxes) k += b ? `${b.color[0]}${b.color[1]}${b.screws.length},` : '-,';
    if (this.hasIce) for (const r of this.iced) k += r ? 'i' : '.';
    k += this.tray.filter((t) => t !== null).map((t) => this.screws[t!].color).sort().join('');
    if (this.stickyOpen >= 0) k += `|s${this.stickyOpen}`;
    if (this.hasBomb) k += `|t${this.taps}`;
    return k + (this.tray.length !== this.def.tray ? `#${this.tray.length}` : '');
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
  for (const p of def.planks) {
    if (!p.screws.length) problems.push('plank without screws');
    if (p.mods && p.mods.length !== p.screws.length) problems.push('mods do not match the screws');
  }
  const keys = def.planks.flatMap((p) => p.mods ?? []).filter((m) => m?.key !== undefined).map((m) => m!.key);
  def.planks.forEach((p, i) => {
    if (p.lock === undefined) return;
    if (!keys.includes(p.lock)) problems.push(`locked plank ${i} without a key`);
    if ((p.mods ?? []).some((m) => m?.key === p.lock)) problems.push(`plank ${i} holds its own key`);
  });
  const chains = new Map<number, number>();
  for (const p of def.planks) if (p.chain !== undefined) chains.set(p.chain, (chains.get(p.chain) ?? 0) + 1);
  for (const [c, n] of chains) if (n < 2) problems.push(`chain ${c} has one plank`);
  return problems;
}
