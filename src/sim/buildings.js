// Placing, finishing and pulling down buildings.
import { N, T, BUILDINGS } from './data.js';
import { idx, inMap, isWater, tileHeight, tileSlope, V } from './map.js';
import { passable } from './path.js';

// Tiles covered by a w x d rectangle centred at (x, z), turned by rot (radians), plus its door tile.
export function footprint(kind, x, z, rot) {
  const b = BUILDINGS[kind], c = Math.cos(rot), s = Math.sin(rot);
  const r = Math.ceil(Math.hypot(b.w, b.d) / 2) + 1;
  const tiles = [];
  for (let tz = Math.floor(z - r); tz <= z + r; tz++) for (let tx = Math.floor(x - r); tx <= x + r; tx++) {
    const wx = tx + 0.5 - x, wz = tz + 0.5 - z;
    const lx = wx * c - wz * s, lz = wx * s + wz * c;
    if (Math.abs(lx) <= b.w / 2 - 0.02 && Math.abs(lz) <= b.d / 2 - 0.02) tiles.push(inMap(tx, tz) ? idx(tx, tz) : -1);
  }
  const front = (dist) => {
    const dx = Math.sin(rot) * dist, dz = Math.cos(rot) * dist;
    const tx = Math.floor(x + dx), tz = Math.floor(z + dz);
    return inMap(tx, tz) ? idx(tx, tz) : -1;
  };
  let door = front(b.d / 2 + 0.55);
  if (tiles.includes(door)) door = front(b.d / 2 + 1.05);
  return { tiles, door };
}

export function canAfford(w, cost) {
  for (const k in cost) if ((w.stock[k] || 0) < cost[k]) return false;
  return true;
}

// Checks a placement; returns { ok, reason, tiles, door }.
export function checkPlace(w, kind, x, z, rot, free = false) {
  const b = BUILDINGS[kind];
  const fp = footprint(kind, x, z, rot);
  const fail = reason => ({ ...fp, ok: false, reason });
  if (!fp.tiles.length || fp.tiles.includes(-1) || fp.door < 0) return fail('Too close to the edge');
  let lo = 99, hi = -99;
  for (const i of fp.tiles) {
    const t = w.type[i];
    if (isWater(t)) return fail('Needs dry land');
    if (t === T.MOUNTAIN || t === T.ROCKY) return fail('Too rocky and steep');
    if (w.occ[i] || w.field[i] || i === w.landing) return fail('Something is in the way');
    if (w.rock[i]) return fail('A boulder is in the way');
    if (tileSlope(w, i) > 0.9) return fail('Too steep');
    const th = tileHeight(w, i); lo = Math.min(lo, th); hi = Math.max(hi, th);
  }
  if (hi - lo > 1.1) return fail('Ground is too uneven');
  if (!passable(w, fp.door) || isDoorOf(w, fp.door)) return fail('The door is blocked');
  for (const bd of w.buildings) if (fp.tiles.includes(bd.door)) return fail('Blocks a door');
  if (b.needsWater && !nearWater(w, fp.door, 3)) return fail('Must be by the water');
  if (w.hall && !keepsConnected(w, fp)) return fail('Would wall off part of the village');
  if (!free && !canAfford(w, b.cost)) return fail('Not enough materials');
  return { ...fp, ok: true, reason: '' };
}

// Flood fill from the hall door with the new footprint blocked: every door and the landing must stay reachable.
let seen = new Uint32Array(N * N), seenGen = 0;
function keepsConnected(w, fp) {
  const hall = byId(w, w.hall);
  if (!hall) return true;
  const blocked = new Set(fp.tiles);
  const ok = i => passable(w, i) && !blocked.has(i);
  seenGen++;
  const q = [hall.door];
  seen[hall.door] = seenGen;
  while (q.length) {
    const i = q.pop(), x = i % N, z = (i / N) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!inMap(x + dx, z + dz)) continue;
      const j = idx(x + dx, z + dz);
      if (seen[j] !== seenGen && ok(j)) { seen[j] = seenGen; q.push(j); }
    }
  }
  const reach = i => i < 0 || seen[i] === seenGen;
  return reach(fp.door) && reach(w.landing) && w.buildings.every(b => reach(b.door));
}

const isDoorOf = (w, i) => w.buildings.some(b => b.door === i);

export function nearWater(w, i, r) {
  const x = i % N, z = (i / N) | 0;
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++)
    if (inMap(x + dx, z + dz) && isWater(w.type[idx(x + dx, z + dz)])) return true;
  return false;
}

