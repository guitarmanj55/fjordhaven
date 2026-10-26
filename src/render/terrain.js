// Ground, the mountains and sea beyond the map, and the water. Paths are painted into the grass from wear.
import * as THREE from '../../vendor/three.module.min.js';
import { N } from '../sim/data.js';
import { V, heightAt } from '../sim/map.js';
import { hash01 } from '../sim/rng.js';
import { fbm } from '../sim/noise.js';

const col = h => new THREE.Color(h);
const GRASS = [col(0x86b85a), col(0x6aa84f), col(0xa9a24c), col(0x8c8f6a)];
const SAND = col(0xd8c99b), SEABED = col(0x2f5d6b), ROCK = col(0x7d7f80), ROCK_DARK = col(0x5d6062), SNOW = col(0xf2f5f8);
const DIRT = col(0x9a7b55), DIRT_WINTER = col(0x8d8274), COBBLE = col(0xa39a8c), SOIL = col(0x6e4f33), YARD = col(0x857258);
const tmp = new THREE.Color(), tmp2 = new THREE.Color();
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const SKIRT = 26;

export class Terrain {
  constructor(scene, w) {
    this.scene = scene;
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.build(w);
  }

  build(w) {
    this.dispose();
    this.seed = w.seed;
    const pos = new Float32Array(V * V * 3), color = new Float32Array(V * V * 3);
    this.jit = new Float32Array(V * V * 2);
    this.tone = new Float32Array(V * V);
    for (let z = 0; z < V; z++) for (let x = 0; x < V; x++) {
      const v = z * V + x, edge = x === 0 || z === 0 || x === N || z === N;
      this.jit[v * 2] = edge ? 0 : (hash01(x, z, 5) - 0.5) * 0.36;
      this.jit[v * 2 + 1] = edge ? 0 : (hash01(x, z, 6) - 0.5) * 0.36;
      this.tone[v] = fbm(w.seed + 77, x * 0.15, z * 0.15, 2) * 0.12 + (hash01(x, z, 8) - 0.5) * 0.06;
      pos[v * 3] = x + this.jit[v * 2]; pos[v * 3 + 2] = z + this.jit[v * 2 + 1];
    }
    const index = [];
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const a = z * V + x, b = a + 1, c = a + V, d = c + 1;
      if ((x + z) % 2) index.push(a, c, b, b, c, d); else index.push(a, c, d, a, d, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(color, 3));
    g.setIndex(index);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
    this.scene.add(this.mesh);
    this.buildSkirt(w);
    this.buildWater();
    this.updateHeights(w);
  }

