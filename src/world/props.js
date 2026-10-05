// Street furniture: destructible props (knock them flying) and fixed props (total your truck).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { SpatialHash } from './colliders.js';

// ---- prop modelling helpers: every part is coloured, made non-indexed and merged into one geometry per prop
function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  return g;
}
function part(geo, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = null) {
  if (s) geo.scale(s[0], s[1], s[2]);
  geo.rotateX(rx); geo.rotateY(ry); geo.rotateZ(rz); geo.translate(x, y, z);
  return colored(geo, hex);
}
const G = THREE;
const cyl = (rt, rb, h, seg = 16) => new G.CylinderGeometry(rt, rb, h, seg);
const box = (w, h, d) => new G.BoxGeometry(w, h, d);
const sph = (r, ws = 14, hs = 10) => new G.SphereGeometry(r, ws, hs);
const torus = (r, t, rs = 4, ts = 14) => new G.TorusGeometry(r, t, rs, ts);
/** Lumpy foliage clump: icosphere with per-vertex noise, slight flattening. */
function clump(r, seed, detail = 2) {
  const g = mergeVertices(new G.IcosahedronGeometry(r, detail)), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 0.82 + 0.22 * Math.sin(x * 3.1 + seed) * Math.cos(z * 2.7 + seed * 1.7) + 0.08 * Math.sin(y * 5.3 + seed * 2.1);
    p.setXYZ(i, x * n, y * n * 0.85, z * n);
  }
  g.deleteAttribute('normal'); g.computeVertexNormals();
  return g;
}
function lathe(points, seg = 24) { return new G.LatheGeometry(points.map(([x, y]) => new G.Vector2(x, y)), seg); }
function tube(points, r, seg = 20) { return new G.TubeGeometry(new G.CatmullRomCurve3(points.map(([x, y, z]) => new G.Vector3(x, y, z))), seg, r, 8, false); }
function extrude(shape, depth, bevel = 0.02) { const g = new G.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 12 }); g.translate(0, 0, -depth / 2); return g; }
const merge = (parts) => mergeGeometries(parts);

