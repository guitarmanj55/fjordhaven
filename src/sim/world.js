// The world: state, calendar and the fixed-step update. Pure: no DOM, no Math.random.
import { N, STEP, DAY, SCENARIOS, NAMES, BUILDINGS, FOODS, WORK_START, WORK_END } from './data.js';
import { makeRng, rand, randInt } from './rng.js';
import { generate, findHallSpot, prepareStart, idx, V, isWater, inMap } from './map.js';
import { place, finish } from './buildings.js';
import { passable } from './path.js';
import { stepVillager, addVillager, removeVillager, villagerSecond } from './villagers.js';

export function createWorld(scenarioId, seedOverride) {
  const sc = SCENARIOS[scenarioId];
  const seed = (seedOverride ?? sc.seed) || 1;
  const w = {
    schema: 1, scenario: scenarioId, seed, rng: makeRng(seed * 7 + 3),
    time: DAY * 0.1, day: 0, dayStart: sc.startSeason ? sc.seasonDays.slice(0, sc.startSeason).reduce((a, b) => a + b, 0) : 0,
    seasonDays: sc.seasonDays.slice(),
    h: new Float32Array(V * V), type: new Uint8Array(N * N),
    tree: new Uint8Array(N * N), treeGrow: new Float32Array(N * N),
    bush: new Uint8Array(N * N), berries: new Uint8Array(N * N),
    rock: new Uint8Array(N * N), field: new Int32Array(N * N),
    crop: new Uint8Array(N * N), cropGrow: new Float32Array(N * N),
    wear: new Float32Array(N * N), occ: new Int32Array(N * N), reserved: new Int32Array(N * N),
    buildings: [], villagers: [], nextId: 1, nextName: 0,
    stock: { logs: 0, planks: 0, stone: 0, grain: 0, fish: 0, berries: 0, bread: 0, ...sc.stock },
    goals: sc.goals.map(() => false), won: false, lost: false, everBuilt: {},
    made: {}, winters: 0, lastShip: -9, ship: null, happiness: 50, peakPop: 0,
    log: [], events: [], terrainVer: 1, treeVer: 1, acc: 0, secAcc: 0, landing: -1,
  };
  w.msg = (text, kind = 'info') => { w.log.push({ t: w.time, text, kind }); w.events.push({ e: 'msg', text, kind }); };
  generate(w);
  const spot = findHallSpot(w);
  const hx = spot.x + 0.5, hz = spot.z;
  prepareStart(w, hx, hz);
  const hall = place(w, 'hall', hx, hz, -Math.PI / 2, { free: true, built: true });
  if (!hall) throw new Error('could not place the hall');
  w.hall = hall.id;
  w.landing = findLanding(w, hall.door);
  w.rng.s = (seed * 2654435761) >>> 0;
  const r = makeRng(seed + 99);
  for (let k = 0; k < sc.villagers; k++) {
    const dx = (hall.door % N) + 0.5, dz = ((hall.door / N) | 0) + 0.5;
    const v = addVillager(w, dx - 1 + rand(r) * 1.4, dz - 1.5 + rand(r) * 3);
    v.hunger = 70 + rand(r) * 25;
  }
  for (let k = 0; k < 40; k++) { const i = randInt(w.rng, N * N); if (w.bush[i]) w.berries[i] = 2; }
  if (calendar(w).season === 1 || calendar(w).season === 2) for (let i = 0; i < N * N; i++) if (w.bush[i]) w.berries[i] = 3;
  w.events.length = 0;
  w.msg('Your longship has landed. Build cottages before the nights grow cold.');
  return w;
}

