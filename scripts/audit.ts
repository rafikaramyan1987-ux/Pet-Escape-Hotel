/**
 * Level audit (CI). For every level the solver (exhaustive search with state hashing) proves it solvable without
 * boosters and measures: the minimum number of moves, the trap first moves (first moves after which the level can
 * no longer be won), the trap screws and real decisions on the winning line, and the fail rate of a
 * random-tapping bot over 1000 games. Each level must hit the targets of its tier:
 *   tutorial (1–2)          random fail 3–35 %
 *   easy (3–10)             60–90 %, at least one trap and two decisions, the first decision by tap 4, and an
 *                           "obvious" bot (always a screw that goes straight into its box) failing ≥ 25 %
 *   normal (from 11)        70–90 %
 *   Hard (every 5th)        90–98 %
 *   Very hard (every 10th)  ≥ 98 % (3-slot tray)
 * plus the tray of its tier (5 on 1–10, 4 from 11, 3 on Very hard), 12–36 moves (30–90 s), each mechanic from its
 * intro level (5 lock, 9 ice, 13 hidden, 18 chain, 25 bomb, 35 sticky), at least 60 levels, and levels 1–10 that
 * all look different (each its own pet, and no two levels in a row with the same object, plank looks or colours).
 * Writes docs/levels-report.md; exits 1 on any problem.
 */
import { writeFileSync } from 'node:fs';
import { MECHANIC_INTRO, type Mechanic, greedyFailRate, randomFailRate, targetFor } from '../src/puzzle/generate';
import { petId, petOfLevel } from '../src/game/collection';
import { LEVELS } from '../src/puzzle/levels';
import { type LevelDef, OPEN_BOXES, Puzzle, validateLevel } from '../src/puzzle/model';
import { analyze, hint } from '../src/puzzle/solver';

const TIME_LIMIT_MS = 5000;
const GAMES = 1000;
const SECONDS_PER_MOVE = 2.5;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const TIER_NAME = { tutorial: 'Tutorial', easy: 'Easy', normal: 'Normal', hard: 'Hard', veryhard: 'Very hard' };

export function mechanicsOf(def: LevelDef): Mechanic[] {
  const mods = def.planks.flatMap((p) => p.mods ?? []);
  const out: Mechanic[] = [];
  if (def.planks.some((p) => p.lock !== undefined)) out.push('lock');
  if (mods.some((m) => m?.ice)) out.push('ice');
  if (mods.some((m) => m?.hidden)) out.push('hidden');
  if (def.planks.some((p) => p.chain !== undefined)) out.push('chain');
  if (mods.some((m) => m?.bomb)) out.push('bomb');
  if (def.planks.some((p) => p.sticky)) out.push('sticky');
  return out;
}

