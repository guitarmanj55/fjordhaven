import * as THREE from '../vendor/three.module.min.js';
import { N, STEP, DAY, BUILDINGS, BUILD_ORDER, SCENARIOS, SEASON_NAMES, FOODS } from './sim/data.js';
import { createWorld, step, calendar, pop, beds, foodTotal, residentsOf, workersOf } from './sim/world.js';
import { checkPlace, place, demolish, byId, canAfford, refund } from './sim/buildings.js';
import { groundAt } from './sim/map.js';
import { targetsInReach } from './sim/villagers.js';
import { serialize, deserialize } from './sim/save.js';
import { View } from './render/view.js';
import { Cam } from './ui/camera.js';
import * as audio from './audio.js';

const $ = id => document.getElementById(id);
const SAVE = 'fjordhaven_save_v1', PREFS = 'fjordhaven_prefs_v1';
const ICONS = { cottage: '🏠', woodcutter: '🪓', forager: '🫐', fisher: '🎣', quarry: '⛏️', sawmill: '🪚', farm: '🌾', bakehouse: '🍞', storehouse: '📦', pole: '🌸' };
const RES_ICON = { logs: '🪵', planks: '🪚', stone: '🪨', food: '🐟', grain: '🌾' };

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
};
let prefs = { sound: true, shadows: true, ...(() => { try { return JSON.parse(store.get(PREFS)) || {}; } catch { return {}; } })() };
const savePrefs = () => store.set(PREFS, JSON.stringify(prefs));

// ---- renderer ----
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = prefs.shadows;
renderer.shadowMap.type = THREE.PCFShadowMap;
const view = new View(renderer);
const cam = new Cam(canvas);
audio.setOn(prefs.sound);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  cam.resize(w, h);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
resize();

// ---- state ----
let w = null, mode = 'title', speed = 1, acc = 0, last = performance.now(), saveT = 0, hudT = 0;
let sel = null, placing = null;
// for checks in the browser; the game itself does not use it
window.__fjordDbg = { cam, view, get placing() { return placing; }, get sel() { return sel; }, get mode() { return mode; } };

function startWorld(world, fresh) {
  w = world;
  window.__fjord = w;
  view.setWorld(w);
  const hall = byId(w, w.hall);
  cam.focus(hall.x, hall.z, window.innerWidth < window.innerHeight ? 34 : 24); cam.x = cam.tx; cam.z = cam.tz; cam.dist = cam.tdist;
  sel = null; placing = null; speed = 1; acc = 0;
  $('title').hidden = true; $('menu').hidden = true; $('end').hidden = true; $('hud').hidden = false;
  mode = 'play';
  buildBar(); refreshHud(true); showInfo();
  setSpeedLabel();
  if (fresh) { save(); toast(SCENARIOS[w.scenario].blurb, 'info'); }
}

function save() {
  if (!w || w.lost || mode === 'title') return;
  store.set(SAVE, serialize(w));
}

function toTitle() {
  save();
  mode = 'title';
  w = createWorld('first', 4242); view.setWorld(w); window.__fjord = w; sel = null; placing = null;
  const hall = byId(w, w.hall);
  cam.focus(hall.x, hall.z, 30);
  titleVillage();
  $('hud').hidden = true; $('menu').hidden = true; $('end').hidden = true; $('title').hidden = false;
  renderTitle();
}

// ---- title ----
function renderTitle() {
  const box = $('scenarios');
  box.innerHTML = '';
  for (const id of Object.keys(SCENARIOS)) {
    const sc = SCENARIOS[id], b = document.createElement('button');
    b.className = 'sc';
    b.innerHTML = `<b>${sc.name}</b><span>${sc.blurb}</span>`;
    b.onclick = () => { audio.unlock(); store.set(SAVE, ''); startWorld(createWorld(id), true); };
    box.appendChild(b);
  }
  const has = !!store.get(SAVE);
  $('continueBtn').hidden = !has;
}
$('continueBtn').onclick = () => {
  audio.unlock();
  try { startWorld(deserialize(store.get(SAVE)), false); }
  catch (e) { console.warn('save could not be read', e); store.set(SAVE, ''); renderTitle(); toast('That save could not be read.', 'bad'); }
};

