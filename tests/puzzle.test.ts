import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/puzzle/levels';
import { type LevelDef, Puzzle, validateLevel } from '../src/puzzle/model';
import { analyze, solve } from '../src/puzzle/solver';
import { targetFor, tierOf, trayOf } from '../src/puzzle/generate';

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

describe('rules v2', () => {
  const bar = (y: number, screws: LevelDef['planks'][0]['screws'], extra: Partial<LevelDef['planks'][0]> = {}) => ({ x: 0, y, len: 3, angle: 0, layer: 0, screws, ...extra });

  it('tray full = level failed (the last slot can not be used)', () => {
    const p = new Puzzle(lvl([bar(0.6, ['blue', 'green', 'yellow']), bar(-0.6, ['red', 'red', 'red'])], ['red', 'pink'], { tray: 2 }));
    expect(p.tap(0)[0]).toMatchObject({ type: 'toTray', slot: 0 });
    expect(p.status).toBe('play');
    const ev = p.tap(1);
    expect(ev).toEqual([{ type: 'toTray', screw: 1, slot: 1 }, { type: 'lost', reason: 'tray' }]);
  });

  it('box queue: two boxes active, the next box of the queue replaces a full one, in order', () => {
    const p = new Puzzle(lvl([bar(0.9, ['red', 'red', 'red']), bar(0, ['blue', 'blue', 'blue']), bar(-0.9, ['green', 'green', 'green'])], ['red', 'blue', 'green']));
    expect(p.boxes.map((b) => b?.color)).toEqual(['red', 'blue']);
    p.tap(0);
    p.tap(1);
    const ev = p.tap(2);
    expect(ev.find((e) => e.type === 'boxOpen')).toMatchObject({ box: 0, color: 'green' });
    expect(p.boxes.map((b) => b?.color)).toEqual(['green', 'blue']);
  });

  it('locked plank: its screws wait for the key screw', () => {
    const p = new Puzzle(lvl([bar(0.6, ['red', 'red', 'red'], { lock: 0 }), bar(-0.6, ['red', 'red', 'red'], { mods: [null, null, { key: 0 }] })], ['red', 'red']));
    expect(p.isFree(0)).toBe(false);
    expect(p.tap(0)).toEqual([]);
    expect(p.tap(5).some((e) => e.type === 'unlock' && e.plank === 0)).toBe(true);
    expect(p.isFree(0)).toBe(true);
  });

  it('ice: the first tap cracks it, the second unscrews', () => {
    const p = new Puzzle(lvl([bar(0, ['red', 'red', 'red'], { mods: [{ ice: 1 }, null, null] })], ['red']));
    expect(p.tap(0)).toEqual([{ type: 'ice', screw: 0 }]);
    expect(p.removed[0]).toBe(false);
    expect(p.tap(0)[0]).toMatchObject({ type: 'toBox', screw: 0 });
  });

  it('hidden colour: revealed when the plank above falls', () => {
    const p = new Puzzle(lvl([
      { x: 0, y: 0, len: 3, angle: 90, layer: 0, screws: ['red', 'red', 'red'], mods: [null, { hidden: 1 }, null] },
      { x: 0, y: 0, len: 3, angle: 0, layer: 1, screws: ['blue', 'blue', 'blue'] },
    ], ['blue', 'red'], { open: 1 }));
    p.tap(3);
    p.tap(4);
    expect(p.tap(5).some((e) => e.type === 'reveal' && e.screw === 1)).toBe(true);
  });

  it('chain: linked planks fall together, only when both are free', () => {
    const p = new Puzzle(lvl([bar(0.6, ['red', 'red', 'red'], { chain: 0 }), bar(-0.6, ['blue', 'blue', 'blue'], { chain: 0 })], ['red', 'blue']));
    for (const s of [0, 1, 2]) p.tap(s);
    expect(p.plankGone[0]).toBe(false);
    p.tap(3);
    p.tap(4);
    expect(p.tap(5).filter((e) => e.type === 'plankFall')).toHaveLength(2);
  });

  it('bomb screw: lost if not removed within N taps', () => {
    const def = lvl([bar(0.6, ['red', 'red', 'red'], { mods: [{ bomb: 2 }, null, null] }), bar(-0.6, ['red', 'red', 'red'])], ['red', 'red']);
    const lose = new Puzzle(def);
    lose.tap(3);
    expect(lose.bombLeft(0)).toBe(1);
    expect(lose.tap(4).at(-1)).toEqual({ type: 'lost', reason: 'bomb', screw: 0 });
    const ok = new Puzzle(def);
    ok.tap(3);
    ok.tap(0);
    expect(ok.status).toBe('play');
    expect(ok.bombLeft(0)).toBe(Infinity);
  });

  it('sticky plank: once touched, its screws must all come out before any other screw', () => {
    const p = new Puzzle(lvl([bar(0.6, ['red', 'red', 'red'], { sticky: 1 }), bar(-0.6, ['blue', 'blue', 'blue'])], ['red', 'blue']));
    expect(p.isFree(3)).toBe(true);
    expect(p.tap(0).some((e) => e.type === 'sticky')).toBe(true);
    expect(p.isFree(3)).toBe(false);
    expect(p.tap(3)).toEqual([]);
    p.tap(1);
    expect(p.tap(2).some((e) => e.type === 'plankFall' && e.plank === 0)).toBe(true);
    expect(p.isFree(3)).toBe(true);
  });

  it('undo the last 3 taps', () => {
    const p = new Puzzle(lvl([bar(0, ['red', 'red', 'red'])], ['red']));
    p.tap(0);
    p.tap(1);
    expect(p.undoActions(3)).toEqual([]);
    expect(p.undoActions(1)).toEqual([{ t: 'tap', id: 0 }]);
  });

  it('analysis: a trap screw and a real decision', () => {
    // red box and blue box active; green waits: tapping the green screws early fills the 3-slot tray
    const def = lvl([
      { x: 0, y: 0.6, len: 3, angle: 0, layer: 1, screws: ['green', 'green', 'red'] },
      { x: 0, y: 0.6, len: 3, angle: 0, layer: 0, screws: ['red', 'red', 'blue'] },
      bar(-0.6, ['blue', 'blue', 'green']),
    ], ['red', 'blue', 'green'], { tray: 3 });
    const a = analyze(new Puzzle(def));
    expect(a.solvable).toBe(true);
    expect(a.minMoves).toBe(9);
  });
});

