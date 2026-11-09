/** Generate levels 6–100 (seeded, solver-verified) into src/puzzle/levels.json. Levels 1–5 are hand-made. */
import { writeFileSync } from 'node:fs';
import { generateLevel } from '../src/puzzle/generate';

const from = Number(process.argv[2] ?? 6);
const to = Number(process.argv[3] ?? 100);
const out: unknown[] = [];
for (let n = from; n <= to; n++) {
  const t0 = Date.now();
  const g = generateLevel(n);
  out.push(g.def);
  const s = g.def.planks.reduce((a, p) => a + p.screws.length, 0);
  console.log(`level ${n}: ${g.def.planks.length} planks, ${s} screws, ${new Set(g.def.planks.flatMap((p) => p.screws)).size} colours, margin ${g.margin}, random-fail ${(g.failRate * 100).toFixed(0)}%, ${g.tries} tries, ${Date.now() - t0} ms`);
}
if (from === 6 && to === 100) writeFileSync('src/puzzle/levels.json', JSON.stringify(out, null, 0).replace(/\},\{"id"/g, '},\n{"id"') + '\n');