// ---- menu ----
$('menuBtn').onclick = () => { mode = 'menu'; refreshMenu(); $('menu').hidden = false; };
$('resumeBtn').onclick = () => { mode = 'play'; $('menu').hidden = true; };
$('titleBtn').onclick = toTitle;
$('soundBtn').onclick = () => { prefs.sound = !prefs.sound; audio.setOn(prefs.sound); savePrefs(); refreshMenu(); };
$('shadowBtn').onclick = () => { prefs.shadows = !prefs.shadows; view.setShadows(prefs.shadows); savePrefs(); refreshMenu(); };
function refreshMenu() {
  $('soundBtn').textContent = `Sound: ${prefs.sound ? 'on' : 'off'}`;
  $('shadowBtn').textContent = `Shadows: ${prefs.shadows ? 'on' : 'off'}`;
}
$('endKeep').onclick = () => { $('end').hidden = true; mode = 'play'; };
$('endLeave').onclick = toTitle;

const SPEEDS = [1, 2, 4];
$('speedBtn').onclick = () => { speed = speed === 0 ? 1 : SPEEDS[(SPEEDS.indexOf(speed) + 1) % 3]; setSpeedLabel(); audio.sfx.tap(); };
function setSpeedLabel() { $('speedBtn').textContent = speed === 1 ? '▶' : speed === 2 ? '▶▶' : '▶▶▶'; $('speedBtn').style.fontSize = speed === 1 ? '18px' : '13px'; }
$('goalsBtn').onclick = () => { $('goals').hidden = !$('goals').hidden; refreshGoals(); audio.sfx.tap(); };

// ---- toasts ----
function toast(text, kind = 'info') {
  const box = $('toasts'), el = document.createElement('div');
  el.className = 'toast ' + kind; el.textContent = text;
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.remove(), 6000);
}

// ---- build bar and placement ----
function buildBar() {
  const bar = $('buildbar');
  bar.innerHTML = '';
  for (const k of BUILD_ORDER) {
    const B = BUILDINGS[k], b = document.createElement('button');
    b.className = 'bb'; b.dataset.k = k;
    const cost = Object.entries(B.cost).map(([r, n]) => `${n} ${r}`).join(', ');
    b.innerHTML = `<div class="ic">${ICONS[k]}</div><div class="nm">${B.name}</div><div class="co">${cost}</div>`;
    b.onclick = () => startPlacing(k);
    bar.appendChild(b);
  }
}

function startPlacing(kind) {
  audio.unlock(); audio.sfx.tap();
  sel = null; showInfo();
  const B = BUILDINGS[kind];
  const p = cam.pick(window.innerWidth / 2, window.innerHeight * 0.45, [view.terrain.mesh]);
  placing = { kind, x: p ? snap(p.x, B.w) : cam.x, z: p ? snap(p.z, B.d) : cam.z, rot: 0 };
  $('place').hidden = false; $('bottom').hidden = true;
  updatePlacing();
}
const snap = (v, size) => Math.round(v * 2) / 2 + 0 * size;

function updatePlacing() {
  if (!placing) { view.showGhost(w, null); return; }
  const c = checkPlace(w, placing.kind, placing.x, placing.z, placing.rot);
  placing.chk = c;
  view.showGhost(w, { kind: placing.kind, x: placing.x, z: placing.z, rot: placing.rot, ok: c.ok, tiles: c.tiles, door: c.door });
  const B = BUILDINGS[placing.kind], el = $('placeMsg');
  let msg = c.ok ? `${B.name}: tap to move, ⟳ to turn, ✓ to build.` : c.reason + '.';
  if (B.radius && B.target) {
    const t = targetsInReach(w, placing.kind, placing.x, placing.z);
    if (t) msg += ` ${t.n} ${t.what} in reach.`;
  }
  el.textContent = msg; el.className = c.ok ? '' : 'bad';
  $('placeYes').style.opacity = c.ok ? 1 : 0.4;
}

