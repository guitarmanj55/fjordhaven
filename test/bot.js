// A scripted "sensible player" for headless balance runs: builds a fixed order near the hall when affordable.
import { BUILDINGS, N } from '../src/sim/data.js';
import { checkPlace, place, canAfford, byId } from '../src/sim/buildings.js';
import { targetsInReach } from '../src/sim/villagers.js';
import { beds } from '../src/sim/world.js';

export function findSpot(w, kind, minTargets = 0) {
  const hall = byId(w, w.hall);
  const B = BUILDINGS[kind];
  let best = null;
  for (let r = 3; r < 22; r++) {
    for (let a = 0; a < 24; a++) {
      const ang = (a / 24) * Math.PI * 2;
      let x = Math.round(hall.x + Math.cos(ang) * r) + (B.w % 2 ? 0.5 : 0);
      let z = Math.round(hall.z + Math.sin(ang) * r) + (B.d % 2 ? 0.5 : 0);
      if (x < 2 || z < 2 || x > N - 2 || z > N - 2) continue;
      const rot = 0;
      const c = checkPlace(w, kind, x, z, rot, true);
      if (!c.ok) continue;
      const t = targetsInReach(w, kind, x, z);
      const score = (t ? t.n : 0);
      if (t && score < minTargets) continue;
      if (!t) return { x, z, rot };
      if (!best || score > best.score) best = { x, z, rot, score };
    }
    if (best && r > 6) return best;
  }
  return best;
}

const ORDER = ['cottage', 'woodcutter', 'forager', 'fisher', 'cottage', 'woodcutter', 'quarry', 'sawmill', 'cottage', 'fisher',
  'farm', 'storehouse', 'cottage', 'bakehouse', 'cottage', 'pole', 'forager', 'cottage', 'fisher', 'farm', 'cottage', 'woodcutter', 'cottage', 'cottage', 'fisher'];

export function botTick(w, state) {
  // keep the woodpile ahead of winter: one woodcutter per four villagers
  const cutters = w.buildings.filter(b => b.kind === 'woodcutter').length;
  if (w.villagers.length / 4 > cutters && w.stock.logs < 20 && canAfford(w, BUILDINGS.woodcutter.cost)) {
    const s = findSpot(w, 'woodcutter', 14);
    if (s) { place(w, 'woodcutter', s.x, s.z, s.rot); return; }
  }
  const k = ORDER[state.i];
  if (!k) {
    // late game: keep beds ahead of people and fishing up
    if (beds(w) - w.villagers.length < 2 && canAfford(w, BUILDINGS.cottage.cost)) { const s = findSpot(w, 'cottage'); if (s) place(w, 'cottage', s.x, s.z, s.rot); }
    return;
  }
  const unfinished = w.buildings.filter(b => !b.built).length;
  if (unfinished >= 2) return;
  if (!canAfford(w, BUILDINGS[k].cost)) return;
  const s = findSpot(w, k, k === 'woodcutter' ? 12 : k === 'forager' ? 6 : k === 'quarry' ? 2 : k === 'fisher' ? 3 : 0);
  if (s && place(w, k, s.x, s.z, s.rot)) state.i++;
  else state.skips = (state.skips || 0) + 1, state.skips > 50 && (state.i++, state.skips = 0);
}
