// Villagers: needs, a small plan of actions, and the choice of what to do next.
// Plans hold only plain data (no functions) so a saved game restores mid-task.
import { N, DAY, BUILDINGS, FOODS, NAMES, WALK, HUNGER_DAYS, EAT_BELOW, T } from './data.js';
import { idx, inMap, isWater } from './map.js';
import { findPath, passable, speedOn } from './path.js';
import { finish, byId } from './buildings.js';
import { hash01, rand } from './rng.js';
import { calendar, foodTotal, dropPlan } from './world.js';

const tileOf = v => Math.floor(v.z) * N + Math.floor(v.x);
const cx = i => (i % N) + 0.5, cz = i => ((i / N) | 0) + 0.5;

export function addVillager(w, x, z) {
  const id = w.nextId++, k = w.nextName++;
  const v = {
    id, name: NAMES[k % NAMES.length] + (k >= NAMES.length ? ' the Younger' : ''),
    x, z, px: x, pz: z, dir: 0, ox: (hash01(id, 1) - 0.5) * 0.44, oz: (hash01(id, 2) - 0.5) * 0.44,
    look: Math.floor(hash01(id, 3) * 1e6),
    home: 0, job: 0, site: 0, at: 0, inside: false, sleeping: false,
    plan: [], kind: '', path: null, pi: 0, carry: null, res: -1,
    hunger: 80, warmth: 100, joy: 55, meals: [], starve: 0, coldT: 0, sadT: 0,
    anim: 'idle', think: 'Glad to be on dry land.', leaving: '',
  };
  w.villagers.push(v);
  w.events.push({ e: 'spawn', id });
  return v;
}

export function removeVillager(w, v) {
  dropPlan(w, v);
  w.villagers.splice(w.villagers.indexOf(v), 1);
  w.events.push({ e: 'gone', id: v.id });
}