function hydrant() {
  const R = 0xd62828, D = 0x9f1d1d, B = 0xd8a93a, S = 0xc8c8c8, P = [];
  P.push(part(cyl(0.36, 0.38, 0.1), D, 0, 0.05, 0));
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; P.push(part(cyl(0.035, 0.035, 0.06, 4), S, Math.cos(a) * 0.31, 0.13, Math.sin(a) * 0.31)); }
  P.push(part(cyl(0.27, 0.29, 0.62, 12), R, 0, 0.41, 0));
  P.push(part(torus(0.29, 0.035, 6, 20), D, 0, 0.62, 0, Math.PI / 2));
  P.push(part(cyl(0.32, 0.3, 0.1), D, 0, 0.76, 0));
  P.push(part(new G.SphereGeometry(0.28, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), R, 0, 0.8, 0));
  P.push(part(cyl(0.06, 0.09, 0.1, 5), S, 0, 1.1, 0));
  for (const sx of [-1, 1]) { P.push(part(cyl(0.09, 0.1, 0.2), R, sx * 0.33, 0.55, 0, 0, 0, Math.PI / 2)); P.push(part(cyl(0.11, 0.11, 0.06, 6), B, sx * 0.45, 0.55, 0, 0, 0, Math.PI / 2)); }
  P.push(part(cyl(0.13, 0.14, 0.2), R, 0, 0.5, 0.32, Math.PI / 2)); P.push(part(cyl(0.15, 0.15, 0.07, 6), B, 0, 0.5, 0.45, Math.PI / 2));
  return merge(P);
}
function mailbox() {
  const BL = 0x2f5fbf, DK = 0x1f3f8f, W = 0xf2f2f2, P = [];
  const sh = new G.Shape(); sh.moveTo(-0.42, 0); sh.lineTo(-0.42, 0.75); sh.absarc(0, 0.75, 0.42, Math.PI, 0, true); sh.lineTo(0.42, 0); sh.lineTo(-0.42, 0);
  P.push(part(extrude(sh, 0.62, 0.03), BL, 0, 0.42, 0));
  P.push(part(box(0.7, 0.06, 0.04), DK, 0, 1.25, 0.33)); P.push(part(box(0.44, 0.1, 0.05), 0x222222, 0, 1.12, 0.33));
  P.push(part(box(0.86, 0.12, 0.66), W, 0, 0.9, 0));
  P.push(part(new G.CircleGeometry(0.12, 16), W, 0, 0.66, 0.35));
  for (const [x, z] of [[-0.35, -0.25], [0.35, -0.25], [-0.35, 0.25], [0.35, 0.25]]) P.push(part(box(0.08, 0.42, 0.08), 0x2a2a30, x, 0.21, z));
  P.push(part(box(0.12, 0.05, 0.08), 0xbbbbbb, 0.32, 0.95, 0.36));
  return merge(P);
}
function lamp() {
  const DG = 0x2f4a3a, BR = 0xd8b45a, GL = 0xfff1b8, P = [];
  P.push(part(lathe([[0.001, 0], [0.34, 0], [0.34, 0.12], [0.26, 0.2], [0.22, 0.55], [0.13, 0.85], [0.001, 0.85]], 10), DG));
  P.push(part(cyl(0.09, 0.12, 5.0, 8), DG, 0, 3.3, 0));
  for (const y of [1.0, 3.0, 5.4]) P.push(part(torus(0.12, 0.035, 6, 16), BR, 0, y, 0, Math.PI / 2));
  P.push(part(tube([[0, 5.6, 0], [0, 6.2, 0.2], [0, 6.25, 0.8], [0, 6.0, 1.3]], 0.05, 10), DG));
  P.push(part(cyl(0.07, 0.25, 0.18, 12), DG, 0, 5.82, 1.3));
  P.push(part(cyl(0.26, 0.18, 0.5, 8), GL, 0, 5.48, 1.3));
  P.push(part(new G.ConeGeometry(0.34, 0.3, 8), DG, 0, 6.05, 1.3));
  P.push(part(sph(0.06, 8, 6), BR, 0, 6.25, 1.3));
  return merge(P);
}
function bench() {
  const IRON = 0x2a2d33, WOOD = 0xa8693a, WOOD2 = 0x93592f, P = [];
  const side = new G.Shape(); side.moveTo(-0.28, 0); side.lineTo(-0.2, 0); side.lineTo(-0.12, 0.42); side.lineTo(0.2, 0.42); side.lineTo(0.26, 0); side.lineTo(0.34, 0); side.lineTo(0.28, 0.48); side.lineTo(-0.2, 0.5); side.lineTo(-0.36, 1.05); side.lineTo(-0.44, 1.02); side.lineTo(-0.3, 0.46); side.lineTo(-0.28, 0);
  for (const x of [-0.82, 0.82]) P.push(part(extrude(side, 0.06, 0.012), IRON, x, 0, 0, 0, Math.PI / 2));
  for (let k = 0; k < 4; k++) P.push(part(box(1.86, 0.05, 0.11), k % 2 ? WOOD : WOOD2, 0, 0.48, -0.2 + k * 0.135));
  for (let k = 0; k < 3; k++) P.push(part(box(1.86, 0.1, 0.04), k % 2 ? WOOD2 : WOOD, 0, 0.65 + k * 0.14, -0.24 - k * 0.05, -0.33));
  return merge(P);
}
function trash() {
  const G1 = 0x3f6b4f, G2 = 0x2d4f39, P = [];
  P.push(part(cyl(0.38, 0.33, 0.95, 20), G1, 0, 0.48, 0));
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; P.push(part(box(0.05, 0.8, 0.04), G2, Math.cos(a) * 0.37, 0.5, Math.sin(a) * 0.37, 0, -a)); }
  for (const y of [0.12, 0.92]) P.push(part(torus(0.37, 0.03, 6, 24), G2, 0, y, 0, Math.PI / 2));
  P.push(part(new G.SphereGeometry(0.4, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), G1, 0, 0.9, 0, 0, 0, 0, [1, 0.5, 1]));
  P.push(part(box(0.3, 0.08, 0.06), 0x222222, 0, 1.0, 0.33));
  return merge(P);
}
function tree(seed = 1) {
  const TR = 0x6b4a2b, L1 = 0x3e9a45, L2 = 0x57b84f, L3 = 0x2f7f3a, P = [];
  P.push(part(cyl(0.12, 0.22, 2.2, 10), TR, 0, 1.1, 0));
  P.push(part(cyl(0.05, 0.09, 1.1, 6), TR, 0.35, 2.2, 0, 0, 0, -0.7)); P.push(part(cyl(0.05, 0.08, 1.0, 6), TR, -0.3, 2.3, 0.15, 0.3, 0, 0.6));
  P.push(part(clump(1.15, seed), L1, 0, 2.95, 0));
  P.push(part(clump(0.8, seed + 1), L2, 0.62, 2.7, 0.25)); P.push(part(clump(0.75, seed + 2), L3, -0.6, 2.75, -0.2));
  P.push(part(clump(0.7, seed + 3), L2, 0.1, 3.6, -0.3)); P.push(part(clump(0.6, seed + 4), L1, -0.2, 2.6, 0.65));
  // grate
  for (const [x, z, w, d] of [[0, 0.62, 1.3, 0.06], [0, -0.62, 1.3, 0.06], [0.62, 0, 0.06, 1.3], [-0.62, 0, 0.06, 1.3]]) P.push(part(box(w, 0.05, d), 0x3a3f47, x, 0.03, z));
  return merge(P);
}
function cone() {
  const O = 0xff6a1a, W = 0xf4f4f4, P = [];
  P.push(part(box(0.75, 0.06, 0.75), 0x222222, 0, 0.03, 0));
  P.push(part(cyl(0.05, 0.27, 0.86, 18), O, 0, 0.49, 0));
  P.push(part(cyl(0.18, 0.205, 0.12, 18), W, 0, 0.5, 0)); P.push(part(cyl(0.11, 0.13, 0.09, 18), W, 0, 0.72, 0));
  return merge(P);
}
function barrel() {
  const O = 0xff7a1a, W = 0xf4f4f4, P = [];
  P.push(part(cyl(0.48, 0.5, 1.1, 20), O, 0, 0.55, 0));
  for (const y of [0.32, 0.72]) P.push(part(cyl(0.505, 0.505, 0.14, 20), W, 0, y, 0));
  for (const y of [0.1, 1.0]) P.push(part(torus(0.49, 0.03, 6, 24), 0xd45a10, 0, y, 0, Math.PI / 2));
  P.push(part(cyl(0.44, 0.44, 0.03, 20), 0xd45a10, 0, 1.11, 0)); P.push(part(cyl(0.06, 0.06, 0.05, 8), 0x888888, 0.25, 1.13, 0));
  return merge(P);
}
function cart() {
  const BODY = 0xf2f2f2, RED = 0xd62828, YEL = 0xf5c518, P = [];
  P.push(part(box(1.6, 0.85, 0.9), BODY, 0, 0.95, 0)); P.push(part(box(1.66, 0.12, 0.96), 0xb0b0b0, 0, 1.43, 0));
  P.push(part(box(1.62, 0.18, 0.92), RED, 0, 0.75, 0));
  for (const x of [-0.6, 0.6]) { P.push(part(cyl(0.3, 0.3, 0.08, 16), 0x222222, x, 0.32, 0.5, Math.PI / 2)); P.push(part(cyl(0.12, 0.12, 0.1, 10), 0xcccccc, x, 0.32, 0.51, Math.PI / 2)); }
  P.push(part(box(0.06, 0.6, 0.06), 0x888888, -0.75, 0.3, -0.35)); P.push(part(tube([[0.8, 1.2, -0.3], [1.1, 1.25, -0.3], [1.2, 1.1, -0.3]], 0.025, 8), 0x888888));
  P.push(part(cyl(0.025, 0.025, 1.4, 6), 0xdddddd, 0, 2.1, 0));
  // striped umbrella: alternating wedges
  for (let k = 0; k < 8; k++) P.push(part(new G.ConeGeometry(1.05, 0.45, 1, 1, true, (k / 8) * Math.PI * 2, Math.PI / 4), k % 2 ? RED : YEL, 0, 2.95, 0));
  for (const [x, c] of [[-0.3, RED], [-0.15, YEL], [0.35, 0x6b3a1a]]) P.push(part(cyl(0.05, 0.05, 0.22, 8), c, x, 1.6, 0.2));
  return merge(P);
}
function planter() {
  const C = 0xb8b2a8, SOIL = 0x5a3b22, P = [];
  P.push(part(box(1.25, 0.12, 1.25), 0x9e988e, 0, 0.06, 0));
  P.push(part(box(1.15, 0.55, 1.15), C, 0, 0.39, 0)); P.push(part(box(1.25, 0.08, 1.25), 0xcfcac2, 0, 0.7, 0));
  P.push(part(box(1.0, 0.05, 1.0), SOIL, 0, 0.72, 0));
  const cols = [0xff5c8a, 0xffd23f, 0xc86bff, 0xff8a3d, 0xffffff];
  for (let k = 0; k < 6; k++) { const a = k * 2.4, r = 0.18 + (k % 3) * 0.12; P.push(part(clump(0.2, k, 1), 0x3f9f4f, Math.cos(a) * r, 0.86, Math.sin(a) * r)); P.push(part(sph(0.1, 6, 4), cols[k % cols.length], Math.cos(a) * r, 1.02, Math.sin(a) * r)); }
  return merge(P);
}
function sign() {
  const P = [];
  P.push(part(cyl(0.05, 0.05, 2.6, 8), 0x9aa0a6, 0, 1.3, 0));
  P.push(part(cyl(0.4, 0.4, 0.04, 8), 0xffffff, 0, 2.45, 0.03, Math.PI / 2, 0, Math.PI / 8));
  P.push(part(cyl(0.36, 0.36, 0.05, 8), 0xd62828, 0, 2.45, 0.04, Math.PI / 2, 0, Math.PI / 8));
  for (let k = 0; k < 4; k++) P.push(part(box(0.09, 0.16, 0.02), 0xffffff, -0.18 + k * 0.12, 2.45, 0.075));
  P.push(part(box(0.12, 0.06, 0.08), 0x777777, 0, 2.15, 0.04));
  return merge(P);
}
function bigtree() {
  const TR = 0x5b3d22, P = [], greens = [0x2e7d32, 0x43a047, 0x388e3c, 0x4caf50, 0x2f6f35];
  P.push(part(cyl(0.5, 0.85, 4.4, 12), TR, 0, 2.2, 0));
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; P.push(part(new G.ConeGeometry(0.35, 1.4, 6), TR, Math.cos(a) * 0.75, 0.35, Math.sin(a) * 0.75, Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1)); }
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.4; P.push(part(cyl(0.14, 0.28, 2.6, 8), TR, Math.cos(a) * 0.9, 4.6, Math.sin(a) * 0.9, Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6)); }
  const spots = [[0, 6.6, 0, 3.0], [1.9, 6.0, 0.8, 2.2], [-1.8, 6.2, -0.7, 2.3], [0.6, 7.9, -1.2, 1.9], [-0.8, 7.6, 1.3, 1.9], [1.2, 5.4, -1.6, 1.7], [-1.3, 5.3, 1.7, 1.7], [0, 8.6, 0.2, 1.5]];
  spots.forEach(([x, y, z, r], k) => P.push(part(clump(r, k * 1.7, 2), greens[k % greens.length], x, y, z)));
  return merge(P);
}
function celltower() {
  const M = 0x9aa3ab, W = 0xeeeeee, P = [];
  P.push(part(box(3.0, 0.6, 3.0), 0x8d8d8d, 0, 0.3, 0));
  const H = 22, base = 1.3, top = 0.45, legs = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  const at = (y, sx, sz) => { const t = y / H, s = base + (top - base) * t; return [sx * s, y, sz * s]; };
  for (const [sx, sz] of legs) { const a = at(0.6, sx, sz), b = at(H, sx, sz); P.push(part(tube([a, b], 0.09, 2), M)); }
  for (let y = 0.6; y < H - 1; y += 2.2) for (let k = 0; k < 4; k++) {
    const [sx, sz] = legs[k], [tx, tz] = legs[(k + 1) % 4];
    P.push(part(tube([at(y, sx, sz), at(y + 2.2, tx, tz)], 0.035, 2), M)); P.push(part(tube([at(y + 2.2, sx, sz), at(y, tx, tz)], 0.035, 2), M));
    P.push(part(tube([at(y, sx, sz), at(y, tx, tz)], 0.04, 2), M));
  }
  P.push(part(box(2.4, 0.15, 2.4), M, 0, H - 2.5, 0)); P.push(part(box(2.6, 0.08, 2.6), M, 0, H - 1.6, 0));
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; P.push(part(box(0.35, 1.4, 0.12), W, Math.cos(a) * 1.15, H - 1.4, Math.sin(a) * 1.15, 0, -a + Math.PI / 2)); }
  P.push(part(new G.SphereGeometry(0.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), W, 0.8, H - 3.6, 0, 0, 0, -Math.PI / 2));
  P.push(part(cyl(0.05, 0.05, 2.5, 6), M, 0, H + 1.2, 0)); P.push(part(sph(0.16, 8, 6), 0xff2a2a, 0, H + 2.5, 0));
  return merge(P);
}
function statue() {
  const ST = 0xb9b4aa, ST2 = 0xa39e94, BUN = 0xe9b96e, SAU = 0xc8452c, MUS = 0xf5c518, P = [];
  P.push(part(box(3.6, 0.6, 3.6), ST2, 0, 0.3, 0)); P.push(part(box(3.0, 0.5, 3.0), ST, 0, 0.85, 0)); P.push(part(box(2.2, 1.6, 2.2), ST, 0, 1.9, 0));
  P.push(part(box(2.4, 0.2, 2.4), ST2, 0, 2.8, 0)); P.push(part(box(1.2, 0.5, 0.05), 0xc9a227, 0, 1.9, 1.11));
  const bun = new G.CapsuleGeometry(0.75, 3.2, 8, 16); P.push(part(bun, BUN, 0, 3.7, 0, 0, 0, Math.PI / 2, [1, 0.62, 1]));
  P.push(part(new G.CapsuleGeometry(0.42, 3.8, 8, 16), SAU, 0, 4.05, 0, 0, 0, Math.PI / 2));
  const pts = []; for (let k = 0; k <= 16; k++) pts.push([-1.7 + k * 0.21, 4.5, Math.sin(k * 1.2) * 0.22]);
  P.push(part(tube(pts, 0.07, 40), MUS));
  for (const sx of [-0.35, 0.35]) { P.push(part(sph(0.13, 10, 8), 0xffffff, sx, 4.3, 0.38)); P.push(part(sph(0.07, 8, 6), 0x111111, sx, 4.3, 0.49)); }
  return merge(P);
}
function fountain() {
  const ST = 0xc9c4ba, ST2 = 0xa8a397, WATER = 0x6fc6f2, P = [];
  P.push(part(lathe([[0.001, 0], [4.3, 0], [4.4, 0.15], [4.4, 0.75], [4.15, 0.85], [3.9, 0.8], [3.9, 0.3], [0.001, 0.3]], 40), ST));
  P.push(part(cyl(3.9, 3.9, 0.06, 40), WATER, 0, 0.62, 0));
  P.push(part(lathe([[0.001, 0.3], [0.7, 0.3], [0.55, 0.6], [0.45, 1.8], [0.6, 2.1], [0.001, 2.1]], 24), ST2));
  P.push(part(lathe([[0.001, 2.0], [1.7, 2.1], [1.75, 2.35], [1.55, 2.4], [0.001, 2.25]], 32), ST));
  P.push(part(cyl(1.5, 1.5, 0.05, 32), WATER, 0, 2.3, 0));
  P.push(part(lathe([[0.001, 2.3], [0.3, 2.3], [0.22, 3.1], [0.6, 3.25], [0.62, 3.4], [0.001, 3.35]], 20), ST2));
  P.push(part(sph(0.28, 12, 10), WATER, 0, 3.6, 0));
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; P.push(part(tube([[Math.cos(a) * 0.5, 3.4, Math.sin(a) * 0.5], [Math.cos(a) * 1.1, 3.0, Math.sin(a) * 1.1], [Math.cos(a) * 1.45, 2.35, Math.sin(a) * 1.45]], 0.05, 8), WATER)); }
  return merge(P);
}
function pillar() {
  const C = 0xa9a49a, C2 = 0x928d84, P = [];
  P.push(part(box(2.0, 0.5, 2.0), C2, 0, 0.25, 0)); P.push(part(box(1.5, 5.0, 1.5), C, 0, 3.0, 0)); P.push(part(box(2.0, 0.5, 2.0), C2, 0, 5.6, 0));
  for (const [x, z] of [[0.76, 0], [-0.76, 0], [0, 0.76], [0, -0.76]]) P.push(part(box(Math.abs(x) ? 0.04 : 0.6, 4.6, Math.abs(z) ? 0.04 : 0.6), C2, x, 3.0, z));
  return merge(P);
}

