// Orbit camera plus touch/mouse input: one finger pans, two fingers pinch to zoom and twist to turn.
import * as THREE from '../../vendor/three.module.min.js';
import { N } from '../sim/data.js';

export class Cam {
  constructor(canvas) {
    this.canvas = canvas;
    this.cam = new THREE.PerspectiveCamera(42, 1, 0.5, 500);
    this.x = 24; this.z = 32; this.yaw = 0.55; this.pitch = 0.92; this.dist = 24;
    this.tx = this.x; this.tz = this.z; this.tdist = this.dist; this.tyaw = this.yaw;
    this.ray = new THREE.Raycaster();
    this.pointers = new Map();
    this.onTap = null;
    this.bind();
  }

  focus(x, z, dist) { this.tx = x; this.tz = z; if (dist) this.tdist = dist; }
  resize(w, h) { this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }

  update(dt, getH) {
    const k = 1 - Math.exp(-dt * 10);
    this.x += (this.tx - this.x) * k; this.z += (this.tz - this.z) * k;
    this.dist += (this.tdist - this.dist) * k;
    let dy = this.tyaw - this.yaw; this.yaw += dy * k;
    const y = getH ? Math.max(0, getH(this.x, this.z)) : 0;
    const cp = Math.cos(this.pitch);
    this.cam.position.set(this.x + Math.sin(this.yaw) * cp * this.dist, y + Math.sin(this.pitch) * this.dist, this.z + Math.cos(this.yaw) * cp * this.dist);
    this.cam.lookAt(this.x, y, this.z);
    this.cam.updateMatrixWorld();
  }

  pan(dx, dy) {
    const s = this.dist * 0.0021;
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw), fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    this.tx -= (rx * dx - fx * dy) * s; this.tz -= (rz * dx - fz * dy) * s;
    this.tx = Math.min(N - 3, Math.max(3, this.tx)); this.tz = Math.min(N - 3, Math.max(3, this.tz));
    this.x = this.tx; this.z = this.tz;
  }

  zoom(f) { this.tdist = Math.min(46, Math.max(9, this.tdist * f)); this.dist = this.tdist; }

  // Ground point under a screen position, or null.
  pick(sx, sy, meshes) {
    const r = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((sx - r.left) / r.width) * 2 - 1, -((sy - r.top) / r.height) * 2 + 1), this.cam);
    const hit = this.ray.intersectObjects(meshes, false)[0];
    return hit ? hit.point : null;
  }

  project(x, y, z) {
    const r = this.canvas.getBoundingClientRect(), v = new THREE.Vector3(x, y, z).project(this.cam);
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, behind: v.z > 1 };
  }

  bind() {
    const c = this.canvas, P = this.pointers;
    c.addEventListener('pointerdown', e => {
      c.setPointerCapture(e.pointerId);
      P.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0, button: e.button });
      if (P.size === 2) this.pinch = this.pinchState();
      this.dragging = false;
    });
    c.addEventListener('pointermove', e => {
      const p = P.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY; p.moved += Math.abs(dx) + Math.abs(dy);
      if (P.size === 1) {
        if (p.button === 2 || e.shiftKey) { this.tyaw -= dx * 0.008; this.yaw = this.tyaw; this.pitch = Math.min(1.25, Math.max(0.5, this.pitch + dy * 0.005)); }
        else if (p.moved > 6) this.pan(dx, dy);
      } else if (P.size === 2 && this.pinch) {
        const s = this.pinchState();
        this.zoom(this.pinch.d / Math.max(20, s.d));
        let da = s.a - this.pinch.a; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
        this.tyaw = this.yaw = this.yaw - da;
        this.pan(s.mx - this.pinch.mx, s.my - this.pinch.my);
        this.pinch = s;
      }
    });
    const up = e => {
      const p = P.get(e.pointerId);
      if (!p) return;
      P.delete(e.pointerId);
      this.pinch = null;
      if (e.type === 'pointerup' && p.moved < 10 && performance.now() - p.t < 450 && p.button !== 2 && !P.size && this.onTap) this.onTap(e.clientX, e.clientY);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('wheel', e => { e.preventDefault(); this.zoom(e.deltaY > 0 ? 1.1 : 0.91); }, { passive: false });
    c.style.touchAction = 'none';
  }

  pinchState() {
    const [a, b] = [...this.pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }
}
