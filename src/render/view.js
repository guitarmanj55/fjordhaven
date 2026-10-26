// The 3D view of a world. Reads the sim, never changes it.
import * as THREE from '../../vendor/three.module.min.js';
import { N, BUILDINGS, DAY } from '../sim/data.js';
import { groundAt } from '../sim/map.js';
import { hash01 } from '../sim/rng.js';
import { calendar, snowCover, SHIP_IN, SHIP_STAY } from '../sim/world.js';
import { Terrain } from './terrain.js';
import { buildingModel, scaffoldGeo, natureGeos, villagerGeos, shipGeo } from './models.js';

const hex = h => new THREE.Color(h);
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const SKY_DAY = [hex(0xa9d6ec), hex(0x9cd0ef), hex(0xc4d3dc), hex(0xcad7e2)];
const SKY_DUSK = hex(0xf0a77c), SKY_NIGHT = hex(0x16284a);
const SUN = hex(0xfff1d6), SUN_LOW = hex(0xffad6b), MOON = hex(0x8fa8d8);
const JOB_COLORS = { woodcutter: 0x4f6b3a, forager: 0xa0525a, fisher: 0x3d5f80, quarry: 0x7a756d, sawmill: 0xa77b43, farm: 0xc4a14a, bakehouse: 0xe3dccd };
const HATS = [0xb3332a, 0x3b5b8c, 0xd8a83a, 0x4f7a3a, 0x8a8f94, 0xefe8da, 0x6b3a5a];
const SKIN = [0xf1d0b5, 0xe3b896, 0xd9a882, 0xf5dcc6];
const CARRY = { logs: 0x8a5a36, planks: 0xc49a6c, stone: 0x9aa0a4, grain: 0xd8b34a, fish: 0xc7d0d6, berries: 0xb4233c, bread: 0xc98a45 };
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();

function compose(mesh, i, x, y, z, ry, sx, sy = sx, sz = sx, rx = 0, rz = 0) {
  tmpQ.setFromEuler(tmpE.set(rx, ry, rz, 'YXZ'));
  tmpM.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz));
  mesh.setMatrixAt(i, tmpM);
}

function instanced(geo, mat, cap, shadow = true) {
  const m = new THREE.InstancedMesh(geo, mat, cap);
  m.count = 0; m.castShadow = shadow; m.receiveShadow = true;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.setColorAt(0, tmpC.set(1, 1, 1));
  m.frustumCulled = false;
  return m;
}