function stopPlacing() { placing = null; view.showGhost(w, null); $('place').hidden = true; $('bottom').hidden = false; }
$('placeNo').onclick = () => { audio.sfx.tap(); stopPlacing(); };
$('placeRot').onclick = () => { if (placing) { placing.rot += Math.PI / 6; audio.sfx.tap(); updatePlacing(); } };
$('placeYes').onclick = () => {
  if (!placing) return;
  updatePlacing();
  if (!placing.chk.ok) { audio.sfx.deny(); return; }
  const bd = place(w, placing.kind, placing.x, placing.z, placing.rot);
  if (!bd) { audio.sfx.deny(); return; }
  audio.sfx.place();
  // keep building more of the same if it can still be afforded; otherwise return to the bar
  const kind = placing.kind;
  if (canAfford(w, BUILDINGS[kind].cost) && BUILDINGS[kind].workers === undefined) {
    placing.x += 2.5; updatePlacing();
  } else stopPlacing();
  refreshHud(true);
};

// ---- picking ----
cam.onTap = (sx, sy) => {
  if (mode !== 'play') return;
  audio.unlock();
  if (placing) {
    const p = cam.pick(sx, sy, [view.terrain.mesh]);
    if (p) { const B = BUILDINGS[placing.kind]; placing.x = snap(p.x, B.w); placing.z = snap(p.z, B.d); updatePlacing(); }
    return;
  }
  // villagers first (screen distance), then buildings by tile
  let best = null, bd = 34;
  for (const v of w.villagers) {
    if (v.inside) continue;
    const s = cam.project(v.x, groundAt(w, v.x, v.z) + 0.25, v.z);
    const d = Math.hypot(s.x - sx, s.y - sy);
    if (d < bd && !s.behind) { bd = d; best = v; }
  }
  if (best) { sel = { type: 'villager', id: best.id }; audio.sfx.tap(); showInfo(); return; }
  const p = cam.pick(sx, sy, [view.terrain.mesh, ...[...view.buildings.values()].map(g => g.userData.body)]);
  // buildings are picked through their meshes
  const hit = cam.ray.intersectObjects([...view.buildings.values()].map(g => g.userData.body), false)[0];
  if (hit) {
    const g = [...view.buildings.values()].find(g => g.userData.body === hit.object);
    sel = { type: 'building', id: g.userData.id }; audio.sfx.tap(); showInfo(); return;
  }
  if (p) {
    const i = Math.floor(p.z) * N + Math.floor(p.x);
    if (w.occ[i]) { sel = { type: 'building', id: w.occ[i] }; showInfo(); return; }
  }
  sel = null; showInfo();
};