  buildSkirt(w) {
    const lo = -SKIRT, hi = N + SKIRT, S = hi - lo + 1;
    const pos = new Float32Array(S * S * 3), color = new Float32Array(S * S * 3), h = new Float32Array(S * S);
    for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
      const wx = x + lo, wz = z + lo, v = z * S + x;
      const inside = wx >= 0 && wz >= 0 && wx <= N && wz <= N;
      let y = inside ? w.h[wz * V + wx] : heightAt(w.seed, wx, wz);
      // the far ring rises into peaks so the world has a horizon
      const out = Math.max(0, -wx - 6, wx - N - 6, -wz - 6, wz - N - 6);
      if (!inside && wx > 8) y += out * out * 0.04 * (0.6 + hash01(wx, wz, 4) * 0.5);
      const edge = inside;
      pos[v * 3] = wx + (edge ? 0 : (hash01(wx, wz, 5) - 0.5) * 0.5);
      pos[v * 3 + 1] = y; h[v] = y;
      pos[v * 3 + 2] = wz + (edge ? 0 : (hash01(wx, wz, 6) - 0.5) * 0.5);
    }
    const index = [];
    for (let z = 0; z < S - 1; z++) for (let x = 0; x < S - 1; x++) {
      const wx = x + lo, wz = z + lo;
      if (wx >= 0 && wz >= 0 && wx < N && wz < N) continue;
      const a = z * S + x, b = a + 1, c = a + S, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(color, 3));
    g.setIndex(index);
    this.skirtH = h; this.skirtS = S; this.skirtLo = lo;
    this.skirt = new THREE.Mesh(g, this.mat);
    this.skirt.receiveShadow = true;
    this.scene.add(this.skirt);
  }

  buildWater() {
    const g = new THREE.PlaneGeometry(N + SKIRT * 2 + 40, N + SKIRT * 2 + 40, 70, 70);
    g.rotateX(-Math.PI / 2);
    g.translate(N / 2, -0.04, N / 2);
    this.waterBase = g.attributes.position.array.slice();
    this.waterMat = new THREE.MeshPhongMaterial({ color: 0x3f7f9a, transparent: true, opacity: 0.84, flatShading: true, shininess: 70, specular: 0x8fb8c8 });
    this.water = new THREE.Mesh(g, this.waterMat);
    this.water.name = 'water';
    this.water.receiveShadow = true;
    this.scene.add(this.water);
    const far = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2).translate(N / 2, -0.06, N / 2), this.waterMat);
    this.scene.add(far);
    this.farWater = far;
  }

  animateWater(t) {
    const p = this.water.geometry.attributes.position, a = p.array, b = this.waterBase;
    for (let i = 0; i < a.length; i += 3) {
      const x = b[i], z = b[i + 2];
      a[i + 1] = b[i + 1] + Math.sin(x * 0.7 + t * 1.1) * 0.05 + Math.sin(z * 0.9 - t * 0.8 + x * 0.3) * 0.04;
    }
    p.needsUpdate = true;
    this.water.geometry.computeVertexNormals();
  }

  updateHeights(w) {
    const p = this.geo.attributes.position.array;
    for (let v = 0; v < V * V; v++) p[v * 3 + 1] = w.h[v];
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
    this.ver = w.terrainVer;
  }

  // env: { season, blend (0..1 from the previous season), snow }
  updateColors(w, env) {
    const grass = tmp2.copy(GRASS[(env.season + 3) % 4]).lerp(GRASS[env.season], env.blend);
    const g = grass.clone();
    const c = this.geo.attributes.color.array;
    for (let z = 0; z < V; z++) for (let x = 0; x < V; x++) {
      const v = z * V + x;
      let wear = 0, field = 0, built = 0, n = 0;
      for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) {
        const tx = x + dx, tz = z + dz;
        if (tx < 0 || tz < 0 || tx >= N || tz >= N) continue;
        const i = tz * N + tx;
        wear += Math.min(1.2, w.wear[i]); field += w.field[i] ? 1 : 0; built += w.occ[i] ? 1 : 0; n++;
      }
      wear /= n; field /= n; built /= n;
      this.groundColor(tmp, w.h[v], this.tone[v], g, env, wear, field, built, slopeAt(w.h, x, z));
      c[v * 3] = tmp.r; c[v * 3 + 1] = tmp.g; c[v * 3 + 2] = tmp.b;
    }
    this.geo.attributes.color.needsUpdate = true;
    if (this.skirtSeason !== env.season || Math.abs((this.skirtSnow ?? -1) - env.snow) > 0.04 || Math.abs((this.skirtBlend ?? -1) - env.blend) > 0.1) {
      this.skirtSeason = env.season; this.skirtSnow = env.snow; this.skirtBlend = env.blend;
      const S = this.skirtS, sc = this.skirt.geometry.attributes.color.array, h = this.skirtH;
      for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
        const v = z * S + x;
        const sl = x > 0 && z > 0 && x < S - 1 && z < S - 1 ? Math.max(Math.abs(h[v + 1] - h[v - 1]), Math.abs(h[v + S] - h[v - S])) / 2 : 0;
        this.groundColor(tmp, h[v], hash01(x, z, 9) * 0.1 - 0.05, g, env, 0, 0, 0, sl);
        sc[v * 3] = tmp.r; sc[v * 3 + 1] = tmp.g; sc[v * 3 + 2] = tmp.b;
      }
      this.skirt.geometry.attributes.color.needsUpdate = true;
    }
    this.waterMat.color.setHex(env.season === 3 ? 0x5a7684 : 0x3f7f9a).lerp(tmp.setHex(0x5a7684), env.season === 0 ? env.snow : 0);
  }

  groundColor(out, h, tone, grass, env, wear, field, built, slope) {
    if (h < 0) out.copy(SAND).lerp(SEABED, Math.min(1, -h / 2));
    else if (h < 0.3) out.copy(SAND);
    else out.copy(grass);
    // rock on steep or high ground, snow on the peaks
    const rock = Math.max(sm(0.7, 1.3, slope), sm(2.6, 3.6, h));
    if (rock > 0 && h >= 0) out.lerp(slope > 1.6 ? ROCK_DARK : ROCK, rock);
    out.offsetHSL(0, 0, tone);
    if (field > 0) out.lerp(SOIL, Math.min(1, field * 1.4));
    if (built > 0) out.lerp(YARD, Math.min(1, built * 1.2));
    const t1 = sm(0.08, 0.55, wear), t2 = sm(0.72, 1.05, wear);
    if (t1 > 0 && h >= 0) out.lerp(env.season === 3 ? DIRT_WINTER : DIRT, t1 * 0.9).lerp(COBBLE, t2 * 0.85);
    let snow = env.snow * (1 - t1 * 0.6) * (h < 0.05 ? 0.3 : 1) * (1 - sm(1.2, 1.9, slope) * 0.7);
    snow = Math.max(snow, sm(4.2, 6, h) * (1 - sm(1.4, 2.2, slope) * 0.5));
    if (h >= -0.05 && snow > 0) out.lerp(SNOW, Math.min(1, snow));
    return out;
  }

  dispose() {
    for (const m of [this.mesh, this.skirt, this.water, this.farWater]) if (m) { this.scene.remove(m); m.geometry.dispose(); }
  }
}

function slopeAt(h, x, z) {
  const a = h[z * V + Math.max(0, x - 1)], b = h[z * V + Math.min(N, x + 1)];
  const c = h[Math.max(0, z - 1) * V + x], d = h[Math.min(N, z + 1) * V + x];
  return Math.max(Math.abs(a - b), Math.abs(c - d)) / 2 * 2;
}