// Levels the vertices under a footprint to their average height.
function flatten(w, tiles) {
  const verts = new Set();
  for (const i of tiles) {
    const x = i % N, z = (i / N) | 0;
    verts.add(z * V + x); verts.add(z * V + x + 1); verts.add((z + 1) * V + x); verts.add((z + 1) * V + x + 1);
  }
  let sum = 0;
  for (const v of verts) sum += w.h[v];
  const avg = sum / verts.size;
  for (const v of verts) w.h[v] = avg;
  w.terrainVer++;
}

export function place(w, kind, x, z, rot, { free = false, built = false } = {}) {
  const chk = checkPlace(w, kind, x, z, rot, free);
  if (!chk.ok) return null;
  const b = BUILDINGS[kind];
  if (!free) for (const k in b.cost) w.stock[k] -= b.cost[k];
  let cleared = 0;
  for (const i of chk.tiles) {
    if (w.tree[i]) { if (w.treeGrow[i] >= 1) cleared += 1; w.tree[i] = 0; w.treeGrow[i] = 0; }
    w.bush[i] = 0; w.berries[i] = 0;
    w.occ[i] = w.nextId;
  }
  if (w.tree[chk.door]) { w.tree[chk.door] = 0; w.treeGrow[chk.door] = 0; }
  w.bush[chk.door] = 0;
  if (cleared) w.stock.logs += cleared;
  flatten(w, chk.tiles);
  const bd = {
    id: w.nextId++, kind, x, z, rot, tiles: chk.tiles, door: chk.door,
    built, progress: built ? b.build : 0,
    want: b.workers || 0, heated: true, fields: [], busy: 0, note: '',
  };
  w.buildings.push(bd);
  w.treeVer++;
  w.events.push({ e: 'placed', id: bd.id, kind });
  if (built) finish(w, bd, true);
  return bd;
}

export function finish(w, bd, silent = false) {
  bd.built = true; bd.progress = BUILDINGS[bd.kind].build;
  if (bd.kind === 'farm') claimFields(w, bd);
  if (!silent) {
    w.events.push({ e: 'built', id: bd.id, kind: bd.kind });
    w.msg(`${BUILDINGS[bd.kind].name} finished.`);
  }
  w.everBuilt[bd.kind] = true;
}

// A farm takes the nearest open, gentle grass tiles as fields.
function claimFields(w, bd) {
  const want = BUILDINGS.farm.fields, cand = [];
  const cx = Math.floor(bd.x), cz = Math.floor(bd.z);
  for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) {
    const x = cx + dx, z = cz + dz;
    if (!inMap(x, z)) continue;
    const i = idx(x, z);
    if (w.type[i] !== T.GRASS || w.occ[i] || w.field[i] || w.rock[i] || w.tree[i] || w.bush[i]) continue;
    if (tileSlope(w, i) > 0.6 || isDoorOf(w, i) || i === w.landing) continue;
    cand.push({ i, d: Math.hypot(x + 0.5 - bd.x, z + 0.5 - bd.z) + w.wear[i] * 3 });
  }
  cand.sort((a, b) => a.d - b.d);
  for (const c of cand.slice(0, want)) {
    w.field[c.i] = bd.id; w.crop[c.i] = 0; w.cropGrow[c.i] = 0;
    bd.fields.push(c.i);
  }
  w.treeVer++;
}

export function refund(kind) {
  const out = {}, cost = BUILDINGS[kind].cost;
  for (const k in cost) out[k] = Math.floor(cost[k] / 2);
  return out;
}

export function demolish(w, bd) {
  if (bd.kind === 'hall') return false;
  if (bd.built) { const r = refund(bd.kind); for (const k in r) w.stock[k] += r[k]; }
  else for (const k in BUILDINGS[bd.kind].cost) w.stock[k] += BUILDINGS[bd.kind].cost[k];
  for (const i of bd.tiles) w.occ[i] = 0;
  for (const i of bd.fields) { w.field[i] = 0; w.crop[i] = 0; w.cropGrow[i] = 0; }
  for (const v of w.villagers) {
    let hit = false;
    if (v.home === bd.id) { v.home = 0; hit = true; }
    if (v.job === bd.id) { v.job = 0; hit = true; }
    if (v.site === bd.id) { v.site = 0; hit = true; }
    if (v.at === bd.id) hit = true;
    if (hit) {
      if (v.inside) { v.inside = false; v.x = (bd.door % N) + 0.5; v.z = ((bd.door / N) | 0) + 0.5; }
      v.plan = []; v.path = null; v.at = 0;
      if (v.res >= 0 && w.reserved[v.res] === v.id) w.reserved[v.res] = 0;
      v.res = -1;
    }
  }
  w.buildings.splice(w.buildings.indexOf(bd), 1);
  w.treeVer++;
  w.events.push({ e: 'demolished', id: bd.id });
  return true;
}

export const byId = (w, id) => w.buildings.find(b => b.id === id);