describe('levels', () => {
  it('at least 60 levels, numbered from 1, with the tray of their tier and two active boxes', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(60);
    expect(LEVELS.map((l) => l.id)).toEqual(Array.from({ length: LEVELS.length }, (_, i) => i + 1));
    for (const l of LEVELS) {
      expect(l.tray, `level ${l.id}`).toBe(targetFor(l.id).tray);
      expect(l.open).toBe(2);
    }
    expect(tierOf(15)).toBe('hard');
    expect(tierOf(20)).toBe('veryhard');
    expect(trayOf(20)).toBe(3);
    expect(trayOf(9)).toBe(5);
    expect(trayOf(11)).toBe(4);
  });
  it('the tutorial hand is on levels 1-2 only', () => {
    expect(LEVELS.filter((l) => l.tutorial).map((l) => l.id)).toEqual([1, 2]);
  });
  for (const def of LEVELS) {
    it(`level ${def.id}: valid, solvable without boosters, a trap from level 3`, () => {
      expect(validateLevel(def)).toEqual([]);
      const a = analyze(new Puzzle(def));
      expect(a.complete).toBe(true);
      expect(a.solvable).toBe(true);
      if (def.id >= 3) expect(a.trapScrews.length).toBeGreaterThan(0);
    });
  }
});
