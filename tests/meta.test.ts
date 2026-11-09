import { describe, expect, it } from 'vitest';
import { allPets, bossHat, petId, petOfLevel } from '../src/game/collection';
import { freshSave, parseSave } from '../src/game/save';
import { item } from '../src/game/shop';
import { LEVELS } from '../src/puzzle/levels';
import { Puzzle } from '../src/puzzle/model';
import { solve } from '../src/puzzle/solver';
import { rewardFor } from '../src/puzzle/game';

describe('collection', () => {
  it('18 pets, all of them freed somewhere in the 100 levels', () => {
    expect(allPets()).toHaveLength(18);
    const freed = new Set(LEVELS.map((l) => petId(petOfLevel(l.id, l.pet))));
    expect(freed.size).toBe(18);
  });
  it('levels 1-3 free the three default pets; bosses give real shop hats', () => {
    expect(LEVELS.slice(0, 3).map((l) => petOfLevel(l.id, l.pet).v)).toEqual([0, 0, 0]);
    for (let id = 10; id <= 100; id += 10) expect(item(bossHat(id)!)?.slot).toBe('hat');
    expect(bossHat(11)).toBeNull();
  });
});

describe('saves and rewards', () => {
  it('old saves get booster stock and an empty collection', () => {
    const s = parseSave(JSON.stringify({ v: 1, coins: 9 }));
    expect(s.boosters).toEqual(freshSave().boosters);
    expect(s.pets).toEqual([]);
    expect(s.settings.vibration).toBe(true);
  });
  it('coins on every rescue, more on bosses, never below 5', () => {
    expect(rewardFor(1, 0)).toBe(10);
    expect(rewardFor(40, 0)).toBeGreaterThan(rewardFor(39, 0) + 20);
    expect(rewardFor(3, 20)).toBe(5);
  });
});

describe('boosters (model)', () => {
  const def = LEVELS[39];
  it('undo replays every move but the last tap', () => {
    const p = new Puzzle(def);
    const path = solve(new Puzzle(def), { worst: false }).bestPath;
    p.tap(path[0]);
    p.tap(path[1]);
    const back = Puzzle.replay(def, p.undoActions()!);
    expect(back.history).toEqual([{ t: 'tap', id: path[0] }]);
    expect(back.key()).not.toBe(p.key());
  });
  it('continue after a loss: the same moves with one more slot are not lost', () => {
    // play badly until lost
    let p = new Puzzle(def);
    for (let k = 0; p.status !== 'lost' && k < 50; k++) {
      p = new Puzzle(def);
      let i = k;
      while (p.status === 'play') {
        const f = p.freeScrews();
        p.tap(f[(i++ * 7) % f.length]);
      }
    }
    expect(p.status).toBe('lost');
    const cont = Puzzle.replay(def, [{ t: 'slot' }, ...p.history]);
    expect(cont.status).not.toBe('lost');
    expect(cont.tray.length).toBe(def.tray + 1);
  });
  it('hammer removes a plank and its screws still fill their boxes', () => {
    const p = new Puzzle(def);
    const ev = p.hammer(0);
    expect(ev[0]).toMatchObject({ type: 'hammer', plank: 0 });
    expect(p.plankGone[0]).toBe(true);
    // the level can still be won afterwards
    expect(solve(p, { worst: false }).solvable).toBe(true);
  });
});
