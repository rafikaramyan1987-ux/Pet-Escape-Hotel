// Debug one room: run the careful bot and print what happened (positions every second, every event).
import { Bot } from '../src/core/bot';
import { parseLevel } from '../src/core/level';
import { ROOMS } from '../src/core/rooms';
import { DT, Sim } from '../src/core/sim';

const def = ROOMS.find((r) => r.id === process.argv[2])!;
const sim = new Sim(parseLevel(def));
const bot = new Bot(sim, { noisy: process.argv[3] !== undefined, seed: Number(process.argv[3] ?? 1) });
let last = -1;
while (sim.status === 'play' && sim.t < 200 && !bot.stuck) {
  bot.think();
  const ev = sim.step(DT);
  const sec = Math.floor(sim.t);
  const pos = () => sim.pets.map((p) => `${p.kind[0]}${p.tx},${p.ty}${p.escaped ? 'E' : ''}`).join(' ') + ' | ' + sim.guards.map((g) => `${g.mode}@${g.x.toFixed(1)},${g.y.toFixed(1)}/${Math.round((g.dir * 180) / Math.PI)} m${g.meter.toFixed(2)}`).join(' ');
  if (sec !== last) { last = sec; console.log(sim.t.toFixed(1), pos()); }
  for (const e of ev) if (e.type !== 'step') console.log('  ', sim.t.toFixed(2), JSON.stringify(e), e.type === 'caught' || e.type === 'alert' ? pos() : '');
}
console.log(sim.status, bot.stuck ?? '', 'bones', sim.bones.filter(Boolean).length);
