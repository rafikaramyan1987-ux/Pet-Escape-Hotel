import { describe, expect, it } from 'vitest';
import { claimDaily, coinsFor, dailyStatus, freshSave, parseSave, recordRoom, starsFor } from '../src/game/save';
import { DICTS } from '../src/game/i18n';

describe('progress', () => {
  it('stars: escape, all bones, never spotted', () => {
    expect(starsFor(0, 3, true)).toBe(1);
    expect(starsFor(3, 3, true)).toBe(2);
    expect(starsFor(3, 3, false)).toBe(3);
  });
  it('coins reward improvements, replays give a little', () => {
    expect(coinsFor(undefined, 3, 3)).toBe(45);
    expect(coinsFor({ stars: 3, bones: 3, best: 10 }, 3, 3)).toBe(3);
    const s = freshSave();
    recordRoom(s, '1-1', 2, 3, 30);
    recordRoom(s, '1-1', 1, 0, 20);
    expect(s.rooms['1-1']).toEqual({ stars: 2, bones: 3, best: 20 });
  });
  it('broken or old saves fall back to a fresh one', () => {
    expect(parseSave('{oops').coins).toBe(0);
    expect(parseSave(JSON.stringify({ v: 1, coins: 7 })).looks.dog.hat).toBe('none');
  });
});

describe('daily reward', () => {
  it('once per day, streak on consecutive days, resets after a gap', () => {
    const s = freshSave();
    const d1 = new Date(2026, 10, 8, 20);
    expect(claimDaily(s, d1)).toBe(20);
    expect(dailyStatus(s, d1).available).toBe(false);
    expect(claimDaily(s, new Date(2026, 10, 9, 9))).toBe(30);
    expect(claimDaily(s, new Date(2026, 10, 12, 9))).toBe(20);
  });
});

describe('i18n', () => {
  it('French has every English key, none empty', () => {
    for (const k of Object.keys(DICTS.en)) expect((DICTS.fr as Record<string, string>)[k], k).toBeTruthy();
  });
});