const nearestStore = (w, x, z) => {
  let best = null, bd = 1e9;
  for (const b of w.buildings) {
    if (!b.built || !BUILDINGS[b.kind].storage) continue;
    const d = Math.hypot(cx(b.door) - x, cz(b.door) - z);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
};

const homeOf = (w, v) => (v.home && byId(w, v.home)) || byId(w, w.hall);

export function stepVillager(w, v, dt) {
  v.px = v.x; v.pz = v.z;
  // needs
  v.hunger = Math.max(0, v.hunger - (dt * 100) / (HUNGER_DAYS * DAY) * (v.sleeping ? 0.6 : 1));
  v.starve = v.hunger <= 0 ? v.starve + dt : 0;
  const c = w.cal || calendar(w);
  const shelter = homeOf(w, v);
  if (c.season === 3 && !(shelter && shelter.heated)) v.warmth = Math.max(0, v.warmth - (dt * 100) / (2.5 * DAY));
  else if (c.season === 3 && !v.inside) v.warmth = Math.max(0, Math.min(100, v.warmth - (dt * 100) / (6 * DAY)));
  else v.warmth = Math.min(100, v.warmth + (dt * 100) / (0.4 * DAY));
  v.coldT = v.warmth <= 0 ? v.coldT + dt : 0;

  if (!v.plan.length) decide(w, v, c);
  const a = v.plan[0];
  if (!a) return;
  v.anim = a.a === 'wait' ? a.anim : a.a === 'go' ? 'walk' : v.anim;
  switch (a.a) {
    case 'go': walk(w, v, a, dt); break;
    case 'wait': a.t -= dt; if (a.t <= 0) next(w, v); break;
    case 'do': if (DO[a.f](w, v, a) === false) dropPlan(w, v, true); else next(w, v); break;
    case 'enter': {
      const b = byId(w, a.b);
      if (!b) { dropPlan(w, v, true); break; }
      v.inside = true; v.at = b.id; next(w, v); break;
    }
    case 'exit': v.inside = false; v.at = 0; v.sleeping = false; next(w, v); break;
    case 'sleep':
      v.sleeping = true; v.anim = 'sleep';
      if (!c.night) { v.sleeping = false; next(w, v); }
      break;
  }
}

function next(w, v) {
  v.plan.shift();
  if (!v.plan.length) return;
  const c = w.cal || calendar(w);
  // at the end of each step, night and hunger can break into a plan (a carried load is kept)
  if (v.kind !== 'bed' && v.kind !== 'leave' && v.kind !== 'deposit' && !v.inside) {
    if (c.night || (v.hunger < 22 && v.kind !== 'eat' && foodTotal(w) > 0)) dropPlan(w, v, true);
  }
}

function walk(w, v, a, dt) {
  const here = tileOf(v);
  if (!v.path) {
    if (here === a.t && !a.near) { next(w, v); return; }
    v.path = findPath(w, here, a.t);
    v.pi = 0;
    if (!v.path) {
      if (v.leaving) { removeVillager(w, v); return; }
      v.think = "I can't find a way there.";
      dropPlan(w, v, true);
      v.plan = [{ a: 'wait', t: 2, anim: 'idle' }]; v.kind = 'idle';
      return;
    }
  }
  if (v.pi >= v.path.length) { v.path = null; next(w, v); return; }
  const ti = v.path[v.pi];
  if (ti !== a.t && !passable(w, ti) && passable(w, here)) { v.path = null; return; }
  const last = v.pi === v.path.length - 1;
  const tx = cx(ti) + (last ? v.ox * 0.5 : v.ox), tz = cz(ti) + (last ? v.oz * 0.5 : v.oz);
  const dx = tx - v.x, dz = tz - v.z, d = Math.hypot(dx, dz);
  const sp = WALK * speedOn(w, here) * (1 - 0.18 * (w.snowNow || 0)) * dt;
  if (d <= sp) {
    v.x = tx; v.z = tz; v.pi++;
    if (!w.occ[ti] && w.type[ti] !== T.ROCKY) w.wear[ti] = Math.min(1.5, w.wear[ti] + 0.045);
  } else {
    v.x += (dx / d) * sp; v.z += (dz / d) * sp;
    v.dir = Math.atan2(dx, dz);
  }
}

// ---- deciding ----

const go = t => ({ a: 'go', t });
const wait = (t, anim = 'idle') => ({ a: 'wait', t, anim });
const doF = (f, extra = {}) => ({ a: 'do', f, ...extra });

function setPlan(v, kind, plan, think) {
  v.kind = kind; v.plan = plan;
  if (think) v.think = think;
}

function decide(w, v, c) {
  if (v.inside) { setPlan(v, 'exit', [{ a: 'exit' }]); return; }
  if (v.leaving) {
    if (w.landing < 0) { removeVillager(w, v); return; }
    setPlan(v, 'leave', [go(w.landing), doF('depart')]);
    return;
  }
  if (c.night) {
    const h = homeOf(w, v);
    if (v.carry) { const st = nearestStore(w, v.x, v.z); if (st) { setPlan(v, 'deposit', [go(st.door), doF('deposit')]); return; } }
    setPlan(v, 'bed', [go(h.door), { a: 'enter', b: h.id }, { a: 'sleep' }, { a: 'exit' }],
      v.home ? 'Home to bed.' : 'No bed of my own, so the hall floor again.');
    return;
  }
  if (v.carry) {
    const st = nearestStore(w, v.x, v.z);
    if (st) { setPlan(v, 'deposit', [go(st.door), doF('deposit')]); return; }
  }
  if (v.hunger < EAT_BELOW && foodTotal(w) > 0) {
    const st = nearestStore(w, v.x, v.z);
    if (st) { setPlan(v, 'eat', [go(st.door), doF('eat')], 'Time for something to eat.'); return; }
  }
  const job = v.job && byId(w, v.job);
  if (job && job.built && workPlan(w, v, job, c)) return;
  if (buildPlan(w, v)) return;
  if (job && job.built) { setPlan(v, 'idle', [go(job.door), wait(4 + rand(w.rng) * 3)]); return; }
  // wander near the hall or home
  const base = homeOf(w, v), bx = Math.floor(cx(base.door)), bz = Math.floor(cz(base.door));
  for (let k = 0; k < 8; k++) {
    const x = bx + Math.floor(rand(w.rng) * 9) - 4, z = bz + Math.floor(rand(w.rng) * 9) - 4;
    if (inMap(x, z) && passable(w, idx(x, z))) {
      setPlan(v, 'idle', [go(idx(x, z)), wait(3 + rand(w.rng) * 4)], v.job ? v.think : pickIdleThought(w, v));
      return;
    }
  }
  setPlan(v, 'idle', [wait(3)]);
}

const IDLE = ['Nothing to do. Build something and I will lend a hand.', 'Watching the gulls over the fjord.', 'Smells like rain.', 'I could carve something, if there were work.'];
const pickIdleThought = (w, v) => IDLE[(v.id + Math.floor(w.time / 30)) % IDLE.length];

function reserve(w, v, i) { v.res = i; w.reserved[i] = v.id; }
const free = (w, v, i) => !w.reserved[i] || w.reserved[i] === v.id;

// Nearest tile within the building's reach that passes test(i).
function findNear(w, v, b, r, test) {
  const bx = b.x, bz = b.z;
  let best = -1, bd = 1e9;
  for (let z = Math.max(0, Math.floor(bz - r)); z <= Math.min(N - 1, bz + r); z++)
    for (let x = Math.max(0, Math.floor(bx - r)); x <= Math.min(N - 1, bx + r); x++) {
      const d = Math.hypot(x + 0.5 - bx, z + 0.5 - bz);
      if (d > r) continue;
      const i = z * N + x;
      if (!free(w, v, i) || !test(i)) continue;
      const score = d + hash01(i, v.id) * 1.5;
      if (score < bd) { bd = score; best = i; }
    }
  return best;
}

export function targetsInReach(w, kind, x, z) {
  const B = BUILDINGS[kind], r = B.radius;
  if (!r || !B.target) return null;
  let n = 0;
  for (let tz = Math.max(0, Math.floor(z - r)); tz <= Math.min(N - 1, z + r); tz++)
    for (let tx = Math.max(0, Math.floor(x - r)); tx <= Math.min(N - 1, x + r); tx++) {
      if (Math.hypot(tx + 0.5 - x, tz + 0.5 - z) > r) continue;
      const i = tz * N + tx;
      if (B.target === 'tree' && w.tree[i] && w.treeGrow[i] >= 1) n++;
      else if (B.target === 'bush' && w.bush[i]) n++;
      else if (B.target === 'rock' && w.rock[i]) n++;
      else if (B.target === 'shore' && isShore(w, i)) n++;
    }
  return { n, what: { tree: 'grown trees', bush: 'berry bushes', rock: 'boulders', shore: 'fishing spots' }[B.target] };
}

function isShore(w, i) {
  if (!passable(w, i)) return false;
  const x = i % N, z = (i / N) | 0;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inMap(x + dx, z + dz) && isWater(w.type[idx(x + dx, z + dz)])) return true;
  return false;
}

