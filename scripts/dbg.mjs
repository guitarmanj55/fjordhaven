// Debug trace: per-day dump of stock, buildings and villagers under the bot. node scripts/dbg.mjs [days]
import { createWorld, step, workersOf } from '../src/sim/world.js';
import { DAY, STEP } from '../src/sim/data.js';
import { botTick } from '../test/bot.js';
const w = createWorld(process.argv[3] || 'first');
const st = { i: 0 };
const days = +(process.argv[2] || 8);
for (let s = 0; s < (DAY * days) / STEP; s++) {
  step(w); if (s % 30 === 0) botTick(w, st); w.events.length = 0;
  if (s % Math.round(DAY / STEP) === Math.round(DAY / STEP / 2)) {
    console.log('day', w.day, JSON.stringify(w.stock));
    for (const b of w.buildings) console.log('  ', b.kind, b.built ? 'built' : 'site ' + b.progress.toFixed(0), 'workers', workersOf(w, b).map(v => v.name).join(','), b.note);
    for (const v of w.villagers) console.log('    ', v.name, v.kind, v.plan.map(a => a.a + (a.f || a.anim || '')).join('>'), 'job', v.job, 'h', v.hunger.toFixed(0), 'joy', v.joy.toFixed(0), v.think, v.leaving);
  }
}