export class View {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xa9d6ec, 50, 150);
    this.scene.background = new THREE.Color(0xa9d6ec);
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0x2c2118 });
    this.hemi = new THREE.HemisphereLight(0xdfefff, 0x5a6a48, 1.4);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 120;
    this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.buildings = new Map();
    this.t = 0;
    this.makeNature();
    this.makePeople();
    this.makeFx();
  }

  setShadows(on) { this.renderer.shadowMap.enabled = on; this.sun.castShadow = on; this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); }

  setWorld(w) {
    this.w = w;
    if (this.terrain) this.terrain.build(w); else this.terrain = new Terrain(this.scene, w);
    for (const g of this.buildings.values()) this.scene.remove(g);
    this.buildings.clear();
    this.treeVer = -1; this.colorT = 99; this.colorKey = '';
    this.syncBuildings(w);
    this.syncNature(w);
  }

  makeNature() {
    const g = natureGeos();
    const cap = N * N;
    this.pineTrunk = instanced(g.pineTrunk, this.mat, cap);
    this.pineCrown = instanced(g.pineCrown, this.mat, cap);
    this.birchTrunk = instanced(g.birchTrunk, this.mat, cap);
    this.birchCrown = instanced(g.birchCrown, this.mat, cap);
    this.rocks = instanced(g.rock, this.mat, cap);
    this.bushes = instanced(g.bush, this.mat, cap);
    this.berries = instanced(g.berries, this.mat, cap, false);
    this.fields = instanced(g.field, this.mat, 400, false);
    this.tufts = instanced(g.tufts, this.mat, 400);
    this.scene.add(this.pineTrunk, this.pineCrown, this.birchTrunk, this.birchCrown, this.rocks, this.bushes, this.berries, this.fields, this.tufts);
  }

  syncNature(w) {
    this.treeVer = w.treeVer;
    const cal = calendar(w), snow = snowCover(w);
    const birchLeaf = [hex(0x9cc35a), hex(0x6f9e45), hex(0xe0b13a), hex(0xd9c79a)][cal.season];
    const snowy = hex(0xdfe7ea);
    let p = 0, b = 0, r = 0, u = 0, be = 0, f = 0;
    for (let i = 0; i < N * N; i++) {
      const tx = i % N, tz = (i / N) | 0;
      const jx = (hash01(tx, tz, 11) - 0.5) * 0.4, jz = (hash01(tx, tz, 12) - 0.5) * 0.4;
      const x = tx + 0.5 + jx, z = tz + 0.5 + jz;
      if (w.tree[i]) {
        const y = groundAt(w, x, z) - 0.03, ry = hash01(tx, tz, 13) * 6.28;
        const s = (0.78 + hash01(tx, tz, 14) * 0.45) * (0.25 + 0.75 * w.treeGrow[i]);
        if (w.tree[i] === 1) {
          compose(this.pineTrunk, p, x, y, z, ry, s);
          compose(this.pineCrown, p, x, y, z, ry, s);
          tmpC.setHSL(0.36 + hash01(tx, tz, 15) * 0.05, 0.38, 0.22 + hash01(tx, tz, 16) * 0.07).lerp(snowy, snow * 0.5);
          this.pineCrown.setColorAt(p, tmpC);
          p++;
        } else {
          compose(this.birchTrunk, b, x, y, z, ry, s);
          const leaf = cal.season === 3 ? 0.0001 : 1;
          compose(this.birchCrown, b, x, y, z, ry, s * leaf, s * leaf, s * leaf);
          tmpC.copy(birchLeaf);
          if (cal.season === 2 && hash01(tx, tz, 17) < 0.35) tmpC.setHex(0xd4772c);
          tmpC.offsetHSL(0, 0, (hash01(tx, tz, 18) - 0.5) * 0.08);
          this.birchCrown.setColorAt(b, tmpC);
          b++;
        }
      } else if (w.rock[i]) {
        const s = 0.6 + 0.45 * Math.min(1, w.rock[i] / 32);
        compose(this.rocks, r, x, groundAt(w, x, z) - 0.05, z, hash01(tx, tz, 19) * 6.28, s * 1.4, s * 1.2, s * 1.4);
        tmpC.setHSL(0.58, 0.04, 0.5 + hash01(tx, tz, 20) * 0.12).lerp(snowy, snow * 0.6);
        this.rocks.setColorAt(r, tmpC);
        r++;
      } else if (w.bush[i]) {
        const y = groundAt(w, x, z), ry = hash01(tx, tz, 21) * 6.28;
        compose(this.bushes, u, x, y, z, ry, 1.1);
        tmpC.set(cal.season === 3 ? 0x8a8a7a : cal.season === 2 ? 0x9a8a50 : 0xffffff).lerp(snowy, snow * 0.6);
        this.bushes.setColorAt(u, tmpC);
        u++;
        if (w.berries[i] > 0) { compose(this.berries, be, x, y, z, ry, 0.6 + w.berries[i] * 0.1); this.berries.setColorAt(be, tmpC.set(0xffffff)); be++; }
      }
      if (w.field[i] && f < 400) {
        const fx = tx + 0.5, fz = tz + 0.5, y = groundAt(w, fx, fz) + 0.01;
        compose(this.fields, f, fx, y, fz, 0, 1);
        const crop = w.crop[i], gr = w.cropGrow[i];
        this.fields.setColorAt(f, tmpC.set(crop ? 0x5e4129 : 0x6b4a2e).lerp(snowy, snow));
        const ts = crop ? 0.12 + 0.88 * gr : 0.0001;
        compose(this.tufts, f, fx, y, fz, hash01(tx, tz, 22) * 0.5, 1, ts, 1);
        this.tufts.setColorAt(f, tmpC.set(0x79a347).lerp(hex(0xd8b34a), crop === 2 ? 1 : sm(0.4, 1, gr)));
        f++;
      }
    }
    const set = (m, n) => { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; };
    set(this.pineTrunk, p); set(this.pineCrown, p); set(this.birchTrunk, b); set(this.birchCrown, b);
    set(this.rocks, r); set(this.bushes, u); set(this.berries, be); set(this.fields, f); set(this.tufts, f);
  }

  syncBuildings(w) {
    const seen = new Set();
    for (const b of w.buildings) {
      seen.add(b.id);
      let g = this.buildings.get(b.id);
      if (!g) {
        g = new THREE.Group();
        const m = buildingModel(b.kind);
        const body = new THREE.Mesh(m.body, this.mat);
        body.castShadow = body.receiveShadow = true;
        g.add(body);
        if (m.glow) g.add(new THREE.Mesh(m.glow, this.glowMat));
        const sc = new THREE.Mesh(scaffoldGeo(), this.mat);
        sc.castShadow = true;
        const B = BUILDINGS[b.kind];
        sc.scale.set(B.w / 2, Math.max(1, m.height / 1.6), B.d / 2);
        g.add(sc);
        g.userData = { id: b.id, body, sc, model: m, built: null };
        g.position.set(b.x, groundAt(w, b.x, b.z), b.z);
        g.rotation.y = b.rot;
        this.scene.add(g);
        this.buildings.set(b.id, g);
      }
      const u = g.userData, frac = b.built ? 1 : b.progress / BUILDINGS[b.kind].build;
      u.body.scale.set(1, 0.08 + 0.92 * frac, 1);
      u.sc.visible = !b.built;
      if (g.children[1] && g.children[1] !== u.sc) g.children[1].visible = b.built;
      if (u.pop > 0) { u.pop -= 0.04; const s = 1 + Math.sin(u.pop * Math.PI) * 0.06; g.scale.set(s, s, s); }
      if (b.built && u.built === false) u.pop = 1;
      u.built = b.built;
    }
    for (const [id, g] of this.buildings) if (!seen.has(id)) { this.scene.remove(g); this.buildings.delete(id); }
  }

  makePeople() {
    const g = villagerGeos();
    this.vBody = instanced(g.body, this.mat, 240);
    this.vHead = instanced(g.head, this.mat, 240);
    this.vHat = instanced(g.hat, this.mat, 240);
    this.vCarry = instanced(g.carry, this.mat, 240);
    this.scene.add(this.vBody, this.vHead, this.vHat, this.vCarry);
    this.ship = new THREE.Mesh(shipGeo(), this.mat);
    this.ship.castShadow = true;
    this.ship.visible = false;
    this.scene.add(this.ship);
  }

  syncPeople(w, alpha) {
    let n = 0, c = 0;
    const t = this.t;
    for (const v of w.villagers) {
      if (v.inside) continue;
      const x = v.px + (v.x - v.px) * alpha, z = v.pz + (v.z - v.pz) * alpha;
      let y = Math.max(0, groundAt(w, x, z)), rx = 0, sy = 1, ry = v.dir;
      const ph = t * 9 + v.id;
      switch (v.anim) {
        case 'walk': y += Math.abs(Math.sin(ph)) * 0.05; break;
        case 'chop': case 'mine': rx = Math.max(0, Math.sin(t * 7 + v.id)) * 0.45; break;
        case 'pick': case 'sow': case 'reap': sy = 0.82 + Math.sin(t * 3 + v.id) * 0.05; rx = 0.3; break;
        case 'build': y += Math.abs(Math.sin(t * 12 + v.id)) * 0.03; rx = Math.sin(t * 12 + v.id) * 0.15; break;
        case 'fish': rx = -0.1; break;
        default: sy = 1 + Math.sin(t * 2 + v.id) * 0.015;
      }
      compose(this.vBody, n, x, y, z, ry, 1.15, 1.15 * sy, 1.15, rx);
      compose(this.vHead, n, x, y, z, ry, 1.15, 1.15 * sy, 1.15, rx);
      compose(this.vHat, n, x, y, z, ry, 1.15, 1.15 * sy, 1.15, rx);
      const job = v.job && w.buildings.find(b => b.id === v.job);
      this.vBody.setColorAt(n, tmpC.set(v.leaving ? 0x555555 : job ? JOB_COLORS[job.kind] || 0x8a6a50 : 0x8a6a50));
      this.vHead.setColorAt(n, tmpC.set(SKIN[v.look % SKIN.length]));
      this.vHat.setColorAt(n, tmpC.set(HATS[(v.look >> 3) % HATS.length]));
      n++;
      if (v.carry) {
        compose(this.vCarry, c, x, y, z, ry, 1.15, 1.15, 1.15, rx);
        this.vCarry.setColorAt(c, tmpC.set(CARRY[v.carry.k] || 0xffffff));
        c++;
      }
    }
    for (const m of [this.vBody, this.vHead, this.vHat]) { m.count = n; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    this.vCarry.count = c; this.vCarry.instanceMatrix.needsUpdate = true; this.vCarry.instanceColor.needsUpdate = true;
    // longship
    const s = w.ship;
    this.ship.visible = !!s;
    if (s && w.landing >= 0) {
      const lx = (w.landing % N) + 0.5, lz = ((w.landing / N) | 0) + 0.5;
      const dock = this.dockPoint(w, lx, lz);
      const fromX = -SHIP_FAR;
      let x, k;
      if (s.t < SHIP_IN) { k = 1 - (1 - s.t / SHIP_IN) ** 2; x = fromX + (dock.x - fromX) * k; }
      else if (s.t < SHIP_IN + SHIP_STAY) x = dock.x;
      else { k = ((s.t - SHIP_IN - SHIP_STAY) / SHIP_IN) ** 2; x = dock.x + (fromX - dock.x) * k; }
      this.ship.position.set(x, Math.sin(t * 1.3) * 0.05 + 0.05, dock.z);
      this.ship.rotation.set(Math.sin(t * 0.9) * 0.03, 0, Math.sin(t * 1.1) * 0.03);
    }
  }

  dockPoint(w, lx, lz) {
    if (this._dock && this._dock.l === w.landing) return this._dock;
    let x = lx;
    while (x > -10 && groundAt(w, Math.max(0, x), lz) > -0.6) x -= 0.5;
    this._dock = { l: w.landing, x: x - 0.6, z: lz };
    return this._dock;
  }

  makeFx() {
    // chimney smoke
    const puff = new THREE.IcosahedronGeometry(0.16, 0);
    this.smoke = instanced(puff, new THREE.MeshLambertMaterial({ color: 0xd9d9d6, flatShading: true, transparent: true, opacity: 0.75 }), 120, false);
    this.smoke.receiveShadow = false;
    this.puffs = [];
    this.scene.add(this.smoke);
    // snow
    const n = 1400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = Math.random() * 60 - 30; pos[i * 3 + 1] = Math.random() * 24; pos[i * 3 + 2] = Math.random() * 60 - 30; }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.snowMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.13, transparent: true, opacity: 0, depthWrite: false });
    this.snow = new THREE.Points(sg, this.snowMat);
    this.snow.frustumCulled = false;
    this.scene.add(this.snow);
    // northern lights: two curved ribbons far to the north
    this.aurora = new THREE.Group();
    const amat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.auroraMat = amat;
    for (let r = 0; r < 2; r++) {
      const g = new THREE.PlaneGeometry(140, 18, 60, 1);
      const c = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < g.attributes.position.count; i++) {
        const top = g.attributes.position.getY(i) > 0;
        tmpC.set(top ? 0x7a3fb0 : 0x3cf0a0).multiplyScalar(top ? 0.35 : 0.9);
        c[i * 3] = tmpC.r; c[i * 3 + 1] = tmpC.g; c[i * 3 + 2] = tmpC.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      const m = new THREE.Mesh(g, amat);
      m.position.set(N / 2 + r * 18, 34 + r * 6, -36 - r * 14);
      m.rotation.set(-0.25, r * 0.4 - 0.2, 0);
      m.userData.base = g.attributes.position.array.slice();
      this.aurora.add(m);
    }
    this.scene.add(this.aurora);
    // selection ring
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
    this.ring.visible = false; this.ring.renderOrder = 2;
    this.scene.add(this.ring);
    // placement ghost
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: 0.55, depthWrite: false });
    this.ghost = new THREE.Group();
    this.ghostBody = new THREE.Mesh(undefined, this.ghostMat);
    this.reach = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
    this.tileMarks = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }), 24);
    this.tileMarks.frustumCulled = false;
    this.ghost.add(this.ghostBody);
    this.scene.add(this.ghost, this.reach, this.tileMarks);
    this.ghost.visible = this.reach.visible = this.tileMarks.visible = false;
  }

  showGhost(w, g) {
    if (!g) { this.ghost.visible = this.reach.visible = this.tileMarks.visible = false; return; }
    const m = buildingModel(g.kind);
    if (this.ghostBody.geometry !== m.body) this.ghostBody.geometry = m.body;
    this.ghost.visible = true;
    this.ghost.position.set(g.x, groundAt(w, g.x, g.z) + 0.02, g.z);
    this.ghost.rotation.y = g.rot;
    this.ghostMat.color.setHex(g.ok ? 0x7dff9a : 0xff6b5a);
    const r = BUILDINGS[g.kind].radius;
    this.reach.visible = !!r;
    if (r) { this.reach.position.set(g.x, groundAt(w, g.x, g.z) + 0.3, g.z); this.reach.scale.setScalar(r); }
    let n = 0;
    for (const i of [...g.tiles, g.door]) {
      if (i < 0 || n >= 24) continue;
      const x = (i % N) + 0.5, z = ((i / N) | 0) + 0.5;
      tmpM.makeTranslation(x, groundAt(w, x, z) + 0.06, z);
      this.tileMarks.setMatrixAt(n, tmpM);
      this.tileMarks.setColorAt(n, tmpC.set(i === g.door ? 0xffe28a : g.ok ? 0x7dff9a : 0xff6b5a));
      n++;
    }
    this.tileMarks.count = n; this.tileMarks.visible = true;
    this.tileMarks.instanceMatrix.needsUpdate = true;
    if (this.tileMarks.instanceColor) this.tileMarks.instanceColor.needsUpdate = true;
  }

  showSelection(w, sel, alpha) {
    if (!sel) { this.ring.visible = false; return; }
    if (sel.type === 'building') {
      const b = w.buildings.find(x => x.id === sel.id);
      if (!b) { this.ring.visible = false; return; }
      const B = BUILDINGS[b.kind];
      this.ring.position.set(b.x, groundAt(w, b.x, b.z) + 0.08, b.z);
      this.ring.scale.setScalar(Math.hypot(B.w, B.d) / 2 + 0.3);
    } else {
      const v = w.villagers.find(x => x.id === sel.id);
      if (!v) { this.ring.visible = false; return; }
      const x = v.px + (v.x - v.px) * alpha, z = v.pz + (v.z - v.pz) * alpha;
      this.ring.position.set(x, groundAt(w, x, z) + 0.05, z);
      this.ring.scale.setScalar(0.32);
      this.ring.visible = !v.inside;
      return;
    }
    this.ring.visible = true;
  }

  // Light, sky, weather. Called every frame.
  updateEnv(w, dt, camTarget) {
    const cal = calendar(w), snow = snowCover(w), f = cal.frac;
    const L = sm(0.0, 0.1, f) * (1 - sm(0.7, 0.84, f));
    const dusk = Math.sin(L * Math.PI) * (L < 1 ? 1 : 0);
    const sky = tmpC.copy(SKY_DAY[cal.season]).lerp(SKY_DUSK, dusk * 0.55);
    const night = SKY_NIGHT.clone();
    sky.lerp(night, 1 - L);
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky);
    this.hemi.intensity = 0.95 + 0.8 * L;
    this.hemi.color.set(0xdfefff).lerp(MOON, 1 - L);
    this.hemi.groundColor.set(cal.season === 3 ? 0x9aa6b0 : 0x5a6a48);
    const az = 0.6 + f * Math.PI * 1.3, el = 0.25 + 0.85 * L;
    this.sun.position.set(camTarget.x + Math.cos(az) * Math.cos(el) * 50, Math.sin(el) * 50, camTarget.z + Math.sin(az) * Math.cos(el) * 50);
    this.sun.target.position.set(camTarget.x, 0, camTarget.z);
    this.sun.intensity = 0.6 + 1.8 * L;
    this.sun.color.copy(MOON).lerp(SUN, L).lerp(SUN_LOW, dusk * 0.6);
    this.glowMat.color.set(0x2c2118).lerp(hex(0xffc861), 1 - L * 0.9);
    // snowfall on most winter days
    const snowing = cal.season === 3 && hash01(w.day, 3, w.seed) < 0.7 ? 1 : cal.season === 2 && cal.dayOfSeason === cal.seasonLen - 1 ? 0.3 : 0;
    this.snowMat.opacity += ((snowing ? 0.9 : 0) - this.snowMat.opacity) * Math.min(1, dt * 0.5);
    this.snow.visible = this.snowMat.opacity > 0.01;
    if (this.snow.visible) {
      const p = this.snow.geometry.attributes.position.array;
      for (let i = 0; i < p.length; i += 3) {
        p[i + 1] -= dt * (1.1 + (i % 7) * 0.08);
        p[i] += Math.sin(this.t + i) * dt * 0.2;
        if (p[i + 1] < 0) p[i + 1] += 24;
      }
      this.snow.geometry.attributes.position.needsUpdate = true;
      this.snow.position.set(camTarget.x, 0, camTarget.z);
    }
    // aurora on clear autumn and winter nights
    const aur = (cal.season >= 2 && hash01(w.day, 7, w.seed) < 0.75 ? 1 : 0) * (1 - L);
    this.auroraMat.opacity += (aur * 0.75 - this.auroraMat.opacity) * Math.min(1, dt);
    this.aurora.visible = this.auroraMat.opacity > 0.01;
    if (this.aurora.visible) for (const m of this.aurora.children) {
      const a = m.geometry.attributes.position.array, b = m.userData.base;
      for (let i = 0; i < a.length; i += 3) a[i + 2] = b[i + 2] + Math.sin(b[i] * 0.06 + this.t * 0.4) * 6 + Math.sin(b[i] * 0.15 - this.t * 0.7) * 2;
      m.geometry.attributes.position.needsUpdate = true;
    }
    return { cal, snow, L, env: { season: cal.season, blend: Math.min(1, cal.dayOfSeason + cal.frac), snow } };
  }

  updateSmoke(w, dt, L) {
    this.smokeT = (this.smokeT || 0) + dt;
    const cal = calendar(w);
    if (this.smokeT > 0.35) {
      this.smokeT = 0;
      for (const b of w.buildings) {
        const m = buildingModel(b.kind);
        if (!b.built || !m.chimney) continue;
        const lived = b.kind === 'bakehouse' ? w.time - b.busy < 12 : w.villagers.some(v => v.home === b.id) || b.kind === 'hall';
        const want = cal.season === 3 || L < 0.6 || b.kind === 'bakehouse' ? 1 : 0.25;
        if (!lived || Math.random() > want || this.puffs.length >= 120) continue;
        const [lx, ly, lz] = m.chimney, c = Math.cos(b.rot), s = Math.sin(b.rot);
        this.puffs.push({ x: b.x + lx * c + lz * s, y: groundAt(w, b.x, b.z) + ly, z: b.z - lx * s + lz * c, life: 0 });
      }
    }
    let n = 0;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life += dt / 3.5; p.y += dt * 0.45; p.x += dt * 0.25; p.z += dt * 0.08;
      if (p.life >= 1) { this.puffs.splice(i, 1); continue; }
      const s = (0.5 + p.life * 1.8) * (1 - p.life * p.life);
      compose(this.smoke, n++, p.x, p.y, p.z, p.life * 3, s);
    }
    this.smoke.count = n; this.smoke.instanceMatrix.needsUpdate = true;
  }

  frame(w, alpha, dt, camTarget) {
    this.t += dt;
    const { L, env } = this.updateEnv(w, dt, camTarget);
    if (this.terrain.ver !== w.terrainVer) { this.terrain.updateHeights(w); for (const g of this.buildings.values()) { const b = w.buildings.find(x => x.id === g.userData.id); if (b) g.position.y = groundAt(w, b.x, b.z); } }
    this.colorT += dt;
    const key = `${env.season}|${env.snow.toFixed(2)}|${env.blend.toFixed(1)}`;
    if (this.colorT > 0.5 || key !== this.colorKey && this.colorT > 0.15) { this.colorT = 0; this.colorKey = key; this.terrain.updateColors(w, env); }
    if (this.treeVer !== w.treeVer || this.natureSeason !== env.season + (env.snow > 0.5 ? 10 : env.snow > 0.15 ? 5 : 0)) {
      if (this.natureT === undefined || this.natureT > 0.25) {
        this.natureT = 0; this.natureSeason = env.season + (env.snow > 0.5 ? 10 : env.snow > 0.15 ? 5 : 0); this.syncNature(w);
      }
    }
    this.natureT = (this.natureT || 0) + dt;
    this.terrain.animateWater(this.t);
    this.syncBuildings(w);
    this.syncPeople(w, alpha);
    this.updateSmoke(w, dt, L);
  }
}

const SHIP_FAR = 30;
export { DAY };