function workPlan(w, v, b, c) {
  const B = BUILDINGS[b.kind];
  const deliver = (from) => { const st = nearestStore(w, cx(from), cz(from)); return st ? [go(st.door), doF('deposit')] : []; };
  if (b.kind === 'woodcutter') {
    const i = findNear(w, v, b, B.radius, i => w.tree[i] && w.treeGrow[i] >= 1);
    if (i < 0) { b.note = 'No grown trees in reach'; v.think = 'All the big trees near me are gone.'; return false; }
    reserve(w, v, i); b.note = '';
    setPlan(v, 'work', [go(i), wait(4, 'chop'), doF('fell', { i }), ...deliver(i)], 'Off to fell a tree.');
    return true;
  }
  if (b.kind === 'forager') {
    if (c.season === 0 || c.season === 3) { b.note = 'No berries until summer'; v.think = 'Nothing to pick until summer.'; return false; }
    const i = findNear(w, v, b, B.radius, i => w.bush[i] && w.berries[i] > 0);
    if (i < 0) { b.note = 'Bushes picked clean for today'; v.think = 'The bushes are bare for today.'; return false; }
    reserve(w, v, i); b.note = '';
    setPlan(v, 'work', [go(i), wait(3, 'pick'), doF('pick', { i }), ...deliver(i)], 'Picking berries.');
    return true;
  }
  if (b.kind === 'quarry') {
    const i = findNear(w, v, b, B.radius, i => w.rock[i] > 0);
    if (i < 0) { b.note = 'No boulders in reach'; v.think = 'No stone left to break here.'; return false; }
    reserve(w, v, i); b.note = '';
    setPlan(v, 'work', [{ a: 'go', t: i, near: true }, wait(6, 'mine'), doF('mine', { i }), ...deliver(b.door)], 'Breaking stone.');
    return true;
  }
  if (b.kind === 'fisher') {
    const i = findNear(w, v, b, B.radius, i => isShore(w, i) && !w.occ[i]);
    if (i < 0) { b.note = 'No shore in reach'; return false; }
    reserve(w, v, i); b.note = c.season === 3 ? 'Fishing through the ice' : '';
    setPlan(v, 'work', [go(i), wait(c.season === 3 ? 10 : 5, 'fish'), doF('fish', { i }), ...deliver(i)], c.season === 3 ? 'Cold work, ice fishing.' : 'Going fishing.');
    return true;
  }
  if (b.kind === 'farm') {
    const sow = c.season <= 1 ? b.fields.find(i => w.crop[i] === 0 && free(w, v, i)) : undefined;
    const reap = b.fields.find(i => w.crop[i] === 2 && free(w, v, i));
    const i = reap ?? sow;
    if (i === undefined) {
      b.note = c.season === 3 ? 'Fields lie under snow' : b.fields.some(f => w.crop[f] === 1) ? 'Crops are growing' : 'Too late to sow this year';
      return false;
    }
    reserve(w, v, i); b.note = '';
    if (reap !== undefined) setPlan(v, 'work', [go(i), wait(3, 'reap'), doF('reap', { i }), ...deliver(i)], 'Bringing in the harvest.');
    else setPlan(v, 'work', [go(i), wait(3, 'sow'), doF('sow', { i })], 'Sowing barley.');
    return true;
  }
  if (B.craft) {
    const [k, n] = Object.entries(B.craft.from)[0];
    // the sawmill leaves logs for the fires: more as winter nears
    const keep = k === 'logs' ? firewoodReserve(w, c) : 0;
    if (w.stock[k] < n + keep) {
      b.note = keep && w.stock[k] >= n ? `Keeping ${keep} logs for firewood` : `Waiting for ${k}`;
      v.think = keep && w.stock[k] >= n ? 'Those logs are for the fires.' : `No ${k} in store to work with.`;
      return false;
    }
    const st = nearestStore(w, b.x, b.z);
    if (!st) return false;
    b.note = '';
    setPlan(v, 'work', [go(st.door), doF('take'), go(b.door), { a: 'enter', b: b.id }, wait(B.craft.time, 'craft'), doF('craft'), { a: 'exit' }, ...deliver(b.door)],
      b.kind === 'sawmill' ? 'Sawing planks.' : 'Baking bread.');
    return true;
  }
  return false;
}