interface Row {
  id: number;
  tier: string;
  fail: number;
  moves: number;
  traps: number;
  trapFirst: number;
  decisions: number;
  firstDecision: number;
  greedy: number;
}
const rows: string[] = [];
const data: Row[] = [];
let bad = 0;
const t0 = Date.now();
if (LEVELS.length < 60) {
  console.log(`only ${LEVELS.length} levels (at least 60 required)`);
  bad++;
}
LEVELS.forEach((def, i) => {
  const problems = validateLevel(def);
  const tg = targetFor(def.id);
  if (def.id !== i + 1) problems.push(`id ${def.id} at position ${i + 1}`);
  if (def.open !== OPEN_BOXES) problems.push(`${def.open} active boxes (must be ${OPEN_BOXES})`);
  if (def.tray !== tg.tray) problems.push(`tray ${def.tray}, target ${tg.tray}`);
  const a = analyze(new Puzzle(def));
  if (!a.complete) problems.push('solver did not finish');
  if (!a.solvable) problems.push('NOT SOLVABLE');
  if (a.ms > TIME_LIMIT_MS) problems.push(`solver took ${a.ms} ms (limit ${TIME_LIMIT_MS})`);
  // the winning line, replayed, must win
  const replay = new Puzzle(def);
  for (const m of a.winPath) replay.tap(m);
  if (a.solvable && replay.status !== 'won') problems.push('winning line replay does not win');
  // the in-game hint bot (recordings, e2e) must win from scratch
  const bot = new Puzzle(def);
  for (let k = 0; bot.status === 'play' && k < 400; k++) {
    const s = hint(bot);
    if (s < 0) break;
    bot.tap(s);
  }
  if (bot.status !== 'won') problems.push(`hint bot ${bot.status}`);
  const fail = randomFailRate(def, GAMES);
  if (fail < tg.fail[0] || fail > tg.fail[1]) problems.push(`random fail ${pct(fail)} outside ${pct(tg.fail[0])}–${pct(tg.fail[1])}`);
  if (a.trapScrews.length < tg.traps) problems.push('no trap');
  if (a.decisions < tg.decisions) problems.push(`${a.decisions} decision(s), need ${tg.decisions}`);
  if (a.minMoves < tg.moves[0] || a.minMoves > tg.moves[1]) problems.push(`${a.minMoves} moves (${tg.moves.join('–')})`);
  if (tg.firstDecision && (a.firstDecision === 0 || a.firstDecision > tg.firstDecision)) problems.push(`first decision at tap ${a.firstDecision || '–'} (by ${tg.firstDecision})`);
  const greedy = greedyFailRate(def, GAMES);
  if (greedy < tg.greedyFail) problems.push(`obvious bot fails ${pct(greedy)} (≥ ${pct(tg.greedyFail)})`);
  const screws = def.planks.reduce((n, p) => n + p.screws.length, 0);
  const colors = new Set(def.planks.flatMap((p) => p.screws)).size;
  const layers = new Set(def.planks.map((p) => p.layer)).size;
  if (colors < 2 || colors > 6) problems.push(`${colors} colours`);
  if (layers < 1 || layers > 5) problems.push(`${layers} layers`);
  const mech = mechanicsOf(def);
  for (const m of mech) if (def.id < MECHANIC_INTRO[m]) problems.push(`${m} before level ${MECHANIC_INTRO[m]}`);
  for (const [m, at] of Object.entries(MECHANIC_INTRO)) if (def.id === at && !mech.includes(m as Mechanic)) problems.push(`intro level without ${m}`);
  if (!!def.tutorial !== def.id <= 2) problems.push('tutorial hand only on levels 1-2');
  // the first ten levels must not look alike
  if (def.id <= 10) {
    const pet = petId(petOfLevel(def.id, def.pet));
    if (LEVELS.slice(0, i).some((o) => petId(petOfLevel(o.id, o.pet)) === pet)) problems.push(`pet ${pet} already rescued in levels 1–10`);
    const prev = LEVELS[i - 1];
    if (prev) {
      const styles = (d: LevelDef) => [...new Set(d.planks.map((p) => p.style ?? 0))].sort().join();
      const palette = (d: LevelDef) => [...new Set(d.queue)].sort().join();
      if (prev.object === def.object) problems.push(`same object as level ${prev.id}`);
      if (styles(prev) === styles(def)) problems.push(`same plank looks as level ${prev.id}`);
      if (palette(prev) === palette(def)) problems.push(`same screw colours as level ${prev.id}`);
    }
  }
  if (problems.length) bad++;
  data.push({ id: def.id, tier: tg.tier, fail, moves: a.minMoves, traps: a.trapScrews.length, trapFirst: a.trapFirstMoves, decisions: a.decisions, firstDecision: a.firstDecision, greedy });
  const line = `| ${def.id} | ${TIER_NAME[tg.tier]} | ${def.tray} | ${def.planks.length} | ${screws} | ${colors} | ${layers} | ${mech.join(', ') || '–'} | ${a.minMoves} | ~${Math.round(a.minMoves * SECONDS_PER_MOVE)} s | ${a.trapFirstMoves} | ${a.trapScrews.length} | ${a.decisions} | ${a.firstDecision || '–'} | ${pct(greedy)} | ${pct(fail)} | ${pct(tg.fail[0])}–${pct(tg.fail[1])} | ${a.states} | ${a.ms} | ${problems.join('; ') || 'ok'} |`;
  rows.push(line);
  console.log(line);
});
// averages per tier
const tiers = ['tutorial', 'easy', 'normal', 'hard', 'veryhard'] as const;
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const avgRows = tiers.map((t) => {
  const d = data.filter((r) => r.tier === t);
  return `| ${TIER_NAME[t]} | ${d.length} | ${avg(d.map((r) => r.moves)).toFixed(1)} | ${avg(d.map((r) => r.trapFirst)).toFixed(1)} | ${avg(d.map((r) => r.traps)).toFixed(1)} | ${avg(d.map((r) => r.decisions)).toFixed(1)} | ${avg(d.map((r) => r.firstDecision)).toFixed(1)} | ${pct(avg(d.map((r) => r.greedy)))} | ${pct(avg(d.map((r) => r.fail)))} |`;
});
avgRows.push(`| **All** | ${data.length} | ${avg(data.map((r) => r.moves)).toFixed(1)} | ${avg(data.map((r) => r.trapFirst)).toFixed(1)} | ${avg(data.map((r) => r.traps)).toFixed(1)} | ${avg(data.map((r) => r.decisions)).toFixed(1)} | ${avg(data.map((r) => r.firstDecision)).toFixed(1)} | ${pct(avg(data.map((r) => r.greedy)))} | ${pct(avg(data.map((r) => r.fail)))} |`);
const md = `# Level report

Generated by \`npm run audit\`; CI fails if any level is unsolvable or outside its target. Every level is solved
exhaustively by the solver (depth-first search with state hashing) that knows all the rules.

- **Tier / tray**: 1–2 tutorial, 3–10 easy (5-slot tray), then a sawtooth from 11: four normal levels, a **Hard**
  level every 5th, a **Very hard** level every 10th (3-slot tray). Tray from 11: 4 slots. Two colour boxes are active.
- **Min moves**: taps on the solver's winning line (every screw out; ice takes two taps); **time** at ~2.5 s per move.
- **Trap first moves**: first moves after which the level can no longer be won.
- **Traps**: screws that, at some point on the winning line, are in plain sight with no active box and make the
  level unwinnable if tapped then (they clog the tray). Required from level 3.
- **Decisions**: positions on the winning line where some removable screw wins and another loses.
- **First decision**: the tap on the winning line where the first real decision comes (levels 3–10: by tap 4, so
  you think from the first taps).
- **Obvious bot**: share of ${GAMES} games lost by a bot that always taps a screw that flies straight into its box
  when there is one (levels 3–10: at least 25 %, the obvious tap is often the wrong one).
- **Random fail**: share of ${GAMES} games lost by a bot that taps a random removable screw each time (fixed seed).
  Targets: tutorial 3–35 %, easy (3–10) 60–90 %, normal 70–90 %, Hard 90–98 %, Very hard ≥ 98 %.
- **Variety**: levels 1–10 each free a different pet, and no two in a row share the object, the plank looks or the
  screw colours (levels 3–10 each have their own layout pattern and plank shape).

## Averages

| Tier | Levels | Min moves | Trap first moves | Traps | Decisions | First decision | Obvious bot fail | Random fail |
|---|---|---|---|---|---|---|---|---|
${avgRows.join('\n')}

## Levels

| Level | Tier | Tray | Planks | Screws | Colours | Layers | Mechanics | Min moves | Time | Trap first moves | Traps | Decisions | First decision | Obvious bot fail | Random fail | Target | States | ms | Result |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
${rows.join('\n')}
`;
writeFileSync('docs/levels-report.md', md);
console.log(bad ? `\n${bad} problem(s): see above` : `\nall ${LEVELS.length} levels within their targets (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(bad ? 1 : 0);
