// Turns a world into a string and back. Typed arrays travel as base64 of their bytes.
const TYPED = { h: Float32Array, type: Uint8Array, tree: Uint8Array, treeGrow: Float32Array, bush: Uint8Array, berries: Uint8Array,
  rock: Uint8Array, field: Int32Array, crop: Uint8Array, cropGrow: Float32Array, wear: Float32Array, occ: Int32Array, reserved: Int32Array };

function toB64(arr) {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(str, Type) {
  const s = atob(str), bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new Type(bytes.buffer);
}

export function serialize(w) {
  const out = {};
  for (const k in w) {
    if (k === 'msg' || k === 'events') continue;
    out[k] = TYPED[k] ? toB64(w[k]) : w[k];
  }
  out.log = w.log.slice(-40);
  return JSON.stringify(out);
}

export function deserialize(str) {
  const w = JSON.parse(str);
  if (w.schema !== 1) throw new Error('unknown save version');
  for (const k in TYPED) w[k] = fromB64(w[k], TYPED[k]);
  w.events = [];
  w.msg = (text, kind = 'info') => { w.log.push({ t: w.time, text, kind }); w.events.push({ e: 'msg', text, kind }); };
  w.terrainVer++; w.treeVer++;
  return w;
}