export const PROP_TYPES = {
  hydrant: { r: 0.45, fixed: false, mass: 0.3, build: hydrant, noShadow: true },
  mailbox: { r: 0.55, fixed: false, mass: 0.5, build: mailbox },
  lamp: { r: 0.3, fixed: false, mass: 0.8, h: 6.4, build: lamp },
  bench: { r: 0.9, fixed: false, mass: 0.6, build: bench },
  trash: { r: 0.45, fixed: false, mass: 0.3, build: trash, noShadow: true },
  tree: { r: 0.7, fixed: false, mass: 1.2, h: 4.4, build: () => tree(1) },
  cone: { r: 0.3, fixed: false, mass: 0.1, build: cone, noShadow: true },
  barrel: { r: 0.6, fixed: false, mass: 0.7, build: barrel },
  cart: { r: 0.9, fixed: false, mass: 0.9, build: cart },
  planter: { r: 0.7, fixed: false, mass: 1.0, build: planter },
  sign: { r: 0.25, fixed: false, mass: 0.3, build: sign, noShadow: true },
  // fixed props: hitting these fast totals your truck
  bigtree: { r: 1.4, fixed: true, h: 10, build: bigtree },
  celltower: { r: 1.3, fixed: true, h: 25, build: celltower },
  statue: { r: 1.8, fixed: true, build: statue },
  fountain: { r: 4.2, fixed: true, build: fountain },
  pillar: { r: 0.9, fixed: true, h: 5.5, build: pillar },
  goalpost: { r: 0.6, fixed: true, build: () => merge([part(cyl(0.4, 0.4, 7, 12), 0xffffff, 0, 3.5, 0)]) },
};
const GEO_CACHE = {};
function propGeometry(type) { return GEO_CACHE[type] || (GEO_CACHE[type] = PROP_TYPES[type].build()); }

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
const _fr = new THREE.Frustum(), _pv = new THREE.Matrix4(), _sph = new THREE.Sphere();

