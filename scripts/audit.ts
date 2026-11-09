/**
 * Level audit (CI). Every level must:
 *  - be valid and solvable (exhaustive solver, time limit per level), with the solver's order replayed to a win
 *    and the playtest bot (the in-game hint) winning from scratch;
 *  - need planning: best-peak margin (tray − fewest tray slots a perfect order needs) within its target (≤ 1);
 *  - punish mindless tapping: the random-tap failure rate (300 games, fixed seed) inside its stage's band —
 *    1–5: 15–30 %, 6–10: 30–50 %, 11–30: 50–70 %, 31–100: 70–90 %, bosses (every 10th) ≥ 90 %, each followed by an
 *    easier level;
 *  - use the tray size of its stage (3 / 4 / 5), 2–6 colours, 1–5 layers, a short solution, and each mechanic
 *    only from its intro level (8 ice, 14 hidden, 20 chain, 30 lock, 40 bomb, 55 sticky); no hidden screws in 1–10.
 * Writes docs/levels.md; exits 1 on any problem.
 */
import { writeFileSync } from 'node:fs';
import { MECHANIC_INTRO, type Mechanic, randomFailRate, targetFor } from '../src/puzzle/generate';
import { LEVELS } from '../src/puzzle/levels';
import { type LevelDef, Puzzle, validateLevel } from '../src/puzzle/model';
import { hint, solve } from '../src/puzzle/solver';

const TIME_LIMIT_MS = 4000;
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

function mechanicsOf(def: LevelDef): Mechanic[] {
  const mods = def.planks.flatMap((p) => p.mods ?? []);
  const out: Mechanic[] = [];
  if (mods.some((m) => m?.ice)) out.push('ice');
  if (mods.some((m) => m?.hidden)) out.push('hidden');
  if (def.planks.some((p) => p.chain !== undefined)) out.push('chain');
  if (mods.some((m) => m?.lock !== undefined)) out.push('lock');
  if (def.planks.some((p) => p.bomb !== undefined)) out.push('bomb');
  if (def.sticky) out.push('sticky');
  return out;
}

const rows: string[] = [];
const fails: number[] = [];
let bad = 0;
const t0 = Date.now();
LEVELS.forEach((def, i) => {
  const problems = validateLevel(def);
  const tg = targetFor(def.id);
  if (def.id !== i + 1) problems.push(`id ${def.id} at position ${i + 1}`);
  const r = solve(new Puzzle(def), { worst: false, maxStates: 400_000 });
  if (!r.complete) problems.push('solver did not finish');
  if (!r.solvable) problems.push('NOT SOLVABLE');
  if (r.ms > TIME_LIMIT_MS) problems.push(`solver took ${r.ms} ms (limit ${TIME_LIMIT_MS})`);
  if (def.tray !== tg.tray) problems.push(`tray ${def.tray}, target ${tg.tray}`);
  if (r.solvable && (r.margin < tg.margin[0] || r.margin > tg.margin[1])) problems.push(`margin ${r.margin} outside ${tg.margin.join('–')}`);
  // the solver's order, replayed, must win without overfilling the tray
  const replay = new Puzzle(def);
  let peak = 0;
  for (const m of r.bestPath) {
    replay.tap(m);
    peak = Math.max(peak, replay.trayCount());
  }
  if (r.solvable && (replay.status !== 'won' || peak > r.bestPeak)) problems.push('best path replay does not win');
  // playtest bot (the in-game hint, as used by ?auto=1, recordings and e2e)
  const bot = new Puzzle(def);
  let taps = 0;
  const b0 = Date.now();
  while (bot.status === 'play' && taps < 500) {
    const s = hint(bot);
    if (s < 0) break;
    bot.tap(s);
    taps++;
  }
  if (bot.status !== 'won') problems.push(`playtest bot ${bot.status} after ${taps} taps`);
  if (Date.now() - b0 > TIME_LIMIT_MS * 2) problems.push(`playtest bot too slow (${Date.now() - b0} ms)`);
  // random tapping must be risky, more so as levels go on
  const rf = randomFailRate(def);
  fails.push(rf);
  if (rf < tg.fail[0] || rf > tg.fail[1]) problems.push(`random fail ${pct(rf)} outside ${pct(tg.fail[0])}–${pct(tg.fail[1])}`);
  const screws = def.planks.reduce((n, p) => n + p.screws.length, 0);
  const colors = new Set(def.planks.flatMap((p) => p.screws)).size;
  const layers = new Set(def.planks.map((p) => p.layer)).size;
  if (colors < 2 || colors > 6) problems.push(`${colors} colours`);
  if (layers < 1 || layers > 5) problems.push(`${layers} layers`);
  // a thinking player needs ~1.8 s per tap: 20–60 s levels
  if (r.bestPath.length < 9 || r.bestPath.length > 34) problems.push(`solution of ${r.bestPath.length} taps`);
  const mech = mechanicsOf(def);
  for (const m of mech) if (def.id < MECHANIC_INTRO[m]) problems.push(`${m} before level ${MECHANIC_INTRO[m]}`);
  for (const [m, at] of Object.entries(MECHANIC_INTRO)) if (def.id === at && !mech.includes(m as Mechanic)) problems.push(`intro level without ${m}`);
  if (def.id <= 10 && mech.includes('hidden')) problems.push('hidden screws in levels 1-10');
  if (def.id > 1 && def.tutorial) problems.push('tutorial hand after level 1');
  const after = i > 0 && LEVELS[i - 1].id % 10 === 0;
  if (after && rf >= fails[i - 1]) problems.push('level after a boss must be easier');
  if (problems.length) bad++;
  const seconds = Math.round(r.bestPath.length * 1.8 + 4);
  const tag = tg.boss ? ' (boss)' : '';
  const line = `| ${def.id}${tag} | ${def.tray} | ${def.open} | ${def.planks.length} | ${screws} | ${colors} | ${layers} | ${mech.join(', ') || '–'} | ${r.bestPath.length} | ~${seconds} s | ${r.bestPeak}/${def.tray} | ${r.margin} | ${pct(rf)} | ${pct(tg.fail[0])}–${pct(tg.fail[1])} | ${r.states} | ${r.ms} | ${problems.join('; ') || 'ok'} |`;
  rows.push(line);
  console.log(line);
});
const md = `# Level audit

Generated by \`npm run audit\`; CI fails on any problem. Every level is solved exhaustively.

- **Tray / open**: holding-tray slots (3 on levels 1–10, 4 on 11–30, 5 from 31) and toolboxes open at once.
- **Solution**: taps in the solver's best order (ice needs two taps); **time**: ~1.8 s per tap for a thinking player.
- **Best peak / margin**: the fewest tray slots a perfect order needs, and tray − best peak. A margin of at most 1
  means every level needs planning.
- **Random fail**: share of 300 games (fixed seed) lost by tapping random free screws, against the target band of
  the level's stage. No level can be cleared by tapping without thinking. Bosses (every 10th) are ≥ 90 %, and the
  level after each boss is easier.
- **Mechanics**: ice from 8, hidden "?" from 14, chained planks from 20, locks from 30, bombs from 40, sticky slot from 55.
- The playtest bot (the in-game hint) also plays every level from scratch and must win.

| Level | Tray | Open | Planks | Screws | Colours | Layers | Mechanics | Solution | Time | Best peak | Margin | Random fail | Target | States | ms | Result |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
${rows.join('\n')}
`;
writeFileSync('docs/levels.md', md);
console.log(bad ? `\n${bad} level(s) failed the audit` : `\nall ${LEVELS.length} levels pass (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(bad ? 1 : 0);