// The land tile by the water nearest the hall door, where longships put in.
function findLanding(w, from) {
  const fx = from % N, fz = (from / N) | 0;
  let best = -1, bd = 1e9;
  for (let i = 0; i < N * N; i++) {
    if (!passable(w, i)) continue;
    const x = i % N, z = (i / N) | 0;
    let wet = false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inMap(x + dx, z + dz) && isWater(w.type[idx(x + dx, z + dz)])) wet = true;
    if (!wet) continue;
    const d = Math.hypot(x - fx, z - fz);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

export function calendar(w) {
  const total = w.dayStart + w.day, sd = w.seasonDays, yearLen = sd[0] + sd[1] + sd[2] + sd[3];
  const year = Math.floor(total / yearLen) + 1;
  let d = total % yearLen, season = 0;
  while (d >= sd[season]) { d -= sd[season]; season++; }
  const frac = (w.time % DAY) / DAY;
  return { year, season, dayOfSeason: d, seasonLen: sd[season], frac, night: frac < WORK_START || frac >= WORK_END };
}

// 0..1 snow cover: settles over the first day of winter, melts over the first day and a half of spring.
export function snowCover(w) {
  const c = calendar(w), t = c.dayOfSeason + c.frac;
  if (c.season === 3) return Math.min(1, t);
  if (c.season === 0) return c.year === 1 ? 0 : Math.max(0, 1 - t / 1.5);
  return 0;
}

export const pop = w => w.villagers.length;
export const beds = w => w.buildings.reduce((n, b) => n + (b.built && BUILDINGS[b.kind].beds || 0), 0);
export const foodTotal = w => Object.keys(FOODS).reduce((n, k) => n + w.stock[k], 0);
export const residentsOf = (w, bd) => w.villagers.filter(v => v.home === bd.id);
export const workersOf = (w, bd) => w.villagers.filter(v => v.job === bd.id);

export function step(w) {
  w.time += STEP;
  const nd = Math.floor(w.time / DAY);
  if (nd !== w.day) { w.day = nd; w.cal = calendar(w); dawn(w); }
  w.cal = calendar(w);
  for (const v of w.villagers.slice()) stepVillager(w, v, STEP);
  if (w.ship) stepShip(w);
  w.secAcc += STEP;
  if (w.secAcc >= 1) { w.secAcc -= 1; everySecond(w); }
}

function everySecond(w) {
  for (let i = 0; i < N * N; i++) if (w.wear[i] > 0) w.wear[i] = w.wear[i] < 0.002 ? 0 : w.wear[i] * 0.9985;
  assignJobs(w);
  assignHomes(w);
  const c = calendar(w);
  w.snowNow = snowCover(w);
  for (const v of w.villagers.slice()) {
    villagerSecond(w, v, c);
    if (v.leaving) { v.job = 0; v.home = 0; }
  }
  // crops grow through spring to autumn
  if (c.season < 3) for (const b of w.buildings) for (const i of b.fields) if (w.crop[i] === 1) {
    w.cropGrow[i] += 1 / (DAY * 5.5);
    if (w.cropGrow[i] >= 1) { w.cropGrow[i] = 1; w.crop[i] = 2; w.treeVer++; }
  }
  let joy = 0;
  for (const v of w.villagers) joy += v.joy;
  w.happiness = w.villagers.length ? joy / w.villagers.length : 0;
  w.peakPop = Math.max(w.peakPop, w.villagers.length);
  checkGoals(w);
  if (!w.villagers.length && !w.lost) { w.lost = true; w.events.push({ e: 'lost' }); }
}

function dawn(w) {
  const c = calendar(w);
  const rngTree = w.rng;
  // winter heating: every lived-in cottage (and the hall if anyone sleeps there) burns a log
  let cold = 0;
  for (const b of w.buildings) {
    if (!b.built) continue;
    const lived = w.villagers.some(v => v.home === b.id) || (b.kind === 'hall' && w.villagers.some(v => !v.home));
    if (c.season !== 3 || !lived) { b.heated = true; continue; }
    if (w.stock.logs >= 1) { w.stock.logs -= 1; b.heated = true; }
    else { b.heated = false; cold++; }
  }
  if (cold) w.msg(`${cold === 1 ? 'A home is' : cold + ' homes are'} cold: no logs to burn!`, 'warn');
  // season starts
  if (c.dayOfSeason === 0) {
    if (c.season === 3) {
      for (const b of w.buildings) for (const i of b.fields) { w.crop[i] = 0; w.cropGrow[i] = 0; }
      for (let i = 0; i < N * N; i++) w.berries[i] = 0;
      w.treeVer++;
      w.msg('Winter has come. Homes burn a log a day; keep the woodpile high.', 'season');
    } else if (c.season === 0) {
      if (w.day > 0) { w.winters++; w.msg(`Spring returns, and the herring run up the fjord. The village saw out winter ${w.winters}.`, 'season'); }
    } else if (c.season === 1) w.msg('Summer: the berry bushes are ripening.', 'season');
    else if (c.season === 2) w.msg('Autumn. Gather and bake while you can.', 'season');
  }
  // berries refill through summer and autumn
  if (c.season === 1 || c.season === 2) {
    const full = c.season === 1 && c.dayOfSeason === 0;
    for (let i = 0; i < N * N; i++) if (w.bush[i]) w.berries[i] = full ? 4 : Math.min(5, w.berries[i] + 2);
    w.treeVer++;
  }
  // forest spreads into quiet ground and saplings grow
  if (c.season !== 3) {
    for (let i = 0; i < N * N; i++) if (w.tree[i] && w.treeGrow[i] < 1) w.treeGrow[i] = Math.min(1, w.treeGrow[i] + 1 / 7);
    for (let k = 0; k < 90; k++) {
      const i = randInt(rngTree, N * N);
      if (w.type[i] !== 3 || w.tree[i] || w.bush[i] || w.rock[i] || w.occ[i] || w.field[i] || w.wear[i] > 0.05 || i === w.landing) continue;
      if (w.buildings.some(b => b.door === i)) continue;
      const x = i % N, z = (i / N) | 0;
      let nb = 0, kind = 1;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!inMap(x + dx, z + dz)) continue;
        const j = idx(x + dx, z + dz);
        if (w.tree[j] && w.treeGrow[j] >= 1) { nb++; kind = w.tree[j]; }
      }
      if (nb >= 2) { w.tree[i] = kind; w.treeGrow[i] = 0.05; }
    }
    w.treeVer++;
  }
  // a longship brings settlers when there are free beds and people are content
  const free = beds(w) - w.villagers.length;
  if (!w.ship && free > 0 && w.day - w.lastShip >= 2 && w.happiness >= 52 && c.season !== 3 && w.landing >= 0) {
    const n = Math.min(free, 2 + randInt(w.rng, 2));
    w.ship = { t: 0, n, landed: false };
    w.lastShip = w.day;
    w.events.push({ e: 'ship' });
    w.msg(`A longship is sailing up the fjord with ${n} settlers.`, 'good');
  }
}

