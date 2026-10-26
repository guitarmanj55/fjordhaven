// Procedural low-poly models. Every model is one merged geometry with colours baked into vertices,
// so a building is a single draw call (plus one for its glowing windows).
import * as THREE from '../../vendor/three.module.min.js';

const C = {
  falu: 0x8e2b22, faluDark: 0x6f2019, ochre: 0xc49a45, timber: 0x5b4030, timberDark: 0x3e2b20, wood: 0xa07850, woodLight: 0xc49a6c,
  turf: 0x5f7d3a, turfDark: 0x46602c, stone: 0x8a8f94, stoneLight: 0xb9b2a5, stoneDark: 0x5f6468, trim: 0xefe8da,
  slate: 0x4b5560, shingle: 0x3d3a36, door: 0x3a2618, sail: 0xb3332a, sailW: 0xf1eadb, rope: 0xcdb48a, metal: 0x9aa3a8,
  fish: 0xc7d0d6, berry: 0xb4233c, bread: 0xc98a45, straw: 0xd9b45a, gold: 0xd8a83a, green: 0x3f7a3a, blue: 0x3b5b8c,
};
export const COLORS = C;

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpC = new THREE.Color();

class Kit {
  constructor() { this.pos = []; this.nor = []; this.col = []; }
  add(geo, color, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = null) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    tmpQ.setFromEuler(tmpE.set(rx, ry, rz, 'YXZ'));
    tmpM.compose(new THREE.Vector3(x, y, z), tmpQ, s ? new THREE.Vector3(...s) : new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(tmpM);
    g.computeVertexNormals();
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    tmpC.setHex(color);
    for (let i = 0; i < p.length; i += 3) {
      this.pos.push(p[i], p[i + 1], p[i + 2]); this.nor.push(n[i], n[i + 1], n[i + 2]);
      this.col.push(tmpC.r, tmpC.g, tmpC.b);
    }
    g.dispose();
    return this;
  }
  // a box standing on y
  box(w, h, d, color, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) { return this.add(new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z, ry, rx, rz); }
  // upright cylinders stand on y; tipped ones (rx or rz) are centred on y
  cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 6, rx = 0, rz = 0, ry = 0) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y + (rx || rz ? 0 : h / 2), z, ry, rx, rz); }
  cone(r, h, color, x = 0, y = 0, z = 0, seg = 6) { return this.add(new THREE.ConeGeometry(r, h, seg), color, x, y + h / 2, z); }
  ico(r, color, x = 0, y = 0, z = 0, s = null, detail = 0) { return this.add(new THREE.IcosahedronGeometry(r, detail), color, x, y, z, 0, 0, 0, s); }
  roof(w, d, h, color, x = 0, y = 0, z = 0, ry = 0) { return this.add(prism(w, d, h), color, x, y, z, ry); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

// Gable roof: width along x, slopes facing +z and -z, ridge at height h.
function prism(w, d, h) {
  const a = w / 2, b = d / 2;
  const A = [-a, 0, b], B = [a, 0, b], Cc = [a, h, 0], D = [-a, h, 0], E = [-a, 0, -b], F = [a, 0, -b], G = [a, h, 0], H = [-a, h, 0];
  const tris = [A, B, Cc, A, Cc, D, F, E, H, F, H, G, B, F, Cc, E, A, D, A, E, F, A, F, B];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  return g;
}

// Turf roof: an earthy fascia under a green top, slightly smaller.
function turfRoof(k, w, d, h, y, x = 0, z = 0, top = C.turf) {
  k.roof(w + 0.08, d + 0.08, h + 0.04, C.timberDark, x, y - 0.06, z);
  k.roof(w, d, h, top, x, y, z);
}

function windows(k, list) { for (const [w, h, x, y, z, ry = 0] of list) k.box(w, h, 0.04, 0xffffff, x, y, z, ry); }

// Each building: { body, glow, chimney: [x, y, z] | null, height }
const B = {
  cottage() {
    const k = new Kit(), g = new Kit();
    k.box(1.9, 0.18, 1.8, C.stoneDark, 0, 0, 0);
    k.box(1.6, 0.85, 1.4, C.falu, 0, 0.18, 0);
    for (const [x, z] of [[-0.8, 0.7], [0.8, 0.7], [-0.8, -0.7], [0.8, -0.7]]) k.box(0.08, 0.85, 0.08, C.trim, x, 0.18, z);
    k.box(0.34, 0.56, 0.05, C.door, -0.3, 0.18, 0.71);
    k.box(0.42, 0.05, 0.06, C.trim, -0.3, 0.74, 0.72);
    turfRoof(k, 2.0, 1.85, 0.72, 1.03);
    k.box(0.24, 0.55, 0.24, C.stone, 0.45, 1.2, -0.25);
    windows(g, [[0.3, 0.26, 0.35, 0.5, 0.715], [0.3, 0.26, 0.81, 0.5, -0.1, Math.PI / 2], [0.3, 0.26, -0.81, 0.5, 0.1, Math.PI / 2]]);
    k.box(0.38, 0.05, 0.06, C.trim, 0.35, 0.79, 0.72);
    return { k, g, chimney: [0.45, 1.8, -0.25], height: 1.8 };
  },
  hall() {
    const k = new Kit(), g = new Kit();
    k.box(3.9, 0.24, 2.9, C.stoneDark, 0, 0, 0);
    k.box(3.5, 1.15, 2.4, C.timber, 0, 0.24, 0);
    for (let x = -1.6; x <= 1.61; x += 0.8) k.box(0.1, 1.15, 0.1, C.timberDark, x, 0.24, 1.21);
    k.box(0.6, 0.85, 0.06, C.door, 0, 0.24, 1.22);
    k.box(0.8, 0.08, 0.08, C.ochre, 0, 1.1, 1.24);
    k.roof(4.1, 3.0, 1.45, C.shingle, 0, 1.35, 0);
    k.roof(4.15, 3.05, 0.2, C.turfDark, 0, 1.31, 0);
    // crossed dragon boards at the gables
    for (const x of [-2.05, 2.05]) {
      k.box(0.08, 0.9, 0.08, C.ochre, x, 2.4, 0.14, 0, 0.6);
      k.box(0.08, 0.9, 0.08, C.ochre, x, 2.4, -0.14, 0, -0.6);
    }
    // painted shields on the front wall
    for (const [x, c] of [[-1.2, C.sail], [-0.6, C.gold], [0.6, C.blue], [1.2, C.sail]])
      k.add(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 8), c, x, 0.85, 1.25, 0, Math.PI / 2);
    windows(g, [[0.32, 0.25, -1.75, 0.6, 0.4, Math.PI / 2], [0.32, 0.25, 1.75, 0.6, -0.4, Math.PI / 2]]);
    return { k, g, chimney: [0.9, 2.3, -0.3], height: 2.8 };
  },
  woodcutter() {
    const k = new Kit(), g = new Kit();
    k.box(1.25, 0.8, 1.1, C.ochre, -0.3, 0, -0.35);
    k.box(0.3, 0.5, 0.05, C.door, -0.45, 0, 0.21);
    turfRoof(k, 1.45, 1.35, 0.55, 0.8, -0.3, -0.35);
    for (let i = 0; i < 3; i++) k.cyl(0.11, 0.11, 0.8, C.wood, 0.55, 0.11 + i * 0.0, 0.25 + i * 0.22, 6, 0, Math.PI / 2);
    k.cyl(0.11, 0.11, 0.8, C.wood, 0.55, 0.3, 0.36, 6, 0, Math.PI / 2);
    k.cyl(0.16, 0.18, 0.25, C.woodLight, 0.1, 0, 0.65, 7);
    k.box(0.04, 0.35, 0.04, C.timberDark, 0.1, 0.25, 0.65, 0, 0, 0.5);
    k.box(0.14, 0.08, 0.03, C.metal, 0.2, 0.5, 0.65);
    windows(g, [[0.26, 0.22, 0.05, 0.38, 0.21]]);
    return { k, g, chimney: null, height: 1.4 };
  },
  forager() {
    const k = new Kit(), g = new Kit();
    k.box(1.2, 0.75, 1.1, C.woodLight, 0.2, 0, -0.35);
    k.box(0.3, 0.5, 0.05, C.door, 0.05, 0, 0.21);
    turfRoof(k, 1.4, 1.35, 0.55, 0.75, 0.2, -0.35);
    for (const [x, z] of [[-0.55, 0.45], [-0.25, 0.65], [-0.6, 0.0]]) {
      k.cyl(0.16, 0.12, 0.2, C.straw, x, 0, z, 7);
      k.ico(0.11, C.berry, x, 0.2, z, [1, 0.5, 1]);
    }
    windows(g, [[0.26, 0.22, 0.48, 0.36, 0.21]]);
    return { k, g, chimney: null, height: 1.3 };
  },
  fisher() {
    const k = new Kit(), g = new Kit();
    k.box(1.3, 0.8, 1.15, 0x6c7f8c, -0.25, 0, -0.3);
    k.box(0.3, 0.5, 0.05, C.door, -0.45, 0, 0.28);
    k.roof(1.5, 1.4, 0.6, C.slate, -0.25, 0.8, -0.3);
    // drying rack with fish
    for (const x of [0.35, 0.85]) k.box(0.06, 0.8, 0.06, C.timberDark, x, 0, 0.55);
    k.box(0.6, 0.05, 0.05, C.timberDark, 0.6, 0.78, 0.55);
    for (let i = 0; i < 4; i++) k.box(0.05, 0.22, 0.09, C.fish, 0.42 + i * 0.13, 0.52, 0.55);
    k.box(0.9, 0.12, 0.35, C.timber, 0.3, 0, -0.75, 0.3);
    windows(g, [[0.26, 0.22, 0.05, 0.4, 0.28]]);
    return { k, g, chimney: null, height: 1.4 };
  },
  quarry() {
    const k = new Kit(), g = new Kit();
    k.box(1.6, 0.45, 0.25, C.stone, 0, 0, -0.65);
    k.box(0.25, 0.45, 1.1, C.stone, -0.7, 0, -0.2);
    k.box(1.2, 0.08, 1.0, C.timber, -0.1, 0.9, -0.3);
    for (const [x, z] of [[-0.65, 0.15], [0.45, 0.15], [0.45, -0.7]]) k.box(0.08, 0.9, 0.08, C.timberDark, x, 0, z);
    for (const [x, z, s] of [[0.4, 0.55, 0.28], [0.7, 0.4, 0.22], [0.55, 0.3, 0.2]]) k.box(s, s * 0.8, s, C.stoneLight, x, 0, z, x * 2);
    k.box(0.06, 1.5, 0.06, C.timberDark, 0.75, 0, -0.4);
    k.box(0.9, 0.06, 0.06, C.timberDark, 0.4, 1.45, -0.4);
    k.box(0.02, 0.5, 0.02, C.rope, 0.05, 0.95, -0.4);
    return { k, g, chimney: null, height: 1.6 };
  },
  sawmill() {
    const k = new Kit(), g = new Kit();
    k.box(2.8, 0.12, 1.8, C.timber, 0, 0, 0);
    for (const [x, z] of [[-1.3, 0.8], [1.3, 0.8], [-1.3, -0.8], [1.3, -0.8]]) k.box(0.1, 1.0, 0.1, C.timberDark, x, 0.12, z);
    turfRoof(k, 2.95, 1.95, 0.6, 1.12);
    k.box(1.6, 0.4, 0.35, C.wood, -0.2, 0.12, 0);
    k.cyl(0.13, 0.13, 1.4, C.woodLight, -0.2, 0.58, 0, 6, 0, Math.PI / 2);
    k.add(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 10), C.metal, 0.5, 0.6, 0, 0, Math.PI / 2);
    for (let i = 0; i < 4; i++) k.box(1.0, 0.07, 0.3, C.woodLight, 0.85, 0.12 + i * 0.07, 0.55 + (i % 2) * 0.03);
    windows(g, []);
    return { k, g, chimney: null, height: 1.7 };
  },
  farm() {
    const k = new Kit(), g = new Kit();
    k.box(2.6, 0.15, 1.7, C.stoneDark, 0, 0, 0);
    k.box(2.4, 1.0, 1.45, C.falu, 0, 0.15, 0);
    k.box(0.7, 0.75, 0.05, C.faluDark, 0, 0.15, 0.74);
    k.box(0.06, 0.95, 0.06, C.trim, 0, 0.15, 0.77, 0, 0, 0.75);
    k.box(0.06, 0.95, 0.06, C.trim, 0, 0.15, 0.77, 0, 0, -0.75);
    k.roof(2.65, 1.85, 1.0, C.shingle, 0, 1.15, 0);
    for (const x of [-1.2, 1.2]) k.box(0.07, 1.0, 0.07, C.trim, x, 0.15, 0.73);
    windows(g, [[0.3, 0.25, -0.8, 0.55, 0.735], [0.3, 0.25, 0.8, 0.55, 0.735]]);
    return { k, g, chimney: null, height: 2.2 };
  },
  bakehouse() {
    const k = new Kit(), g = new Kit();
    k.box(1.6, 0.9, 1.45, C.stoneLight, 0, 0, -0.1);
    k.box(0.32, 0.55, 0.05, C.door, -0.35, 0, 0.64);
    turfRoof(k, 1.85, 1.75, 0.65, 0.9, 0, -0.1);
    k.box(0.36, 0.95, 0.36, C.stone, 0.5, 1.0, -0.35);
    for (let i = 0; i < 3; i++) k.ico(0.1, C.bread, 0.45 + i * 0.16, 0.42, 0.72, [1.3, 0.7, 0.9]);
    k.box(0.6, 0.06, 0.2, C.timber, 0.6, 0.35, 0.72);
    windows(g, [[0.34, 0.26, 0.3, 0.38, 0.64]]);
    return { k, g, chimney: [0.5, 2.0, -0.35], height: 2.0 };
  },
  storehouse() {
    const k = new Kit(), g = new Kit();
    for (const [x, z] of [[-0.55, 0.5], [0.55, 0.5], [-0.55, -0.5], [0.55, -0.5]]) {
      k.box(0.12, 0.42, 0.12, C.timberDark, x, 0, z);
      k.box(0.24, 0.08, 0.24, C.stone, x, 0.42, z);
    }
    k.box(1.3, 0.55, 1.2, C.timber, 0, 0.5, 0);
    k.box(1.55, 0.55, 1.45, C.timberDark, 0, 1.05, 0);
    k.box(0.32, 0.45, 0.05, C.door, 0, 0.55, 0.61);
    turfRoof(k, 1.8, 1.7, 0.6, 1.6, 0, 0, C.turfDark);
    for (let i = 0; i < 3; i++) k.box(0.5, 0.06, 0.18, C.wood, 0, 0.08 + i * 0.15, 0.95 - i * 0.14);
    windows(g, []);
    return { k, g, chimney: null, height: 2.3 };
  },
  pole() {
    const k = new Kit(), g = new Kit();
    k.cyl(0.07, 0.08, 2.6, C.trim, 0, 0, 0, 6);
    k.box(1.0, 0.07, 0.07, C.trim, 0, 1.9, 0);
    k.add(new THREE.TorusGeometry(0.28, 0.07, 5, 10), C.green, -0.42, 1.62, 0);
    k.add(new THREE.TorusGeometry(0.28, 0.07, 5, 10), C.green, 0.42, 1.62, 0);
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2;
      k.ico(0.06, [C.berry, C.gold, C.trim, C.blue][i % 4], Math.cos(a) * 0.12, 2.45 - i * 0.05, Math.sin(a) * 0.12);
    }
    k.cone(0.16, 0.3, C.green, 0, 2.55, 0);
    k.box(0.5, 0.06, 0.5, C.stoneDark, 0, 0, 0);
    return { k, g, chimney: null, height: 2.9 };
  },
};

