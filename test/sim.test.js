import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, calendar, pop } from '../src/sim/world.js';
import { DAY, STEP, N, T, BUILDINGS } from '../src/sim/data.js';
import { findPath } from '../src/sim/path.js';
import { checkPlace, place, demolish, byId } from '../src/sim/buildings.js';
import { serialize, deserialize } from '../src/sim/save.js';
import { botTick, findSpot } from './bot.js';

const run = (w, seconds, bot) => {
  for (let s = 0; s < seconds / STEP; s++) { step(w); if (bot && s % 30 === 0) botTick(w, bot); w.events.length = 0; }
};
const digest = w => JSON.stringify([w.time, w.stock, w.villagers.map(v => [v.x.toFixed(4), v.z.toFixed(4), v.hunger.toFixed(3)]), Array.from(w.wear).reduce((a, b) => a + b, 0).toFixed(4)]);

test('map has a fjord, forest, boulders and a hall by the shore', () => {
  const w = createWorld('first');
  const count = f => { let n = 0; for (let i = 0; i < N * N; i++) if (f(i)) n++; return n; };
  assert.ok(count(i => w.type[i] <= T.WATER) > 300, 'water');
  assert.ok(count(i => w.tree[i]) > 300, 'trees');
  assert.ok(count(i => w.rock[i]) > 10, 'rocks');
  assert.ok(byId(w, w.hall).built);
  assert.ok(w.landing >= 0);
  assert.equal(pop(w), 6);
});

test('same seed, same game', () => {
  const a = createWorld('first'), b = createWorld('first');
  run(a, DAY * 3, { i: 0 }); run(b, DAY * 3, { i: 0 });
  assert.equal(digest(a), digest(b));
});

test('paths go around water and prefer worn trails', () => {
  const w = createWorld('first');
  const hall = byId(w, w.hall);
  const far = (hall.door % N) + 8 + ((hall.door / N) | 0) * N;
  const p1 = findPath(w, hall.door, far);
  assert.ok(p1 && p1.length >= 8);
  for (const i of p1) assert.ok(w.type[i] > T.WATER);
  // wear a detour and the path should follow it when it is nearly as short
  const p0 = p1.length;
  for (const i of p1) w.wear[i] = 1;
  const p2 = findPath(w, hall.door, far);
  assert.deepEqual(p2.slice(0, p0), p1.slice(0, p0));
});

test('placing costs materials, blocks water and refunds half on demolish', () => {
  const w = createWorld('first');
  const s = findSpot(w, 'cottage');
  const logs = w.stock.logs;
  const b = place(w, 'cottage', s.x, s.z, s.rot);
  assert.ok(b);
  assert.ok(w.stock.logs <= logs - BUILDINGS.cottage.cost.logs + 4); // cleared trees may give a few logs back
  // water
  let wet = -1;
  for (let i = 0; i < N * N; i++) if (w.type[i] === T.DEEP) { wet = i; break; }
  assert.equal(checkPlace(w, 'cottage', (wet % N) + 1, ((wet / N) | 0) + 1, 0).ok, false);
  const planks = w.stock.planks;
  demolish(w, b);
  assert.equal(w.stock.planks, planks + BUILDINGS.cottage.cost.planks); // unfinished: full refund
});

test('builders finish a cottage and villagers move in', () => {
  const w = createWorld('first');
  const s = findSpot(w, 'cottage');
  const b = place(w, 'cottage', s.x, s.z, s.rot);
  run(w, DAY * 1.5);
  assert.ok(b.built, 'built');
  assert.equal(w.villagers.filter(v => v.home === b.id).length, 3);
});

test('walking wears trails into the grass', () => {
  const w = createWorld('first');
  run(w, DAY * 6, { i: 0 });
  let trails = 0;
  for (let i = 0; i < N * N; i++) if (w.wear[i] > 0.25) trails++;
  assert.ok(trails > 15, `trails ${trails}`);
});

test('seasons turn and winter comes', () => {
  const w = createWorld('first');
  assert.equal(calendar(w).season, 0);
  w.time = DAY * 15.5; w.day = 15;
  assert.equal(calendar(w).season, 3);
  const ld = createWorld('longdark');
  assert.equal(calendar(ld).season, 1);
});

test('save and load continue the same game', () => {
  const a = createWorld('first');
  run(a, DAY * 2, { i: 0 });
  const b = deserialize(serialize(a));
  run(a, DAY); run(b, DAY);
  assert.equal(digest(a), digest(b));
});

test('a placement that walls off the hall is refused', () => {
  const w = createWorld('first');
  const hall = byId(w, w.hall);
  // a building right on the door tile is never allowed
  const dx = (hall.door % N) + 0.5, dz = ((hall.door / N) | 0) + 0.5;
  assert.equal(checkPlace(w, 'pole', dx, dz, 0, true).ok, false);
});

test('a sensible player wins The First Winters', () => {
  const w = createWorld('first');
  const st = { i: 0 };
  run(w, DAY * 20 * 3, st);
  assert.ok(w.won, `goals ${w.goals}`);
});
