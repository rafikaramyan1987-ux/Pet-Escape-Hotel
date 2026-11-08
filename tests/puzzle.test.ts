import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/puzzle/levels';
import { type LevelDef, Puzzle, validateLevel } from '../src/puzzle/model';
import { solve } from '../src/puzzle/solver';

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

describe('opening levels', () => {
  for (const def of LEVELS) {
    it(`level ${def.id}: valid, solvable, and impossible to fail`, () => {
      expect(validateLevel(def)).toEqual([]);
      const r = solve(new Puzzle(def));
      expect(r.complete).toBe(true);
      expect(r.solvable).toBe(true);
      expect(r.canFail).toBe(false);
      expect(r.worstPeak).toBeLessThan(def.tray);
      // every screw starts with at least one free screw available
      expect(new Puzzle(def).freeScrews().length).toBeGreaterThan(0);
    });
  }
});