const cache = {};
export function buildingModel(kind) {
  if (!cache[kind]) {
    const m = B[kind]();
    cache[kind] = { body: m.k.geometry(), glow: m.g.pos.length ? m.g.geometry() : null, chimney: m.chimney, height: m.height };
  }
  return cache[kind];
}

let scaffold;
export function scaffoldGeo() {
  if (scaffold) return scaffold;
  const k = new Kit();
  for (const [x, z] of [[-0.8, 0.7], [0.8, 0.7], [-0.8, -0.7], [0.8, -0.7]]) k.box(0.07, 1.3, 0.07, C.woodLight, x, 0, z);
  k.box(1.7, 0.05, 0.07, C.woodLight, 0, 0.65, 0.7); k.box(1.7, 0.05, 0.07, C.woodLight, 0, 0.65, -0.7);
  k.box(0.07, 0.05, 1.5, C.woodLight, 0.8, 1.2, 0); k.box(0.07, 0.05, 1.5, C.woodLight, -0.8, 1.2, 0);
  for (let i = 0; i < 3; i++) k.box(0.8, 0.06, 0.18, C.woodLight, 0.3, i * 0.06, 1.0 + (i % 2) * 0.05);
  k.cyl(0.08, 0.08, 0.7, C.wood, -0.4, 0.08, 1.05, 6, 0, Math.PI / 2);
  return (scaffold = k.geometry());
}

