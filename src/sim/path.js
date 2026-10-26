// A* over tiles, 8 directions. Worn tiles are cheaper, so villagers keep to trails they have already made.
import { N, T } from './data.js';
import { walkableType } from './map.js';

const SQ2 = Math.SQRT2;
const MIN_COST = 0.55;

export function passable(w, i) {
  return walkableType(w.type[i]) && !w.occ[i] && !w.rock[i];
}

export function tileCost(w, i) {
  let c = w.type[i] === T.ROCKY ? 1.5 : w.type[i] === T.SAND ? 1.1 : 1;
  if (w.tree[i] && w.treeGrow[i] > 0.4) c *= 1.6;
  else if (w.bush[i]) c *= 1.3;
  else if (w.field[i]) c *= 1.25;
  return c / (1 + 0.8 * Math.min(1, w.wear[i]));
}

// Speed factor for walking on a tile (trails and roads are quicker).
export function speedOn(w, i) {
  let s = 1 + 0.5 * Math.min(1, w.wear[i]);
  if (w.tree[i] && w.treeGrow[i] > 0.4) s *= 0.7;
  if (w.type[i] === T.ROCKY) s *= 0.75;
  return s;
}

let gScore = new Float32Array(N * N), from = new Int32Array(N * N), stamp = new Uint32Array(N * N), closed = new Uint32Array(N * N);
let gen = 0;
const heap = [];

function push(node, f) {
  heap.push([f, node]);
  let k = heap.length - 1;
  while (k > 0) {
    const p = (k - 1) >> 1;
    if (heap[p][0] <= heap[k][0]) break;
    [heap[p], heap[k]] = [heap[k], heap[p]]; k = p;
  }
}
function pop() {
  const top = heap[0], last = heap.pop();
  if (heap.length) {
    heap[0] = last;
    let k = 0;
    for (;;) {
      const l = 2 * k + 1, r = l + 1;
      let m = k;
      if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
      if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
      if (m === k) break;
      [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
    }
  }
  return top[1];
}

// Path from tile s to tile g as a list of tile indices (excluding s). If g is blocked (a boulder, a
// building) any passable neighbour of g counts as arriving. Returns null when there is no way.
export function findPath(w, s, g) {
  if (s === g) return [];
  const goalBlocked = !passable(w, g);
  const gx = g % N, gz = (g / N) | 0;
  gen++;
  heap.length = 0;
  gScore[s] = 0; stamp[s] = gen; from[s] = -1;
  push(s, 0);
  let found = -1, guard = 0;
  while (heap.length && guard++ < 20000) {
    const cur = pop();
    if (closed[cur] === gen) continue;
    closed[cur] = gen;
    const cx = cur % N, cz = (cur / N) | 0;
    if (cur === g || (goalBlocked && Math.max(Math.abs(cx - gx), Math.abs(cz - gz)) === 1 && passable(w, cur))) { found = cur; break; }
    // someone standing where a building now is may walk out of it over dry land
    const escaping = !passable(w, cur);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const ni = nz * N + nx;
      if (ni === g && goalBlocked) continue;
      if (ni !== g && !passable(w, ni) && !(escaping && walkableType(w.type[ni]))) continue;
      if (!escaping && dx && dz && (!passable(w, cz * N + nx) || !passable(w, nz * N + cx))) continue; // no corner cutting
      const ng = gScore[cur] + (dx && dz ? SQ2 : 1) * tileCost(w, ni);
      if (stamp[ni] === gen && ng >= gScore[ni]) continue;
      stamp[ni] = gen; gScore[ni] = ng; from[ni] = cur;
      const hx = Math.abs(nx - gx), hz = Math.abs(nz - gz);
      push(ni, ng + (Math.max(hx, hz) + (SQ2 - 1) * Math.min(hx, hz)) * MIN_COST);
    }
  }
  if (found < 0) return null;
  const out = [];
  for (let c = found; c !== s; c = from[c]) out.push(c);
  return out.reverse();
}
