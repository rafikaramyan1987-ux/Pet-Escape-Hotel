import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/puzzle/levels';
import { type LevelDef, Puzzle, validateLevel } from '../src/puzzle/model';
import { solve } from '../src/puzzle/solver';
import { targetFor } from '../src/puzzle/generate';

const lvl = (planks: LevelDef['planks'], queue: LevelDef['queue'], extra: Partial<LevelDef> = {}): LevelDef => ({
  id: 0, object: 'crate', pet: 'dog', open: 2, tray: 5, planks, queue, ...extra,
});

describe('rules', () => {
  it('a screw goes to the open box of its colour; a full box closes and the next opens', () => {
    const p = new Puzzle(lvl([{ x: 0, y: 0, len: 3, angle: 0, layer: 0, screws: ['red', 'red', 'red'] }, { x: 0, y: 1, len: 3, angle: 0, layer: 0, screws: ['red', 'red', 'red'] }], ['red', 'red'], { open: 1 }));
    expect(p.tap(0)).toEqual([{ type: 'toBox', screw: 0, box: 0, uid: 1, slot: 0 }]);
    p.tap(1);
    const ev = p.tap(2);
    expect(ev.map((e) => e.type)).toEqual(['toBox', 'boxFull', 'boxOpen', 'plankFall']);
    expect(p.boxes[0]!.color).toBe('red');
  });

  it('no matching box: the screw waits in the tray and moves into the box when it opens', () => {
    const p = new Puzzle(lvl([{ x: 0, y: 0, len: 3, angle: 0, layer: 0, screws: ['blue', 'red', 'red', 'red', 'blue', 'blue'] }], ['red', 'blue'], { open: 1 }));
    expect(p.tap(0)[0]).toMatchObject({ type: 'toTray', slot: 0 });
    p.tap(1);
    p.tap(2);
    const ev = p.tap(3);
    expect(ev.map((e) => e.type)).toEqual(['toBox', 'boxFull', 'boxOpen', 'trayToBox']);
    expect(p.trayCount()).toBe(0);
  });

  it('a covered screw cannot be tapped until the plank above falls', () => {
    const p = new Puzzle(lvl([
      { x: 0, y: 0, len: 3, angle: 90, layer: 0, screws: ['red', 'red', 'red'] },
      { x: 0, y: 0, len: 3, angle: 0, layer: 1, screws: ['blue', 'blue', 'blue'] },
    ], ['red', 'blue']));
    const middle = 1; // centre screw of the vertical plank sits under the horizontal one
    expect(p.isFree(middle)).toBe(false);
    expect(p.tap(middle)).toEqual([]);
    for (const s of [3, 4, 5]) p.tap(s);
    expect(p.isFree(middle)).toBe(true);
  });

  it('removing every plank rescues the pet; a full tray with nowhere to go loses', () => {
    const win = new Puzzle(lvl([{ x: 0, y: 0, len: 3, angle: 0, layer: 0, screws: ['red', 'red', 'red'] }], ['red']));
    win.tap(0);
    win.tap(1);
    expect(win.tap(2).at(-1)).toEqual({ type: 'won' });
    const lose = new Puzzle(lvl([{ x: 0, y: 0, len: 5, angle: 0, layer: 0, screws: ['blue', 'blue', 'blue', 'red', 'red', 'red'] }], ['green', 'blue', 'red'], { open: 1, tray: 2 }));
    lose.tap(0);
    lose.tap(1);
    expect(lose.status).toBe('lost');
  });

  it('the solver finds the best order and the worst case', () => {
    const p = new Puzzle(lvl([{ x: 0, y: 0, len: 4, angle: 0, layer: 0, screws: ['blue', 'red', 'red', 'red', 'blue', 'blue'] }], ['red', 'blue'], { open: 1 }));
    const r = solve(p);
    expect(r.solvable).toBe(true);
    expect(r.bestPeak).toBe(0); // reds first: the tray is never used
    expect(r.worstPeak).toBe(3); // all blues first
    expect(r.canFail).toBe(false);
  });
});