// ---- nature ----
export function natureGeos() {
  const pineTrunk = new Kit().cyl(0.05, 0.08, 0.45, C.timber, 0, 0, 0, 5).geometry();
  const pc = new Kit();
  pc.cone(0.44, 0.62, 0xffffff, 0, 0.3, 0, 7).cone(0.34, 0.52, 0xffffff, 0, 0.62, 0, 7).cone(0.22, 0.42, 0xffffff, 0, 0.92, 0, 7);
  const birchTrunk = new Kit().cyl(0.04, 0.06, 0.75, 0xe8e4da, 0, 0, 0, 5).box(0.09, 0.03, 0.09, 0x333333, 0, 0.3, 0).box(0.09, 0.03, 0.09, 0x333333, 0, 0.52, 0).geometry();
  const bc = new Kit();
  bc.ico(0.34, 0xffffff, 0, 0.95, 0, [1, 1.25, 1]).ico(0.22, 0xffffff, 0.18, 0.78, 0.05, [1, 1.1, 1]);
  const rock = new Kit().add(new THREE.DodecahedronGeometry(0.36, 0), 0xffffff, 0, 0.16, 0, 0, 0, 0, [1.1, 0.7, 0.95])
    .add(new THREE.DodecahedronGeometry(0.2, 0), 0xffffff, 0.25, 0.1, 0.18, 0.7, 0.3, 0, [1, 0.8, 1]).geometry();
  const bush = new Kit().ico(0.24, 0x4e7a3a, 0, 0.18, 0, [1.2, 0.85, 1.1]).ico(0.16, 0x5d8a44, 0.16, 0.14, 0.1).geometry();
  const bk = new Kit();
  for (const [x, y, z] of [[0.12, 0.3, 0.12], [-0.15, 0.26, 0.1], [0.05, 0.36, -0.12], [0.2, 0.18, -0.08], [-0.08, 0.2, 0.22]]) bk.ico(0.045, C.berry, x, y, z);
  const field = new Kit().box(0.94, 0.04, 0.94, 0xffffff, 0, 0, 0).geometry();
  const tk = new Kit();
  for (const [x, z] of [[-0.28, -0.28], [0, -0.3], [0.28, -0.26], [-0.3, 0], [0.02, 0.02], [0.3, 0.02], [-0.26, 0.28], [0.02, 0.3], [0.3, 0.27]])
    tk.cone(0.07, 0.45, 0xffffff, x, 0, z, 4);
  return { pineTrunk, pineCrown: pc.geometry(), birchTrunk, birchCrown: bc.geometry(), rock, bush, berries: bk.geometry(), field, tufts: tk.geometry() };
}