export function firewoodReserve(w, c) {
  const homes = w.buildings.filter(b => b.built && (BUILDINGS[b.kind].beds || b.kind === 'hall')).length;
  return c.season === 3 ? homes * 2 : c.season === 2 ? homes * 3 : 4;
}

function buildPlan(w, v) {
  let best = null, bd = 1e9;
  for (const b of w.buildings) {
    if (b.built) continue;
    const n = w.villagers.filter(u => u.site === b.id).length;
    if (n >= 3 && v.site !== b.id) continue;
    const d = Math.hypot(b.x - v.x, b.z - v.z) + n * 3;
    if (d < bd) { bd = d; best = b; }
  }
  if (!best) return false;
  v.site = best.id;
  setPlan(v, 'build', [go(best.door), wait(3, 'build'), doF('build', { b: best.id })], `Building the ${BUILDINGS[best.kind].name.toLowerCase()}.`);
  return true;
}

// ---- actions ----

const unreserve = (w, v) => { if (v.res >= 0 && w.reserved[v.res] === v.id) w.reserved[v.res] = 0; v.res = -1; };

const DO = {
  fell(w, v, a) {
    unreserve(w, v);
    if (!w.tree[a.i] || w.treeGrow[a.i] < 1) return false;
    w.tree[a.i] = 0; w.treeGrow[a.i] = 0; w.treeVer++;
    v.carry = { k: 'logs', n: 3 };
    w.events.push({ e: 'fell', i: a.i });
  },
  pick(w, v, a) {
    unreserve(w, v);
    const n = Math.min(4, w.berries[a.i]);
    if (!n) return false;
    w.berries[a.i] -= n; w.treeVer++;
    v.carry = { k: 'berries', n };
  },
  mine(w, v, a) {
    unreserve(w, v);
    if (!w.rock[a.i]) return false;
    const n = Math.min(2, w.rock[a.i]);
    w.rock[a.i] -= n;
    if (!w.rock[a.i]) w.treeVer++;
    v.carry = { k: 'stone', n };
  },
  fish(w, v) { unreserve(w, v); v.carry = { k: 'fish', n: [5, 4, 4, 3][(w.cal || calendar(w)).season] }; },
  sow(w, v, a) {
    unreserve(w, v);
    if (!w.field[a.i] || w.crop[a.i] !== 0) return false;
    w.crop[a.i] = 1; w.cropGrow[a.i] = 0; w.treeVer++;
  },
  reap(w, v, a) {
    unreserve(w, v);
    if (!w.field[a.i] || w.crop[a.i] !== 2) return false;
    w.crop[a.i] = 0; w.cropGrow[a.i] = 0; w.treeVer++;
    v.carry = { k: 'grain', n: 4 };
  },
  take(w, v) {
    const b = byId(w, v.job);
    if (!b) return false;
    const [k, n] = Object.entries(BUILDINGS[b.kind].craft.from)[0];
    if (w.stock[k] < n) return false;
    w.stock[k] -= n; v.carry = { k, n };
  },
  craft(w, v) {
    const b = byId(w, v.job);
    if (!b || !v.carry) return false;
    const [k, n] = Object.entries(BUILDINGS[b.kind].craft.to)[0];
    v.carry = { k, n }; b.busy = w.time;
    w.events.push({ e: 'craft', id: b.id });
  },
  deposit(w, v) {
    if (v.carry) {
      w.stock[v.carry.k] += v.carry.n;
      w.made[v.carry.k] = (w.made[v.carry.k] || 0) + v.carry.n;
      w.events.push({ e: 'deposit', k: v.carry.k, n: v.carry.n, x: v.x, z: v.z });
      v.carry = null;
    }
  },
  eat(w, v) {
    const have = Object.keys(FOODS).filter(k => w.stock[k] > 0);
    if (!have.length) { v.think = 'The stores are empty!'; return; }
    const fresh = have.filter(k => !v.meals.slice(-2).includes(k));
    const pool = fresh.length ? fresh : have;
    const k = pool.reduce((a, b) => (w.stock[b] > w.stock[a] ? b : a));
    w.stock[k]--;
    v.hunger = Math.min(100, v.hunger + FOODS[k]);
    v.meals.push(k); if (v.meals.length > 4) v.meals.shift();
    v.think = { fish: 'Fresh fish. Lovely.', berries: 'Sweet berries!', bread: 'Warm bread, the best.' }[k];
  },
  build(w, v, a) {
    const b = byId(w, a.b);
    v.site = 0;
    if (!b || b.built) return;
    b.progress += 3;
    w.events.push({ e: 'hammer', id: b.id });
    if (b.progress >= BUILDINGS[b.kind].build) finish(w, b);
  },
  depart(w, v) { removeVillager(w, v); },
};

