import { describe, expect, it } from 'vitest';
import { guardCanEnter, parseLevel, PET_KINDS } from '../src/core/level';
import { findPath } from '../src/core/path';
import { ROOMS } from '../src/core/rooms';
import { Sim } from '../src/core/sim';

describe('40 hand-made rooms', () => {
  it('has 5 floors × 8 rooms with unique ids', () => {
    expect(ROOMS).toHaveLength(40);
    expect(new Set(ROOMS.map((r) => r.id)).size).toBe(40);
    for (let f = 1; f <= 5; f++) expect(ROOMS.filter((r) => r.floor === f)).toHaveLength(8);
  });

  for (const def of ROOMS) {
    it(`${def.id} ${def.name.en}: well formed`, () => {
      const level = parseLevel(def);
      expect(level.bones).toHaveLength(3);
      expect(level.exits.length).toBeGreaterThan(0);
      expect(level.pets.length).toBeGreaterThan(0);
      expect(def.map.every((r) => r.length === level.w)).toBe(true);
      for (const p of level.required) expect(level.pets).toContain(p);
      for (const step of def.plan) expect(level.pets).toContain(step.pet);
      // every required pet can reach an exit (ignoring staff, with gates open)
      const sim = new Sim(level);
      for (const kind of level.required) {
        const [sx, sy] = level.starts[kind]!;
        const ok = level.exits.some(([ex, ey]) => findPath(sim, kind, sx, sy, ex, ey, { gate: true }) !== null);
        expect(ok, `${kind} reaches the exit`).toBe(true);
      }
      // staff stand and patrol on walkable floor
      for (const g of def.guards) for (const [x, y] of g.path) expect(guardCanEnter(level.tiles[y][x], true), `${def.id} guard at ${x},${y}`).toBe(true);
      expect(PET_KINDS).toContain(level.pets[0]);
    });
  }
});
