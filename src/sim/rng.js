// Seeded randomness (mulberry32). The world keeps its state as a plain number so saves can restore it.
export function makeRng(seed) {
  return { s: seed >>> 0 };
}

export function rand(r) {
  let t = (r.s = (r.s + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const randInt = (r, n) => Math.floor(rand(r) * n);
export const pick = (r, arr) => arr[randInt(r, arr.length)];

// Stable hash of integers to [0, 1), for per-tile variation that never consumes the rng.
export function hash01(a, b = 0, c = 0) {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
