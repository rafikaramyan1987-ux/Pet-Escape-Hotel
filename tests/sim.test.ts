import { describe, expect, it } from 'vitest';
import { type LevelDef, parseLevel } from '../src/core/level';
import { findPath } from '../src/core/path';
import { DT, Sim } from '../src/core/sim';

function room(map: string[], extra: Partial<LevelDef> = {}): Sim {
  return new Sim(parseLevel({ id: 't', floor: 1, room: 1, name: { en: 't', fr: 't' }, map, guards: [], plan: [], ...extra }));
}
function run(sim: Sim, seconds: number): void {
  for (let t = 0; t < seconds; t += DT) sim.step(DT);
}
function walk(sim: Sim, kind: 'dog' | 'cat' | 'hamster', x: number, y: number, seconds = 6): void {
  const p = sim.pet(kind)!;
  const path = findPath(sim, kind, p.tx, p.ty, x, y);
  expect(path).not.toBeNull();
  sim.moveTo(kind, path);
  run(sim, seconds);
}

describe('abilities', () => {
  const map = ['#######', '#d.F.o#', '#######', '#c.H.o#', '#######', '#m.h.o#', '#E#####'];
  it('only the dog digs under fences', () => {
    const s = room(map);
    expect(findPath(s, 'dog', 1, 1, 5, 1)).not.toBeNull();
    expect(findPath(s, 'cat', 1, 3, 5, 3)).not.toBeNull();
    expect(findPath(s, 'hamster', 1, 5, 4, 5)).not.toBeNull();
    expect(findPath(room(['#####', '#cF.#', '#E###']), 'cat', 1, 1, 3, 1)).toBeNull();
  });
  it('only the cat jumps onto shelves, and is hidden up there', () => {
    const s = room(map);
    expect(findPath(s, 'cat', 1, 3, 5, 3)).not.toBeNull();
    expect(findPath(room(['#####', '#dH.#', '#E###']), 'dog', 1, 1, 3, 1)).toBeNull();
    walk(s, 'cat', 3, 3);
    expect(s.isHidden(s.pet('cat')!)).toBe(true);
  });
  it('only the hamster squeezes through holes', () => {
    const s = room(map);
    expect(findPath(s, 'hamster', 1, 5, 5, 5)).not.toBeNull();
    expect(findPath(room(['#####', '#dh.#', '#E###']), 'dog', 1, 1, 3, 1)).toBeNull();
  });
  it('pipes carry the hamster to the other end', () => {
    const s = room(['#######', '#m1#1o#', '#E#####']);
    walk(s, 'hamster', 5, 1);
    expect(s.pet('hamster')!.tx).toBe(5);
    expect(s.bones[0]).toBe(true);
  });
});

describe('rules', () => {
  it('collecting bones and leaving through the EXIT wins', () => {
    const s = room(['#E###', '#...#', '#od.#', '#####']);
    walk(s, 'dog', 1, 2);
    walk(s, 'dog', 1, 0);
    expect(s.bones).toEqual([true]);
    expect(s.status).toBe('won');
  });
  it('a locked EXIT needs the key first', () => {
    const s = room(['#E###', '#..k#', '#.d.#', '#####']);
    walk(s, 'dog', 1, 0);
    expect(s.status).toBe('play');
    walk(s, 'dog', 3, 1);
    walk(s, 'dog', 1, 0);
    expect(s.status).toBe('won');
  });
  it('a gate is open only while a pet sits on a paw button', () => {
    const s = room(['##E##', '##X##', '#x.c#', '#d..#', '#####']);
    expect(findPath(s, 'cat', 3, 2, 2, 0)).toBeNull();
    walk(s, 'dog', 1, 2);
    expect(s.gateOpen).toBe(true);
    walk(s, 'cat', 2, 0);
    expect(s.pet('cat')!.escaped).toBe(true);
  });
  it('switching pets is instant and escaped pets are skipped', () => {
    const s = room(['#E###', '#dcm#', '#####']);
    expect(s.active).toBe('dog');
    s.cycle();
    expect(s.active).toBe('cat');
    s.setActive('hamster');
    expect(s.active).toBe('hamster');
  });
});

describe('staff', () => {
  const corridor = ['#########', '#d......#', '#E#######'];
  it('a guard facing a pet becomes suspicious, then chases and catches it', () => {
    const s = room(corridor, { guards: [{ path: [[6, 1]], face: 180 }] });
    run(s, 1);
    expect(s.status).toBe('play'); // still in the kennel: hidden
    walk(s, 'dog', 2, 1, 0.5);
    const modes = new Set<string>();
    for (let t = 0; t < 5 && s.status === 'play'; t += DT) {
      s.step(DT);
      modes.add(s.guards[0].mode);
    }
    expect(modes.has('suspicious')).toBe(true);
    expect(modes.has('chase')).toBe(true);
    expect(s.status).toBe('caught');
  });
  it('pets in hiding spots are not seen', () => {
    const s = room(['#########', '#.P.....#', '#E#d#####'], { guards: [{ path: [[6, 1]], face: 180 }] });
    s.pet('dog')!.tx = 2;
    s.pet('dog')!.ty = 1;
    run(s, 4);
    expect(s.status).toBe('play');
    expect(s.alertLevel()).toBe(0);
  });
  it('sleeping staff see nothing but wake up to noise', () => {
    const s = room(['#########', '#~......#', '#d#E#####'], { guards: [{ path: [[3, 1]], sleep: true, face: 180 }] });
    run(s, 2);
    expect(s.guards[0].mode).toBe('sleep');
    walk(s, 'dog', 1, 1, 0.5);
    expect(['suspicious', 'look', 'chase']).toContain(s.guards[0].mode);
  });
  it('running makes noise, walking does not', () => {
    const quiet = room(['#########', '#d......#', '#E#######'], { guards: [{ path: [[7, 1]], sleep: true, face: 0 }] });
    walk(quiet, 'dog', 5, 1, 2);
    expect(quiet.guards[0].mode).toBe('sleep');
    const loud = room(['#########', '#d......#', '#E#######'], { guards: [{ path: [[7, 1]], sleep: true, face: 0 }] });
    loud.run = true;
    walk(loud, 'dog', 5, 1, 2);
    expect(loud.guards[0].mode).not.toBe('sleep');
  });
  it('cameras catch a pet that stays in view', () => {
    const s = room(['#########', '#d......#', '#E#######'], { cams: [{ x: 8, y: 1, from: 180, to: 180, range: 9 }] });
    walk(s, 'dog', 2, 1, 2);
    expect(s.status).toBe('caught');
  });
  it('the simulation is deterministic and clonable', () => {
    const a = room(corridor, { guards: [{ path: [[3, 1], [7, 1]] }] });
    const b = a.clone();
    run(a, 3);
    run(b, 3);
    expect(b.guards[0].x).toBeCloseTo(a.guards[0].x, 9);
    expect(b.status).toBe(a.status);
  });
});