describe('mechanics', () => {
  const bar = (y: number, screws: LevelDef['planks'][0]['screws'], extra: Partial<LevelDef['planks'][0]> = {}) => ({ x: 0, y, len: 3, angle: 0, layer: 0, screws, ...extra });

  it('ice: the first tap breaks it, the second unscrews', () => {
    const p = new Puzzle(lvl([bar(0, ['red', 'red', 'red'], { mods: [{ ice: 1 }, null, null] })], ['red']));
    expect(p.tap(0)).toEqual([{ type: 'ice', screw: 0 }]);
    expect(p.removed[0]).toBe(false);
    expect(p.tap(0)[0]).toMatchObject({ type: 'toBox', screw: 0 });
  });

  it('hidden "?": revealed when the plank above falls', () => {
    const p = new Puzzle(lvl([
      { x: 0, y: 0, len: 3, angle: 90, layer: 0, screws: ['red', 'red', 'red'], mods: [null, { hidden: 1 }, null] },
      { x: 0, y: 0, len: 3, angle: 0, layer: 1, screws: ['blue', 'blue', 'blue'] },
    ], ['blue', 'red'], { open: 1 }));
    p.tap(3);
    p.tap(4);
    expect(p.tap(5).some((e) => e.type === 'reveal' && e.screw === 1)).toBe(true);
  });

  it('chained planks fall together, only when both are empty', () => {
    const p = new Puzzle(lvl([bar(0.6, ['red', 'red', 'red'], { chain: 0 }), bar(-0.6, ['blue', 'blue', 'blue'], { chain: 0 })], ['red', 'blue']));
    for (const s of [0, 1, 2]) p.tap(s);
    expect(p.plankGone[0]).toBe(false);
    p.tap(3);
    p.tap(4);
    const ev = p.tap(5);
    expect(ev.filter((e) => e.type === 'plankFall')).toHaveLength(2);
  });

  it('lock: the locked screw opens once its key screw is out', () => {
    const p = new Puzzle(lvl([bar(0.6, ['red', 'red', 'red'], { mods: [{ lock: 0 }, null, null] }), bar(-0.6, ['red', 'red', 'red'], { mods: [null, null, { key: 0 }] })], ['red', 'red']));
    expect(p.isFree(0)).toBe(false);
    expect(p.tap(0)).toEqual([]);
    expect(p.tap(5).some((e) => e.type === 'unlock' && e.screw === 0)).toBe(true);
    expect(p.isFree(0)).toBe(true);
  });

  it('bomb: the level is lost when the counter runs out before the plank falls', () => {
    const def = lvl([bar(0.6, ['red', 'red', 'red'], { bomb: 2 }), bar(-0.6, ['red', 'red', 'red'])], ['red', 'red']);
    const lose = new Puzzle(def);
    lose.tap(3);
    expect(lose.bombLeft(0)).toBe(1);
    expect(lose.tap(4).at(-1)).toEqual({ type: 'lost', reason: 'bomb', plank: 0 });
    const ok = new Puzzle({ ...def, planks: [bar(0.6, ['red', 'red', 'red'], { bomb: 3 }), bar(-0.6, ['red', 'red', 'red'])] });
    for (const s of [0, 1, 2]) ok.tap(s);
    expect(ok.status).toBe('play');
    expect(ok.bombLeft(0)).toBe(Infinity);
  });

  it('sticky slot only takes its colour', () => {
    const p = new Puzzle(lvl([bar(0, ['blue', 'green', 'red', 'red', 'red', 'blue'].slice(0, 6) as LevelDef['queue'])], ['red', 'blue'], { open: 1, tray: 2, sticky: { slot: 1, color: 'green' } }));
    expect(p.tap(0)[0]).toMatchObject({ type: 'toTray', slot: 0 });
    expect(p.tap(1)[0]).toMatchObject({ type: 'toTray', slot: 1 });
  });

  it('undo the last 3 taps', () => {
    const p = new Puzzle(lvl([bar(0, ['red', 'red', 'red'])], ['red']));
    p.tap(0);
    p.tap(1);
    expect(p.undoActions(3)).toEqual([]);
    expect(p.undoActions(1)).toEqual([{ t: 'tap', id: 0 }]);
  });
});

describe('levels', () => {
  it('there are 100 levels, numbered 1..100, with the tray of their stage', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
    for (const l of LEVELS) expect(l.tray, `level ${l.id}`).toBe(targetFor(l.id).tray);
  });
  it('only level 1 has the tutorial hand', () => {
    expect(LEVELS.filter((l) => l.tutorial).map((l) => l.id)).toEqual([1]);
  });
  for (const def of LEVELS) {
    it(`level ${def.id}: valid, solvable, needs planning (margin ≤ 1)`, () => {
      expect(validateLevel(def)).toEqual([]);
      const r = solve(new Puzzle(def), { worst: false });
      expect(r.complete).toBe(true);
      expect(r.solvable).toBe(true);
      expect(r.margin).toBeLessThanOrEqual(1);
    });
  }
});
