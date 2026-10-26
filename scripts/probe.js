// Balance probe: runs the scripted bot through a scenario and prints a line per season.
// node scripts/probe.js [scenario] [years] [seed]
import { createWorld, step, calendar, pop, beds, foodTotal } from '../src/sim/world.js';
import { DAY, STEP, SEASON_NAMES, N } from '../src/sim/data.js';
import { botTick } from '../test/bot.js';

const [sc = 'first', years = '3', seed] = process.argv.slice(2);
const w = createWorld(sc, seed ? +seed : undefined);
const st = { i: 0 };
const t0 = Date.now();
let lastSeason = -1;
const steps = Math.round((+years * w.seasonDays.reduce((a, b) => a + b) * DAY) / STEP);
for (let s = 0; s < steps && !w.lost; s++) {
  step(w);
  if (s % 30 === 0) botTick(w, st);
  w.events.length = 0;
  const c = calendar(w);
  if (c.season !== lastSeason) {
    lastSeason = c.season;
    let worn = 0, road = 0;
    for (let i = 0; i < N * N; i++) { if (w.wear[i] > 0.25) worn++; if (w.wear[i] > 0.7) road++; }
    console.log(`Y${c.year} ${SEASON_NAMES[c.season].padEnd(6)} pop ${String(pop(w)).padStart(2)}/${beds(w)} happy ${w.happiness.toFixed(0)} food ${foodTotal(w)} logs ${w.stock.logs} planks ${w.stock.planks} stone ${w.stock.stone} grain ${w.stock.grain} bread ${w.stock.bread} | built ${w.buildings.length} trails ${worn} roads ${road} goals ${w.goals.map(g => (g ? 'x' : '.')).join('')} made ${JSON.stringify(w.made)}`); w.made = {};
  }
}
for (const l of w.log.filter(l => l.kind === 'bad' || l.kind === 'warn').slice(-8)) console.log('  ', l.text);
console.log(`done in ${Date.now() - t0} ms, won=${w.won} lost=${w.lost}`);
