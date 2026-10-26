import { hash01 } from './rng.js';

const smooth = t => t * t * (3 - 2 * t);

// Value noise on an integer lattice, smoothed; seeded through the hash.
export function vnoise(seed, x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = smooth(x - xi), fz = smooth(z - zi);
  const a = hash01(xi, zi, seed), b = hash01(xi + 1, zi, seed);
  const c = hash01(xi, zi + 1, seed), d = hash01(xi + 1, zi + 1, seed);
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}

// Fractal noise in roughly [-1, 1].
export function fbm(seed, x, z, oct = 4) {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < oct; i++) {
    sum += (vnoise(seed + i * 101, x * f, z * f) * 2 - 1) * amp;
    norm += amp; amp *= 0.5; f *= 2.03;
  }
  return sum / norm;
}

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