// ---- info panel ----
const bar = (label, v, cls = '') => `<span>${label}</span><div class="bar ${cls} ${v < 25 ? 'lowb' : ''}"><i style="width:${Math.max(2, v)}%"></i></div>`;
function showInfo() {
  const el = $('info');
  if (!sel || !w) { el.hidden = true; return; }
  el.hidden = false;
  if (sel.type === 'villager') {
    const v = w.villagers.find(x => x.id === sel.id);
    if (!v) { sel = null; el.hidden = true; return; }
    const job = v.job && byId(w, v.job), home = v.home && byId(w, v.home);
    el.innerHTML = `<button class="x" id="infoX">✕</button><h3>${v.name}</h3>
      <div class="sub">${job ? BUILDINGS[job.kind].name : 'No job'} · ${home ? 'lives in a cottage' : 'sleeps in the hall'}${v.leaving ? ' · leaving' : ''}</div>
      <div class="bars">${bar('Food', v.hunger)}${bar('Warmth', v.warmth, 'warm')}${bar('Mood', v.joy, 'joy')}</div>
      <div class="quote">“${v.think}”</div>`;
  } else {
    const b = byId(w, sel.id);
    if (!b) { sel = null; el.hidden = true; return; }
    const B = BUILDINGS[b.kind];
    const ws = workersOf(w, b), rs = residentsOf(w, b);
    let html = `<button class="x" id="infoX">✕</button><h3>${ICONS[b.kind] || '🛖'} ${B.name}</h3><div class="sub">${B.desc}</div>`;
    if (!b.built) html += `<div class="note">Under construction: ${Math.round(b.progress / B.build * 100)}%</div>`;
    else {
      if (b.note) html += `<div class="note">${b.note}</div>`;
      if (B.workers) html += `<div class="row"><span>Workers: <b>${ws.length}/${b.want}</b>${ws.length ? ' (' + ws.map(v => v.name).join(', ') + ')' : ''}</span></div><div class="row" style="margin:6px 0"><button class="sm" id="wMinus">− worker</button><button class="sm" id="wPlus">+ worker</button></div>`;
      if (B.beds) html += `<div class="sub">Home to: ${rs.length ? rs.map(v => v.name).join(', ') : 'nobody yet'} (${rs.length}/${B.beds})${b.heated ? '' : ' · <span style="color:#ff9a8a">cold!</span>'}</div>`;
      if (B.radius && B.target) { const t = targetsInReach(w, b.kind, b.x, b.z); if (t) html += `<div class="sub">${t.n} ${t.what} in reach.</div>`; }
      if (b.kind === 'farm') html += `<div class="sub">${b.fields.length} fields. ${b.fields.filter(i => w.crop[i] === 2).length} ripe.</div>`;
    }
    if (b.kind !== 'hall') {
      const r = Object.entries(b.built ? refund(b.kind) : B.cost).map(([k, n]) => `${n} ${k}`).join(', ');
      html += `<div class="row" style="margin-top:6px"><button class="sm danger" id="demo">Pull down${r ? ' (+' + r + ')' : ''}</button></div>`;
    }
    el.innerHTML = html;
    const plus = $('wPlus'), minus = $('wMinus');
    if (plus) plus.onclick = () => { if (b.want < B.workers + 2) b.want++; audio.sfx.tap(); showInfo(); };
    if (minus) minus.onclick = () => { if (b.want > 0) b.want--; audio.sfx.tap(); showInfo(); };
    const demo = $('demo');
    if (demo) demo.onclick = () => {
      if (demo.dataset.sure) { demolish(w, b); sel = null; audio.sfx.deny(); showInfo(); refreshHud(true); return; }
      demo.dataset.sure = 1; demo.textContent = 'Tap again to confirm';
    };
  }
  $('infoX').onclick = () => { sel = null; showInfo(); };
}

// ---- hud ----
function refreshGoals() {
  const el = $('goals');
  if (el.hidden || !w) return;
  const sc = SCENARIOS[w.scenario];
  el.innerHTML = `<h3>${sc.name}</h3>` + (sc.goals.length ? sc.goals.map((g, k) => `<div class="g ${w.goals[k] ? 'done' : ''}">${w.goals[k] ? '✔' : '○'} ${g.text}</div>`).join('') : '<div class="g">No goals. Build what you like.</div>');
}

function refreshHud(force) {
  if (!w) return;
  const food = foodTotal(w), cal = calendar(w);
  const items = [['logs', w.stock.logs], ['planks', w.stock.planks], ['stone', w.stock.stone], ['food', food], ['grain', w.stock.grain]];
  const firewoodLow = cal.season >= 2 && w.stock.logs < 6, foodLow = food < pop(w) * 2;
  $('res').innerHTML = items.filter(([k, n]) => k !== 'grain' || n > 0 || w.everBuilt.farm).map(([k, n]) =>
    `<span class="chip ${(k === 'food' && foodLow) || (k === 'logs' && firewoodLow) ? 'low' : ''}" title="${k}">${RES_ICON[k]}<b>${n}</b></span>`).join('');
  $('res').title = `Fish ${w.stock.fish}, berries ${w.stock.berries}, bread ${w.stock.bread}`;
  $('date').textContent = `${SEASON_NAMES[cal.season]} · day ${cal.dayOfSeason + 1}/${cal.seasonLen} · Y${cal.year}`;
  const dot = $('sunDot');
  dot.style.left = `${cal.frac * 100}%`; dot.className = cal.night ? 'night' : '';
  $('people').textContent = `👥 ${pop(w)}/${beds(w)} beds · ☺ ${Math.round(w.happiness)}%`;
  for (const b of $('buildbar').children) {
    const k = b.dataset.k;
    b.classList.toggle('off', !canAfford(w, BUILDINGS[k].cost));
  }
  refreshGoals();
  if (sel) showInfoLive();
}