// ---- people ----
export function villagerGeos() {
  const body = new Kit().cyl(0.085, 0.13, 0.3, 0xffffff, 0, 0.02, 0, 7).box(0.06, 0.08, 0.05, 0x3a2a20, -0.05, 0, 0).box(0.06, 0.08, 0.05, 0x3a2a20, 0.05, 0, 0).geometry();
  const head = new Kit().ico(0.085, 0xffffff, 0, 0.4, 0, null, 1).geometry();
  const hat = new Kit().cone(0.088, 0.13, 0xffffff, 0, 0.44, -0.01, 7).ico(0.03, 0xf3efe6, 0, 0.58, -0.01).geometry();
  const carry = new Kit().box(0.16, 0.12, 0.12, 0xffffff, 0, 0.24, 0.14).geometry();
  return { body, head, hat, carry };
}

export function shipGeo() {
  const k = new Kit();
  k.box(2.6, 0.32, 0.7, C.timber, 0, -0.05, 0);
  k.box(2.2, 0.12, 0.8, C.timberDark, 0, 0.25, 0);
  for (const s of [-1, 1]) {
    k.box(0.5, 0.25, 0.5, C.timber, s * 1.4, 0.0, 0, 0, 0, s * -0.5);
    k.box(0.12, 0.7, 0.12, C.timberDark, s * 1.62, 0.25, 0, 0, 0, s * -0.35);
    k.ico(0.1, C.ochre, s * 1.78, 0.95, 0);
  }
  for (let i = -3; i <= 3; i++) k.add(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 8), [C.sail, C.gold, C.blue][(i + 3) % 3], i * 0.3, 0.3, 0.43, 0, Math.PI / 2);
  k.cyl(0.04, 0.05, 2.0, C.timberDark, 0, 0.3, 0);
  k.box(0.06, 0.06, 1.5, C.timberDark, 0, 2.0, 0);
  for (let i = 0; i < 5; i++) k.box(0.04, 1.1 / 5, 1.4, i % 2 ? C.sailW : C.sail, 0.05, 0.85 + i * (1.1 / 5), 0);
  return k.geometry();
}

export function thumbnailKinds() { return Object.keys(B); }
