import type { PetKind } from '../art/pets';

/** Progress, wallet, cosmetics and settings. Stored through the platform (CrazyGames Data Module / localStorage). */
export interface RoomRecord {
  stars: number;
  bones: number;
  best: number;
}

export interface Look {
  hat: string;
  collar: string;
  skin: string;
}

export interface SaveData {
  v: 1;
  rooms: Record<string, RoomRecord>;
  fails: Record<string, number>;
  skipped: string[];
  coins: number;
  owned: string[];
  looks: Record<PetKind, Look>;
  daily: { last: string; streak: number };
  settings: { lang: 'en' | 'fr' | ''; sound: boolean; music: boolean };
  seenTips: number[];
}

export const SAVE_KEY = 'screw-and-rescue.save.v1';

export function freshSave(): SaveData {
  const look: Look = { hat: 'none', collar: 'default', skin: 'default' };
  return {
    v: 1,
    rooms: {},
    fails: {},
    skipped: [],
    coins: 0,
    owned: ['none', 'default'],
    looks: { dog: { ...look }, cat: { ...look }, hamster: { ...look } },
    daily: { last: '', streak: 0 },
    settings: { lang: '', sound: true, music: true },
    seenTips: [],
  };
}

export function parseSave(raw: string | null): SaveData {
  const base = freshSave();
  if (!raw) return base;
  try {
    const d = JSON.parse(raw) as Partial<SaveData>;
    if (d.v !== 1) return base;
    return {
      ...base,
      ...d,
      looks: { ...base.looks, ...(d.looks ?? {}) },
      daily: { ...base.daily, ...(d.daily ?? {}) },
      settings: { ...base.settings, ...(d.settings ?? {}) },
    };
  } catch {
    return base;
  }
}

/** Stars for a finished room: 1 for escaping, +1 all bones, +1 never spotted. */
export function starsFor(bones: number, totalBones: number, spotted: boolean): number {
  return 1 + (bones === totalBones ? 1 : 0) + (spotted ? 0 : 1);
}

/** Coins: 10 per new star, 5 per bone the first time, 3 for a replay. */
export function coinsFor(prev: RoomRecord | undefined, stars: number, bones: number): number {
  const prevStars = prev?.stars ?? 0;
  const prevBones = prev?.bones ?? 0;
  const gained = 10 * Math.max(0, stars - prevStars) + 5 * Math.max(0, bones - prevBones);
  return gained > 0 ? gained : 3;
}

export function recordRoom(s: SaveData, id: string, stars: number, bones: number, time: number): number {
  const prev = s.rooms[id];
  const coins = coinsFor(prev, stars, bones);
  s.rooms[id] = {
    stars: Math.max(stars, prev?.stars ?? 0),
    bones: Math.max(bones, prev?.bones ?? 0),
    best: prev ? Math.min(prev.best, time) : time,
  };
  s.coins += coins;
  s.fails[id] = 0;
  return coins;
}

export const DAILY_REWARDS = [20, 30, 40, 50, 60, 80, 120];

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Daily reward: claimable once per calendar day; the streak continues on consecutive days (7-day cycle). */
export function dailyStatus(s: SaveData, now: Date): { available: boolean; day: number; amount: number } {
  const today = dayKey(now);
  if (s.daily.last === today) return { available: false, day: s.daily.streak, amount: 0 };
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const streak = s.daily.last === dayKey(y) ? s.daily.streak + 1 : 1;
  const day = ((streak - 1) % 7) + 1;
  return { available: true, day, amount: DAILY_REWARDS[day - 1] };
}

export function claimDaily(s: SaveData, now: Date, multiplier = 1): number {
  const st = dailyStatus(s, now);
  if (!st.available) return 0;
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  s.daily.streak = s.daily.last === dayKey(y) ? s.daily.streak + 1 : 1;
  s.daily.last = dayKey(now);
  s.coins += st.amount * multiplier;
  return st.amount * multiplier;
}
