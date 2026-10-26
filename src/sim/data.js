// Game data: time, resources, buildings and scenarios. Tune balance here, not in the logic.

export const N = 64;              // map is N x N tiles
export const STEP = 1 / 30;       // fixed sim step (seconds)
export const DAY = 40;            // sim seconds per day
export const WORK_START = 0.08;   // fraction of the day when villagers get up
export const WORK_END = 0.76;     // ... and head home
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'];

export const RES = ['logs', 'planks', 'stone', 'grain', 'fish', 'berries', 'bread'];
export const RES_NAMES = { logs: 'Logs', planks: 'Planks', stone: 'Stone', grain: 'Grain', fish: 'Fish', berries: 'Berries', bread: 'Bread' };
// How much hunger one portion takes away (hunger runs 0 = starving to 100 = full).
export const FOODS = { berries: 38, fish: 52, bread: 70 };

export const WALK = 1.5;          // tiles per second on open ground
export const HUNGER_DAYS = 2;   // a full stomach empties in this many days
export const EAT_BELOW = 45;

// Tile types
export const T = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, ROCKY: 4, MOUNTAIN: 5 };

// w x d is the footprint in tiles; the door is in front (+z before rotation).
export const BUILDINGS = {
  hall: {
    name: 'Mead Hall', w: 4, d: 3, cost: {}, build: 0, storage: true, buildable: false,
    desc: 'The heart of the village. Stores goods, and shelters anyone without a home.',
  },
  cottage: {
    name: 'Cottage', w: 2, d: 2, cost: { logs: 6, planks: 2 }, build: 14, beds: 3,
    desc: 'A turf-roofed home for three. Burns a log a day in winter.',
  },
  woodcutter: {
    name: 'Woodcutter', w: 2, d: 2, cost: { logs: 5 }, build: 10, workers: 1, radius: 9, target: 'tree',
    desc: 'Fells grown trees within reach. Forests regrow where nobody walks.',
  },
  forager: {
    name: 'Forager', w: 2, d: 2, cost: { logs: 5 }, build: 8, workers: 1, radius: 9, target: 'bush',
    desc: 'Picks berries in summer and autumn. Bushes refill every day.',
  },
  fisher: {
    name: 'Fishing Hut', w: 2, d: 2, cost: { logs: 6, planks: 2 }, build: 10, workers: 1, radius: 6, target: 'shore', needsWater: true,
    desc: 'Fishes from the shore all year; slower through the ice in winter.',
  },
  quarry: {
    name: 'Quarry', w: 2, d: 2, cost: { logs: 8 }, build: 12, workers: 1, radius: 9, target: 'rock',
    desc: 'Breaks stone from nearby boulders.',
  },
  sawmill: {
    name: 'Sawmill', w: 3, d: 2, cost: { logs: 10, stone: 4 }, build: 16, workers: 1,
    craft: { from: { logs: 2 }, to: { planks: 3 }, time: 6 },
    desc: 'Saws 2 logs into 3 planks. Leaves enough logs in store for the winter fires.',
  },
  farm: {
    name: 'Farm', w: 3, d: 2, cost: { logs: 8, planks: 4 }, build: 16, workers: 2, fields: 10, target: 'field',
    desc: 'Sows fields in spring and summer and harvests the grain. Frost kills what is left in winter.',
  },
  bakehouse: {
    name: 'Bakehouse', w: 2, d: 2, cost: { planks: 8, stone: 6 }, build: 16, workers: 1,
    craft: { from: { grain: 2 }, to: { bread: 3 }, time: 8 },
    desc: 'Bakes 2 grain into 3 loaves. Bread is the most filling food and keeps all winter.',
  },
  storehouse: {
    name: 'Storehouse', w: 2, d: 2, cost: { logs: 8, planks: 4 }, build: 12, storage: true,
    desc: 'A stabbur on stilts. Workers drop goods at the nearest store, so build one near busy work.',
  },
  pole: {
    name: 'Midsummer Pole', w: 1, d: 1, cost: { planks: 4 }, build: 6, joy: 12, radius: 8,
    desc: 'Cheers up everyone who lives within 8 tiles.',
  },
};
export const BUILD_ORDER = ['cottage', 'woodcutter', 'forager', 'fisher', 'storehouse', 'quarry', 'sawmill', 'farm', 'bakehouse', 'pole'];

export const NAMES = [
  'Astrid', 'Bjorn', 'Sigrid', 'Leif', 'Ingrid', 'Erik', 'Freya', 'Olaf', 'Sölvi', 'Ragna', 'Torvald', 'Hilde',
  'Ivar', 'Liv', 'Gunnar', 'Solveig', 'Halvard', 'Maja', 'Arne', 'Tove', 'Sven', 'Ylva', 'Knut', 'Runa',
  'Ulf', 'Elin', 'Haakon', 'Sunniva', 'Eirik', 'Ragnhild', 'Stig', 'Embla', 'Vidar', 'Gro', 'Ketil', 'Siv',
  'Oddny', 'Brann', 'Kari', 'Trygve', 'Asa', 'Folke', 'Signe', 'Rolf', 'Thora', 'Njal', 'Dagny', 'Orm',
];

// Scenario goals: survive (reach spring of year n+1), pop (n villagers), built (a finished building),
// happy (village happiness >= n with at least 8 villagers), food (n portions in store at once).
export const SCENARIOS = {
  first: {
    name: 'The First Winters',
    blurb: 'Six settlers step ashore in spring. Feed them, house them and see them through the dark.',
    seed: 20261026, villagers: 6, startSeason: 0, seasonDays: [5, 5, 5, 5],
    stock: { logs: 34, planks: 12, stone: 6, fish: 24, berries: 20 },
    goals: [
      { type: 'pop', n: 10, text: 'Grow to 10 villagers' },
      { type: 'survive', n: 1, text: 'Survive the first winter' },
      { type: 'built', kind: 'bakehouse', text: 'Bake bread in a Bakehouse' },
      { type: 'pop', n: 20, text: 'Grow to 20 villagers' },
      { type: 'happy', n: 70, text: 'Reach 70% happiness' },
    ],
  },
  longdark: {
    name: 'The Long Dark',
    blurb: 'You land in late summer, far up the fjord, where winter lasts twice as long. Stockpile or starve.',
    seed: 77031, villagers: 5, startSeason: 1, seasonDays: [5, 5, 5, 9],
    stock: { logs: 32, planks: 10, stone: 6, fish: 18, berries: 18 },
    goals: [
      { type: 'food', n: 120, text: 'Store 120 portions of food' },
      { type: 'survive', n: 1, text: 'Survive the first long winter' },
      { type: 'pop', n: 15, text: 'Grow to 15 villagers' },
      { type: 'survive', n: 2, text: 'Survive the second winter' },
    ],
  },
  free: {
    name: 'Free Settlement',
    blurb: 'No goals and gentler seasons. Build the village you want, at your own pace.',
    seed: 0, villagers: 7, startSeason: 0, seasonDays: [6, 6, 6, 4],
    stock: { logs: 50, planks: 20, stone: 12, fish: 20, berries: 20 },
    goals: [],
  },
};
