export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const TAU = Math.PI * 2;
export function wrapAngle(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
export function angleDiff(a, b) { return wrapAngle(b - a); }
export function len(x, z) { return Math.hypot(x, z); }
export function dist(ax, az, bx, bz) { return Math.hypot(bx - ax, bz - az); }
export function approach(v, target, maxDelta) {
  if (v < target) return Math.min(v + maxDelta, target);
  return Math.max(v - maxDelta, target);
}
export function damp(a, b, lambda, dt) { return lerp(a, b, 1 - Math.exp(-lambda * dt)); }
export function hashNoise(x) { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
// smooth 1D noise in [-1, 1]
export function noise1(t) {
  const i = Math.floor(t), f = t - i;
  const a = hashNoise(i) * 2 - 1, b = hashNoise(i + 1) * 2 - 1;
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}
export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
export function fmtMoney(n) { return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US'); }
export function fmtTime(sec) {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