export const SHIP_IN = 9, SHIP_STAY = 4;
function stepShip(w) {
  const s = w.ship;
  s.t += STEP;
  if (!s.landed && s.t >= SHIP_IN) {
    s.landed = true;
    const lx = (w.landing % N) + 0.5, lz = ((w.landing / N) | 0) + 0.5;
    const names = [];
    for (let k = 0; k < s.n; k++) { const v = addVillager(w, lx, lz); v.hunger = 80; names.push(v.name); }
    w.msg(`${names.join(', ').replace(/, ([^,]*)$/, ' and $1')} stepped ashore.`, 'good');
    w.events.push({ e: 'landed' });
  }
  if (s.t >= SHIP_IN * 2 + SHIP_STAY) w.ship = null;
}

// Idle villagers take open jobs, nearest first; extra workers beyond a building's wanted count are let go.
function assignJobs(w) {
  for (const b of w.buildings) {
    if (!b.built || !BUILDINGS[b.kind].workers) continue;
    const ws = workersOf(w, b);
    for (let k = ws.length - 1; k >= b.want && k >= 0; k--) { const v = ws[k]; v.job = 0; dropPlan(w, v); }
    let need = b.want - Math.min(ws.length, b.want);
    while (need-- > 0) {
      let best = null, bd = 1e9;
      for (const v of w.villagers) {
        if (v.job || v.leaving) continue;
        const d = Math.hypot(v.x - b.x, v.z - b.z);
        if (d < bd) { bd = d; best = v; }
      }
      if (!best) return;
      best.job = b.id; dropPlan(w, best, true);
    }
  }
}

function assignHomes(w) {
  const homeless = w.villagers.filter(v => !v.home && !v.leaving);
  if (!homeless.length) return;
  for (const b of w.buildings) {
    if (!b.built || !BUILDINGS[b.kind].beds) continue;
    let space = BUILDINGS[b.kind].beds - residentsOf(w, b).length;
    while (space-- > 0 && homeless.length) {
      homeless.sort((a, c) => Math.hypot(c.x - b.x, c.z - b.z) - Math.hypot(a.x - b.x, a.z - b.z));
      const v = homeless.pop();
      v.home = b.id;
      if (v.inside) dropPlan(w, v);
    }
  }
}

export function dropPlan(w, v, keepCarry = false) {
  if (v.inside) {
    const b = w.buildings.find(x => x.id === v.at);
    if (b) { v.x = (b.door % N) + 0.5; v.z = ((b.door / N) | 0) + 0.5; }
    v.inside = false;
  }
  v.plan = []; v.path = null; v.at = 0; v.site = 0;
  if (v.res >= 0 && w.reserved[v.res] === v.id) w.reserved[v.res] = 0;
  v.res = -1;
  if (!keepCarry && v.carry) { w.stock[v.carry.k] += v.carry.n; v.carry = null; }
}

function checkGoals(w) {
  const sc = SCENARIOS[w.scenario];
  sc.goals.forEach((g, k) => {
    if (w.goals[k]) return;
    let done = false;
    if (g.type === 'pop') done = w.villagers.length >= g.n;
    else if (g.type === 'survive') done = w.winters >= g.n && w.villagers.length > 0;
    else if (g.type === 'built') done = !!w.everBuilt[g.kind];
    else if (g.type === 'happy') done = w.villagers.length >= 8 && w.happiness >= g.n;
    else if (g.type === 'food') done = foodTotal(w) >= g.n;
    if (done) { w.goals[k] = true; w.msg(`Goal reached: ${g.text}.`, 'goal'); w.events.push({ e: 'goal', k }); }
  });
  if (sc.goals.length && !w.won && w.goals.every(Boolean)) { w.won = true; w.events.push({ e: 'won' }); }
}

export { finish, removeVillager };
