// WebAudio synth: a bed of wind and water, plus small effects. iOS needs the context made inside a tap.
let ctx = null, master = null, bed = null, on = true, lastHammer = 0;

export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = on ? 0.6 : 0; master.connect(ctx.destination);
  // looping noise through a slow low-pass: wind and waves
  const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { last = last * 0.96 + (Math.random() * 2 - 1) * 0.04; d[i] = last * 6; }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
  bed = ctx.createGain(); bed.gain.value = 0.12;
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.12; lg.gain.value = 300;
  lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
  src.connect(lp); lp.connect(bed); bed.connect(master); src.start();
}

export function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
export function setOn(v) { on = v; if (master) master.gain.value = v ? 0.6 : 0; }
export function isOn() { return on; }
export function setWind(v) { if (bed) bed.gain.value = 0.06 + v * 0.18; }

function tone(f, dur, type = 'sine', vol = 0.2, at = 0, slide = 0) {
  if (!ctx || !on) return;
  const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}

function click(vol = 0.2, f = 900, dur = 0.07) {
  if (!ctx || !on) return;
  const t = ctx.currentTime, len = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const s = ctx.createBufferSource(); s.buffer = buf;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f;
  const g = ctx.createGain(); g.gain.value = vol;
  s.connect(bp); bp.connect(g); g.connect(master); s.start(t);
}

export const sfx = {
  tap() { tone(520, 0.08, 'triangle', 0.1); },
  place() { click(0.5, 300, 0.12); tone(160, 0.15, 'sine', 0.25, 0, -60); },
  deny() { tone(150, 0.18, 'square', 0.07); },
  hammer() { const n = performance.now(); if (n - lastHammer < 350) return; lastHammer = n; click(0.35, 1400, 0.05); },
  fell() { click(0.4, 260, 0.2); tone(110, 0.2, 'sine', 0.2, 0, -50); },
  built() { [523, 659, 784].forEach((f, i) => tone(f, 0.4, 'triangle', 0.14, i * 0.09)); },
  ship() { tone(130, 1.3, 'sawtooth', 0.09, 0, 15); tone(196, 1.1, 'sine', 0.1, 0.05); },
  landed() { [392, 494, 587].forEach((f, i) => tone(f, 0.35, 'sine', 0.12, i * 0.1)); },
  goal() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.5, 'triangle', 0.15, i * 0.11)); },
  bad() { tone(196, 0.5, 'sine', 0.12); tone(147, 0.7, 'sine', 0.12, 0.2); },
  won() { [523, 587, 659, 784, 880, 1047].forEach((f, i) => tone(f, 0.7, 'triangle', 0.14, i * 0.14)); },
  craft() { click(0.25, 700, 0.1); },
};
