/**
 * Generate levels (seeded, solver-verified, in their target bands) into src/puzzle/levels.json.
 *   npm run levels            → all 60 levels
 *   npm run levels -- 11 30   → only those (merged into the existing file)
 *   npm run levels -- 11 30 part.json → into another file (parallel runs), merge with `npm run levels -- merge part1.json …`
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { center, generateLevel, rejects } from '../src/puzzle/generate';
import type { LevelDef } from '../src/puzzle/model';

const MAIN = 'src/puzzle/levels.json';
const read = (f: string): LevelDef[] => (existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as LevelDef[]) : []);
const save = (f: string, levels: LevelDef[]) => writeFileSync(f, JSON.stringify(levels, null, 0).replace(/\},\{"id"/g, '},\n{"id"') + '\n');
if (process.argv[2] === 'merge') {
  const all = read(MAIN);
  for (const f of process.argv.slice(3)) for (const l of read(f)) {
    const i = all.findIndex((x) => x.id === l.id);
    if (i >= 0) all[i] = l;
    else all.push(l);
  }
  all.sort((a, b) => a.id - b.id);
  for (const l of all) center(l.planks);
  save(MAIN, all);
  console.log('merged', all.length, 'levels');
  process.exit(0);
}
const from = Number(process.argv[2] ?? 1);
const to = Number(process.argv[3] ?? 60);
const file = process.argv[4] ?? MAIN;
const all = read(file);
for (let n = from; n <= to; n++) {
  const t0 = Date.now();
  const g = generateLevel(n);
  const i = all.findIndex((l) => l.id === n);
  if (i >= 0) all[i] = g.def;
  else all.push(g.def);
  all.sort((a, b) => a.id - b.id);
  save(file, all);
  const s = g.def.planks.reduce((a, p) => a + p.screws.length, 0);
  console.log(`level ${n}: ${g.def.planks.length} planks, ${s} screws, ${new Set(g.def.planks.flatMap((p) => p.screws)).size} colours, tray ${g.def.tray}, random-fail ${(g.failRate * 100).toFixed(1)}%, ${g.tries} tries, ${Date.now() - t0} ms`);
}
console.log('rejects', JSON.stringify(rejects));