// refresh numbers in the info panel without rebuilding its buttons mid-tap
let infoT = 0;
function showInfoLive() {
  if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#info')) return;
  infoT += 1;
  if (sel.type === 'villager' || infoT % 2 === 0) showInfo();
}

// ---- events ----
function handleEvents() {
  for (const e of w.events) {
    switch (e.e) {
      case 'msg': toast(e.text, e.kind); if (e.kind === 'bad') audio.sfx.bad(); break;
      case 'hammer': audio.sfx.hammer(); break;
      case 'fell': audio.sfx.fell(); break;
      case 'built': audio.sfx.built(); break;
      case 'ship': audio.sfx.ship(); break;
      case 'landed': audio.sfx.landed(); break;
      case 'craft': audio.sfx.craft(); break;
      case 'goal': audio.sfx.goal(); break;
      case 'won': audio.sfx.won(); showEnd(true); break;
      case 'lost': audio.sfx.bad(); showEnd(false); break;
    }
  }
  w.events.length = 0;
}

function showEnd(won) {
  mode = 'end';
  $('end').hidden = false;
  $('endTitle').textContent = won ? 'The village is safe' : 'The village has fallen silent';
  $('endText').textContent = won
    ? `Every goal reached with ${pop(w)} villagers. You can keep building as long as you like.`
    : 'Everyone has gone. Try again with more food and firewood stored before winter.';
  $('endKeep').hidden = !won;
  if (!won) store.set(SAVE, '');
}

// ---- loop ----
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!w || mode === 'title') {
    // slow turn behind the title
    if (w) { cam.tyaw += dt * 0.05; cam.yaw = cam.tyaw; }
  }
  let alpha = 1;
  if (w) {
    if (mode === 'play' || mode === 'end') {
      if (speed > 0) {
        acc += dt * speed;
        let n = 0;
        while (acc >= STEP && n++ < 16 * speed) { step(w); acc -= STEP; handleEvents(); }
        if (acc > STEP * 4) acc = 0;
      }
      alpha = Math.min(1, acc / STEP);
      saveT += dt; hudT += dt;
      if (hudT > 0.3) { hudT = 0; refreshHud(); if (placing) updatePlacing(); }
      if (saveT > 20) { saveT = 0; save(); }
    }
    cam.update(dt, (x, z) => groundAt(w, x, z));
    view.frame(w, alpha, dt, { x: cam.x, z: cam.z });
    view.showSelection(w, sel, alpha);
    audio.setWind(calendar(w).season === 3 ? 1 : 0.4);
    renderer.render(view.scene, cam.cam);
  } else {
    cam.update(dt);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { save(); audio.suspend(); if (mode === 'play') { mode = 'menu'; refreshMenu(); $('menu').hidden = false; } }
});
window.addEventListener('pagehide', save);
document.addEventListener('pointerdown', () => audio.unlock(), { once: true });

// a few houses so the title backdrop is not empty
function titleVillage() {
  const target = w;
  import('../test/bot.js').then(({ botTick }) => {
    if (w !== target || mode !== 'title') return;
    const st = { i: 0 };
    for (let s = 0; s < (DAY * 6) / STEP; s++) { step(w); if (s % 30 === 0) botTick(w, st); w.events.length = 0; }
    view.setWorld(w);
  }).catch(() => {});
}

// title scene: a quiet village behind the menu
(function boot() {
  view.setShadows(prefs.shadows);
  renderTitle();
  w = createWorld('first', 4242);
  window.__fjord = w;
  view.setWorld(w);
  const hall = byId(w, w.hall);
  cam.focus(hall.x, hall.z, 30); cam.x = cam.tx; cam.z = cam.tz; cam.dist = cam.tdist;
  titleVillage();
  requestAnimationFrame(frame);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  document.addEventListener('gesturestart', (e) => e.preventDefault()); // no pinch-zoom
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); // ask iOS not to evict saved data
})();
