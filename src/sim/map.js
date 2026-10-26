// Terrain generation: a fjord to the west, meadows and forest in the middle, mountains to the north and east.
import { N, T } from './data.js';
import { fbm, smoothstep } from './noise.js';
import { hash01 } from './rng.js';

export const idx = (x, z) => z * N + x;
export const inMap = (x, z) => x >= 0 && z >= 0 && x < N && z < N;
export const V = N + 1; // vertices per side

// Height of the ground at any point, inside the map or beyond it (the renderer draws a skirt with it).
export function heightAt(seed, x, z) {
  const cx = 15 + 4.5 * Math.sin(z * 0.1 + (seed % 7)) + 4 * fbm(seed + 5, 0.3, z * 0.04, 3);
  const d = x - cx;
  const land = smoothstep(-4, 3, d);
  let h = -2.4 + land * 2.9;
  h += land * (fbm(seed + 11, x * 0.07, z * 0.07, 4) * 0.7 + 0.3);
  h += land * Math.max(0, d - 8) * 0.022;
  const me = smoothstep(46, 68, x), mn = smoothstep(18, -4, z);
  const m = Math.max(me, mn * 0.9);
  const ridge = 1 - Math.abs(fbm(seed + 23, x * 0.05, z * 0.05, 4));
  h += m * m * (4 + 10 * ridge);
  const di = Math.hypot(x - 6, z - 46);
  if (di < 5) h += 3.0 * (1 - di / 5) ** 2;
  return h;
}

export function tileHeight(w, i) {
  const x = i % N, z = (i / N) | 0, h = w.h;
  return (h[z * V + x] + h[z * V + x + 1] + h[(z + 1) * V + x] + h[(z + 1) * V + x + 1]) / 4;
}

export function tileSlope(w, i) {
  const x = i % N, z = (i / N) | 0, h = w.h;
  const a = h[z * V + x], b = h[z * V + x + 1], c = h[(z + 1) * V + x], d = h[(z + 1) * V + x + 1];
  return Math.max(a, b, c, d) - Math.min(a, b, c, d);
}

// Ground height at a point inside the map, bilinear over the vertex grid.
export function groundAt(w, x, z) {
  x = Math.min(N - 0.001, Math.max(0, x)); z = Math.min(N - 0.001, Math.max(0, z));
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, h = w.h;
  const a = h[zi * V + xi], b = h[zi * V + xi + 1], c = h[(zi + 1) * V + xi], d = h[(zi + 1) * V + xi + 1];
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}

export function classify(w) {
  for (let i = 0; i < N * N; i++) {
    const th = tileHeight(w, i), sl = tileSlope(w, i);
    let t;
    if (th < -0.5) t = T.DEEP;
    else if (th < 0.02) t = T.WATER;
    else if (th > 3.4 || sl > 1.25) t = T.MOUNTAIN;
    else if (th > 2.2 || sl > 0.8) t = T.ROCKY;
    else if (th < 0.32) t = T.SAND;
    else t = T.GRASS;
    w.type[i] = t;
  }
}

export const isWater = t => t === T.DEEP || t === T.WATER;
export const walkableType = t => t === T.SAND || t === T.GRASS || t === T.ROCKY;

export function generate(w) {
  const s = w.seed;
  for (let z = 0; z < V; z++) for (let x = 0; x < V; x++) w.h[z * V + x] = heightAt(s, x, z);
  classify(w);
  for (let i = 0; i < N * N; i++) {
    const x = i % N, z = (i / N) | 0, t = w.type[i], th = tileHeight(w, i);
    const f = fbm(s + 41, x * 0.08, z * 0.08, 3);
    const r1 = hash01(x, z, s + 1), r2 = hash01(x, z, s + 2), r3 = hash01(x, z, s + 3);
    if (t === T.GRASS) {
      if ((f > 0.12 && r1 < 0.8) || r1 < 0.03) {
        w.tree[i] = fbm(s + 43, x * 0.1, z * 0.1, 2) > 0.08 && th < 1.6 ? 2 : 1;
        w.treeGrow[i] = 1;
      } else if ((f > -0.06 && r2 < 0.12) || r2 < 0.015) {
        w.bush[i] = 1; w.berries[i] = 0;
      } else if (r3 < 0.012) w.rock[i] = 24 + Math.floor(r3 * 1000) % 16;
    } else if (t === T.ROCKY) {
      if (r1 < 0.22) w.rock[i] = 24 + Math.floor(r1 * 1000) % 16;
      else if (r2 < 0.25) { w.tree[i] = 1; w.treeGrow[i] = 1; }
    }
  }
}

// Clears and checks the area around the Mead Hall so every map starts playable.
export function prepareStart(w, hx, hz) {
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = idx(x, z), d = Math.hypot(x + 0.5 - hx, z + 0.5 - hz);
    if (d < 5.5) { w.tree[i] = 0; w.bush[i] = 0; w.rock[i] = 0; }
  }
  const count = (arr, r) => {
    let n = 0;
    for (let i = 0; i < N * N; i++) if (arr[i] && Math.hypot(i % N + 0.5 - hx, ((i / N) | 0) + 0.5 - hz) < r) n++;
    return n;
  };
  // Drop a little cluster of something on open grass ring (r0..r1 from the hall) if it is missing.
  const sprinkle = (want, r0, r1, put) => {
    for (let k = 0; k < 4000 && want > 0; k++) {
      const a = hash01(k, 9, w.seed) * Math.PI * 2, r = r0 + hash01(k, 7, w.seed) * (r1 - r0);
      const x = Math.floor(hx + Math.cos(a) * r), z = Math.floor(hz + Math.sin(a) * r);
      if (!inMap(x, z)) continue;
      const i = idx(x, z);
      if (w.type[i] !== T.GRASS || w.tree[i] || w.bush[i] || w.rock[i]) continue;
      put(i); want--;
    }
  };
  if (count(w.rock, 14) < 4) sprinkle(5, 8, 13, i => (w.rock[i] = 32));
  if (count(w.bush, 11) < 8) sprinkle(9, 6, 11, i => (w.bush[i] = 1));
  if (count(w.tree, 12) < 25) sprinkle(30, 7, 12, i => { w.tree[i] = hash01(i, 3, w.seed) < 0.4 ? 2 : 1; w.treeGrow[i] = 1; });
}

// Best spot for the hall: flat open ground a few tiles from the shore, near the middle of the coast.
export function findHallSpot(w) {
  let best = null;
  for (let z = 22; z < 44; z++) for (let x = 4; x < 44; x++) {
    let ok = true, lo = 99, hi = -99;
    for (let dz = -2; dz <= 2 && ok; dz++) for (let dx = -3; dx <= 3 && ok; dx++) {
      const tx = x + dx, tz = z + dz;
      if (!inMap(tx, tz)) { ok = false; break; }
      const i = idx(tx, tz), t = w.type[i];
      if (t !== T.GRASS && t !== T.SAND) ok = false;
      const th = tileHeight(w, i); lo = Math.min(lo, th); hi = Math.max(hi, th);
    }
    if (!ok) continue;
    let water = 99;
    for (let dx = -10; dx <= 0; dx++) {
      const tx = x + dx;
      if (inMap(tx, z) && isWater(w.type[idx(tx, z)])) water = Math.min(water, -dx);
    }
    if (water > 9) continue;
    const score = (hi - lo) * 4 + Math.abs(water - 5) + Math.abs(z - 33) * 0.3;
    if (!best || score < best.score) best = { x, z, score };
  }
  return best || { x: 24, z: 32 };
}