// Once a second: happiness, and whether anyone has had enough.
export function villagerSecond(w, v, c) {
  if (v.leaving) return;
  let target = 50;
  target += v.home ? 12 : -18;
  target += v.hunger > 30 ? 8 : v.hunger > 10 ? -8 : -25;
  const kinds = new Set(v.meals).size;
  target += kinds >= 3 ? 12 : kinds === 2 ? 6 : 0;
  if (c.season === 3 || v.warmth < 100) target += v.warmth > 50 ? 4 : v.warmth > 15 ? -10 : -25;
  if (v.job) target += 4;
  const home = homeOf(w, v);
  if (w.buildings.some(b => b.kind === 'pole' && b.built && Math.hypot(b.x - home.x, b.z - home.z) <= BUILDINGS.pole.radius)) target += BUILDINGS.pole.joy;
  target = Math.max(0, Math.min(100, target));
  v.joy += (target - v.joy) * 0.05;
  v.sadT = v.joy < 22 ? v.sadT + 1 : 0;
  if (v.starve > 0 && !v.warned) { v.warned = true; w.msg(`${v.name} is starving.`, 'warn'); }
  else if (v.coldT > 0 && !v.warned) { v.warned = true; w.msg(`${v.name} is freezing.`, 'warn'); }
  else if (!v.starve && !v.coldT) v.warned = false;
  let why = '';
  if (v.starve > DAY * 1.5) why = 'went hungry too long';
  else if (v.coldT > DAY) why = 'could not bear the cold';
  else if (v.sadT > DAY * 2) why = 'was too unhappy to stay';
  if (why) {
    dropPlan(w, v);
    v.leaving = why;
    w.msg(`${v.name} ${why}, and is leaving on the next boat.`, 'bad');
  }
}
