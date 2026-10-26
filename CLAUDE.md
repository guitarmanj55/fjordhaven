# Fjordhaven

Cozy Nordic fishing-village builder in the spirit of Outlanders 2, for one player (Oli), played mostly as an iPhone home-screen app (portrait or landscape). Siblings: `crown-siege`, `gym-log`, `hangeul-lab`, `news-pocket`, `t212-pocket`.

## What it is
You place buildings on a free-form (not grid-snapped) low-poly 3D fjord valley; villagers pick their own jobs, build, haul, eat and sleep. Where they walk the grass wears into trails and then cobbled roads (**desire paths**: A* tile cost drops with `wear`, so people reuse trails). Seasons (spring to winter) drive everything: berries and crops in summer and autumn, homes burn one log a day in winter, ice fishing, snow, northern lights. Content villagers plus free beds bring a longship of new settlers. Scenarios with goals: The First Winters, The Long Dark, Free Settlement (no goals).

Buildings: cottage (3 beds), woodcutter, forager, fishing hut, quarry, sawmill (2 logs → 3 planks, keeps a firewood reserve), farm (10 fields, 2 workers), bakehouse (2 grain → 3 bread), storehouse, Midsummer Pole (joy), plus the Mead Hall.

## State of play (read this first)
- Release 1 (2026-10-26): everything above. `npm test` passes 11 tests, incl. a scripted bot that wins The First Winters. `npm run probe -- first 3 [seed]` prints a line per season for the bot; the bot wins The First Winters on about 3 of 5 seeds and often loses Long Dark (balance is deliberately a bit tight, tune after real play). Checked in the browser preview at 844x500 and 390x780: title, placing and building a cottage, autumn / winter looks, save and Continue, info panel. **Not checked on a real iPhone**: touch feel (pan / pinch / twist), frame rate (shadows may need turning off in the menu), audio unlock, safe-area insets, installing to the home screen.
- Not yet built (ideas): wishes and quests per villager, floods, buildings that upgrade from neighbours (hamlet growth), roads that villagers ask for, export / import save code, more maps, pixel-perfect snow on roofs, ghost model polish.

## Rules
- **The simulation is pure.** `src/sim/` has no DOM, timers or `Math.random`: randomness is the world's seeded `rng` (state is a plain number in the save). Fixed step 30 Hz (`STEP`); one day is `DAY` = 40 sim seconds. The renderer only reads the world. A test guards determinism and save/load equivalence.
- **Data, not code, for balance.** Costs, sizes, scenarios, hunger and speed live in `src/sim/data.js`. Yields (berries per pick, logs per tree, fish per season) are in `src/sim/villagers.js` (`DO`).
- **Villager plans are plain data** (`{a:'go'|'wait'|'do'|'enter'|'exit'|'sleep', ...}` with `do` naming a function in `DO`), so a save restores mid-task. If you add a new action, add it to `DO` and keep the plan serialisable.
- **Placement rules** (`checkPlace` in `buildings.js`): dry, not steep, not on boulders, door tile free, and the new footprint must not cut any door or the landing off from the hall (`keepsConnected` flood fill). Buildings flatten the ground under them.
- **Rendering:** Three.js r170 is vendored in `vendor/` (no CDN, works offline). All models are procedural, merged into one geometry each with vertex colours (`src/render/models.js`); trees, rocks, bushes, fields and people are `InstancedMesh`. Terrain colours (grass by season, snow, soil, dirt, cobble) are recomputed from `wear` twice a second (`terrain.js`).
- **iPhone first.** Touch targets 44px or larger, safe-area insets, pixel ratio capped at 2, audio created on the first `pointerdown`, the game pauses (menu) when the app goes to the background and saves on `visibilitychange` / `pagehide`.
- **Saved data:** `localStorage` key `fjordhaven_save_v1` (the whole world as JSON, typed arrays as base64, `schema: 1`) and `fjordhaven_prefs_v1` (sound, shadows). Every access is in try/catch. Do not change the shape without a migration in `deserialize()`.
- **Service worker:** network-first. Bump `CACHE` in `sw.js` every release and add new files to `SHELL`. (It also caches `test/bot.js`, which the title screen imports to fill the backdrop village.)
- `window.__fjord` (the world) and `window.__fjordDbg` (camera, view, placing, sel, mode) exist for checks in the browser; the game does not use them. The browser pane only runs animation frames while it is in front: take a screenshot first, then read state. To fast-forward in the page: `const W = await import('/src/sim/world.js'); W.step(window.__fjord)` in a loop.

## Layout
- `index.html`, `style.css`: shell, HUD, title, menu and end screens (DOM over the canvas).
- `src/main.js`: loop, modes, HUD, build bar and placement, picking, info panel, saving.
- `src/sim/`: `data.js`, `map.js` (terrain, trees, rocks, hall spot), `path.js` (A*), `buildings.js`, `villagers.js` (needs, plans, jobs), `world.js` (calendar, dawn, ship, goals, job and home assignment), `save.js`, `rng.js`, `noise.js`.
- `src/render/`: `view.js` (scene, lighting, day / night, weather, instancing), `terrain.js`, `models.js`.
- `src/ui/camera.js` (orbit camera, pan, pinch, twist, picking), `src/audio.js` (WebAudio synth).
- `test/sim.test.js`, `test/bot.js` (scripted player), `scripts/probe.js` (bot balance run), `scripts/dbg.mjs` (trace villagers), `scripts/make_icons.py` (icons, pure Python and slow), `scripts/serve.py` (no-cache dev server, port 8140 via `.claude/launch.json`).

## Release routine
`npm test`, probe `first` over a few seeds, check in the browser preview (title, place a building, winter, save and Continue, portrait 390x780), bump `CACHE` in `sw.js`, commit and push (Pages redeploys from `main`; check the live URL).