export class PropSystem {
  constructor(scene, maxPerType = 400) {
    this.scene = scene;
    this.items = []; this.hash = new SpatialHash(16); this._q = [];
    this.meshes = {}; this.byType = {};
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05 });
    this.maxPerType = maxPerType;
    this.active = [];
    this.cullDistance = 170;
  }
  _mesh(type) {
    if (this.meshes[type]) return this.meshes[type];
    const m = new THREE.InstancedMesh(propGeometry(type), this.material, this.maxPerType);
    m.userData.keepGeometry = true; m.name = 'prop:' + type;
    m.count = 0; m.castShadow = !PROP_TYPES[type].noShadow; m.receiveShadow = true; m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(m); this.meshes[type] = m; this.byType[type] = [];
    return m;
  }
  add(type, x, z, rotY = 0, scale = 1, y = 0) {
    const def = PROP_TYPES[type]; const mesh = this._mesh(type), list = this.byType[type];
    if (list.length >= this.maxPerType) return null;
    const it = { type, def, x, y, z, rot: rotY, scale, r: def.r * scale, fixed: def.fixed, alive: true,
      vx: 0, vy: 0, vz: 0, spin: 0, tilt: 0, tiltAxis: 0, life: 0, mesh, _st: 0, m: new Float32Array(16), h: (def.h || 6) * scale };
    this.items.push(it); list.push(it);
    this.hash.insert(it, x - it.r - 0.5, z - it.r - 0.5, x + it.r + 0.5, z + it.r + 0.5);
    this._write(it);
    return it;
  }
  _write(it) {
    _p.set(it.x, it.y, it.z);
    _e.set(it.tilt * Math.cos(it.tiltAxis), it.rot, it.tilt * Math.sin(it.tiltAxis));
    _q.setFromEuler(_e);
    _s.setScalar(it.scale);
    _m.compose(_p, _q, _s).toArray(it.m);
  }
  /**
   * Fill each instance buffer with only the props near the camera's view (with a margin so shadows of props just
   * off screen still land). Call once per frame before rendering.
   */
  cull(camera) {
    camera.updateMatrixWorld();
    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _fr.setFromProjectionMatrix(_pv);
    const cx = camera.position.x, cz = camera.position.z, maxD2 = this.cullDistance * this.cullDistance;
    for (const type in this.byType) {
      const mesh = this.meshes[type], arr = mesh.instanceMatrix.array; let n = 0;
      for (const it of this.byType[type]) {
        if (it.scale <= 0.001) continue;
        const dx = it.x - cx, dz = it.z - cz, d2 = dx * dx + dz * dz;
        if (d2 > maxD2) continue;
        _sph.center.set(it.x, it.y + it.h * 0.5, it.z); _sph.radius = it.r + it.h * 0.5 + 8;
        if (d2 > 900 && !_fr.intersectsSphere(_sph)) continue;
        arr.set(it.m, n * 16); n++;
      }
      mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
    }
  }
  nearby(x, z, r) { return this.hash.query(x - r, z - r, x + r, z + r, this._q); }
  /** Knock a destructible prop with a velocity. */
  knock(it, vx, vz, strength = 1) {
    if (!it.alive) return;
    it.alive = false; it.life = 0;
    const m = Math.max(0.1, it.def.mass || 0.5);
    const k = Math.min(2.5, strength) / m;
    it.vx = vx * 0.6 * k + (Math.random() - 0.5) * 3; it.vz = vz * 0.6 * k + (Math.random() - 0.5) * 3;
    it.vy = 5 + 6 * Math.min(1, strength) / m;
    it.spin = (Math.random() - 0.5) * 12; it.tiltAxis = Math.random() * Math.PI * 2;
    this.active.push(it);
  }
  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const it = this.active[i];
      it.life += dt;
      it.vy -= 22 * dt;
      it.x += it.vx * dt; it.z += it.vz * dt; it.y += it.vy * dt;
      it.rot += it.spin * dt; it.tilt = Math.min(Math.PI / 2, it.tilt + Math.abs(it.spin) * dt * 0.7);
      if (it.y < 0) { it.y = 0; it.vy *= -0.3; it.vx *= 0.7; it.vz *= 0.7; it.spin *= 0.6; }
      if (it.life > 4) { it.scale = Math.max(0, it.scale - dt * 1.5); }
      this._write(it);
      if (it.scale <= 0.001) { this.active.splice(i, 1); }
    }
  }
  reset() { for (const m of Object.values(this.meshes)) { m.count = 0; } for (const t in this.byType) this.byType[t].length = 0; this.items.length = 0; this.hash = new SpatialHash(16); this.active.length = 0; }
}
