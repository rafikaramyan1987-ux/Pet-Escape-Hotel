import { playRoom } from './bot';
import { type Level, isHideTile } from './level';
import { DT, Sim } from './sim';

/** Minimum noisy-bot win rate per floor (rooms get harder floor by floor). Finales may be 0.1 lower. */
export const FLOOR_MIN_WIN = [0.5, 0.25, 0.25, 0.2, 0.2];
export const MAX_WIN_HARD = 1;

export interface RoomAudit {
  solved: boolean;
  bones: number;
  time: number;
  winRate: number;
  problems: string[];
}

export function auditRoom(level: Level, seeds = 24): RoomAudit {
  const problems: string[] = [];
  const best = playRoom(level, {});
  if (!best.won) problems.push(best.stuck ?? (best.caught ? 'careful bot caught' : 'careful bot timed out'));
  if (best.bones < 3) problems.push(`careful bot got ${best.bones}/3 bones`);
  if (level.bones.length !== 3) problems.push(`${level.bones.length} bones in the map`);
  if (!level.exits.length) problems.push('no exit');

  // no sighting in the first 3 s without input
  const idle = new Sim(level);
  for (let t = 0; t < 3; t += DT) idle.step(DT);
  if (idle.status === 'caught' || idle.alertLevel() > 0) problems.push('pets noticed in the first 3 s');

  // no camping: tiles of the solution route that a light covers almost all the time
  const watch = new Sim(level);
  const counts = new Map<number, number>();
  const ticks = Math.round(30 / DT);
  for (let i = 0; i < ticks; i++) {
    watch.step(DT);
    watch.status = 'play';
    for (const k of best.visited) {
      const x = k % 64;
      const y = Math.floor(k / 64);
      if (isHideTile(watch.tile(x, y)) || watch.tile(x, y) === 'H') continue;
      if (watch.guards.some((g) => Math.hypot(g.x - x, g.y - y) < 0.6)) continue;
      const lit = watch.guards.some((g, gi) => g.mode !== 'sleep' && watch.sees(g.x, g.y, g.dir, watch.guardRange(gi), x, y))
        || watch.cams.some((c, ci) => watch.sees(level.def.cams![ci].x, level.def.cams![ci].y, c.dir, level.def.cams![ci].range ?? 4, x, y));
      if (lit) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  for (const [k, n] of counts) if (n / ticks > 0.85) problems.push(`tile ${k % 64},${Math.floor(k / 64)} watched ${Math.round((100 * n) / ticks)}% of the time`);

  let wins = 0;
  for (let s = 1; s <= seeds; s++) if (playRoom(level, { noisy: true, seed: s * 7919 }).won) wins++;
  const winRate = wins / seeds;
  const min = FLOOR_MIN_WIN[level.def.floor - 1] - (level.def.room === 8 ? 0.05 : 0);
  if (winRate < min) problems.push(`noisy win rate ${(winRate * 100).toFixed(0)}% < ${(min * 100).toFixed(0)}%`);
  return { solved: best.won, bones: best.bones, time: best.time, winRate, problems };
}
