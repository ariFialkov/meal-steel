// Detailed mode set pieces: futsal arena, rumble serving spots, musical-trucks parking bays, race gantries.
import * as THREE from 'three';
import { GeoBuilder, prim, xform, rgb, shade } from './builder.js';
import { getCityTextures, TILE, SIGN_COLS, SIGN_ROWS } from './citytex.js';

const STEEL = '#c9d0d6', IRON = '#3a3f47', WHITE = '#ffffff', INK = '#22304a';
const MAT = {};
function stdMat() { return MAT.std || (MAT.std = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 })); }
function meshOf(b, mat = stdMat(), shadow = true) { const g = b.build(); const m = new THREE.Mesh(g, mat); m.castShadow = shadow; m.receiveShadow = true; m.userData.keepTextures = true; return m; }

const TEXT_CACHE = new Map();
/** Cartoon text panel texture (cached): outlined display text on a coloured board. */
export function labelTexture(text, bg, fg = '#ffffff', w = 512, h = 160) {
  const key = [text, bg, fg, w, h].join('|');
  if (TEXT_CACHE.has(key)) return TEXT_CACHE.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const draw = () => {
    const ctx = c.getContext('2d');
    ctx.fillStyle = INK; ctx.fillRect(0, 0, w, h); ctx.fillStyle = bg; ctx.fillRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(8, 8, w - 16, (h - 16) * 0.4);
    let size = h * 0.62; ctx.font = `${size}px "Luckiest Guy", "Arial Black", sans-serif`;
    while (ctx.measureText(text).width > w - 50 && size > 16) { size -= 2; ctx.font = `${size}px "Luckiest Guy", "Arial Black", sans-serif`; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.16; ctx.strokeStyle = INK; ctx.strokeText(text, w / 2, h / 2 + size * 0.06);
    ctx.fillStyle = fg; ctx.fillText(text, w / 2, h / 2 + size * 0.06);
  };
  draw();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (document.fonts) document.fonts.load('48px "Luckiest Guy"').then(() => { draw(); t.needsUpdate = true; }).catch(() => {});
  TEXT_CACHE.set(key, t);
  return t;
}
/** Sign panel. Two-sided panels are two back-to-back faces so the text reads correctly from both sides. */
function panel(w, h, tex, doubleSided = true) {
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, envMapIntensity: 0.25 });
  const face = (ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.rotation.y = ry; m.castShadow = true; m.userData.keepTextures = true; return m; };
  if (!doubleSided) return face(0);
  const g = new THREE.Group(); const back = face(Math.PI); back.position.z = -0.01; g.add(face(0), back); return g;
}

// ------------------------------------------------------------------ people
const SKIN = ['#f1c7a5', '#e0a77e', '#b97a52', '#8a5a3a', '#5e3b25', '#f6d5bd'];
const SHIRT = ['#ff4d57', '#2f9bff', '#3fd46f', '#ffd626', '#b56cff', '#ff7a1a', '#ff6fae', '#1aa39a', '#ffffff'];
const PANTS = ['#2b3a55', '#3a3f47', '#6b4a2b', '#4f6b8f', '#22304a'];
const HAIR = ['#2a1b12', '#5a3a1a', '#d9b26a', '#1a1a1a', '#a0522d', '#c0c0c0'];
/** A chunky cartoon pedestrian (~250 tris) added to builder b at (x, z) facing yaw. */
/**
 * A pedestrian. look: fixed colours (to rebuild the same person in another pose). pose: 'stand', 'panic' (arms up, mouth
 * open), 'sit' (on a seat at local y 0.86) or 'sitPanic'.
 */
export function person(b, x, z, yaw, rng, scale = 1, look = null, pose = 'stand') {
  const s = scale, L = look || { skin: rng.pick(SKIN), shirt: rng.pick(SHIRT), pants: rng.pick(PANTS), hair: rng.pick(HAIR) };
  const { skin, shirt, pants, hair } = L;
  const at = (lx, ly, lz) => { const c = Math.cos(yaw), sn = Math.sin(yaw); return [x + (lx * c + lz * sn) * s, ly * s, z + (-lx * sn + lz * c) * s]; };
  const seated = pose === 'sit' || pose === 'sitPanic';
  if (seated) {
    // thighs forward on the seat, shins hanging down
    for (const lx of [-0.12, 0.12]) { const th = at(lx, 0.86, 0.2); b.geo(prim('cyl8'), xform(th[0], th[1], th[2], yaw, Math.PI / 2, 0, 0.18 * s, 0.46 * s, 0.18 * s), pants); const sh = at(lx, 0.62, 0.42); b.geo(prim('cyl8'), xform(sh[0], sh[1], sh[2], yaw, 0, 0, 0.16 * s, 0.5 * s, 0.16 * s), pants); const f = at(lx, 0.38, 0.47); b.geo(prim('box'), xform(f[0], f[1], f[2], yaw, 0, 0, 0.16 * s, 0.08 * s, 0.26 * s), '#22252b'); }
  } else for (const lx of [-0.12, 0.12]) { const p = at(lx, 0.42, 0); b.geo(prim('cyl8'), xform(p[0], p[1], p[2], yaw, 0, 0, 0.17 * s, 0.84 * s, 0.17 * s), pants); const f = at(lx, 0.04, 0.05); b.geo(prim('box'), xform(f[0], f[1], f[2], yaw, 0, 0, 0.16 * s, 0.08 * s, 0.26 * s), '#22252b'); }
  const t = at(0, 1.12, 0); b.geo(prim('cyl12'), xform(t[0], t[1], t[2], yaw, 0, 0, 0.46 * s, 0.62 * s, 0.3 * s), shirt);
  const sh = at(0, 1.42, 0); b.geo(prim('sphere10'), xform(sh[0], sh[1], sh[2], yaw, 0, 0, 0.48 * s, 0.2 * s, 0.32 * s), shirt);
  if (pose === 'panic' || pose === 'sitPanic') {
    // arms flung up over the head, hands spread
    for (const lx of [-0.29, 0.29]) { const sg = Math.sign(lx), a = at(lx + sg * 0.13, 1.69, 0.02); b.geo(prim('cyl8'), xform(a[0], a[1], a[2], yaw, 0, -sg * 0.45, 0.12 * s, 0.6 * s, 0.12 * s), shirt); const hnd = at(lx + sg * 0.27, 1.98, 0.02); b.geo(prim('sphere10'), xform(hnd[0], hnd[1], hnd[2], 0, 0, 0, 0.12 * s, 0.12 * s, 0.12 * s), skin); }
    const m = at(0, 1.68, 0.17); b.geo(prim('sphere10'), xform(m[0], m[1], m[2], yaw, 0, 0, 0.12 * s, 0.14 * s, 0.06 * s), '#5a1a1a');
  } else for (const lx of [-0.29, 0.29]) { const a = at(lx, 1.1, 0.04); b.geo(prim('cyl8'), xform(a[0], a[1], a[2], yaw, -0.25, lx > 0 ? -0.12 : 0.12, 0.12 * s, 0.6 * s, 0.12 * s), shirt); const hnd = at(lx * 1.08, 0.78, 0.12); b.geo(prim('sphere10'), xform(hnd[0], hnd[1], hnd[2], 0, 0, 0, 0.11 * s, 0.11 * s, 0.11 * s), skin); }
  const n = at(0, 1.55, 0); b.geo(prim('cyl8'), xform(n[0], n[1], n[2], 0, 0, 0, 0.1 * s, 0.12 * s, 0.1 * s), skin);
  const h = at(0, 1.78, 0); b.geo(prim('sphere10'), xform(h[0], h[1], h[2], yaw, 0, 0, 0.38 * s, 0.4 * s, 0.38 * s), skin);
  const hr = at(0, 1.87, -0.03); b.geo(prim('dome12'), xform(hr[0], hr[1], hr[2], yaw, 0, 0, 0.41 * s, 0.32 * s, 0.41 * s), hair);
  for (const lx of [-0.07, 0.07]) { const e = at(lx, 1.8, 0.18); b.geo(prim('sphere10'), xform(e[0], e[1], e[2], 0, 0, 0, 0.05 * s, 0.06 * s, 0.05 * s), '#1a1a1a'); }
  return L;
}

// ------------------------------------------------------------------ futsal arena
/** Visuals for the soccer arena. Colliders are added by the mode; this only draws. */
export function buildArena(scene, A) {
  const group = new THREE.Group(), tex = getCityTextures();
  // turf with mowing stripes
  const turf = new GeoBuilder(), tw = TILE.grass[0] / 1.6, stripes = 14, sl = (A.maxZ - A.minZ) / stripes;
  for (let k = 0; k < stripes; k++) {
    const z0 = A.minZ + k * sl, z1 = z0 + sl, c = k % 2 ? [0.78, 0.9, 0.74] : [1.02, 1.08, 0.98], y = 0.22;
    turf.quad([A.minX, y, z0], [A.minX, y, z1], [A.maxX, y, z1], [A.maxX, y, z0], [0, 1, 0], [[A.minX / tw, z0 / tw], [A.minX / tw, z1 / tw], [A.maxX / tw, z1 / tw], [A.maxX / tw, z0 / tw]], c);
  }
  for (const [z0, z1] of [[A.minZ - A.goalDepth, A.minZ], [A.maxZ, A.maxZ + A.goalDepth]]) turf.quad([-A.goalHalf, 0.22, z0], [-A.goalHalf, 0.22, z1], [A.goalHalf, 0.22, z1], [A.goalHalf, 0.22, z0], [0, 1, 0], [[0, z0 / tw], [0, z1 / tw], [A.goalHalf * 2 / tw, z1 / tw], [A.goalHalf * 2 / tw, z0 / tw]], [0.9, 0.98, 0.88]);
  const tm = new THREE.Mesh(turf.build(), new THREE.MeshStandardMaterial({ map: tex.grass.map, normalMap: tex.grass.normalMap, vertexColors: true, roughness: 0.95 }));
  tm.receiveShadow = true; tm.userData.keepTextures = true; group.add(tm);
  // pitch lines
  const P = new GeoBuilder(), y = 0.24, lw = 0.3, W = [1, 1, 1];
  const rect = (x0, z0, x1, z1) => P.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [0, 1, 0], null, W);
  const arc = (cx, cz, r, a0, a1, segs = 40) => { for (let k = 0; k < segs; k++) { const t0 = a0 + (a1 - a0) * k / segs, t1 = a0 + (a1 - a0) * (k + 1) / segs, p = (rr, a) => [cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr]; P.quad(p(r - lw / 2, t0), p(r + lw / 2, t0), p(r + lw / 2, t1), p(r - lw / 2, t1), [0, 1, 0], null, W); } };
  rect(A.minX, A.minZ, A.minX + lw, A.maxZ); rect(A.maxX - lw, A.minZ, A.maxX, A.maxZ); rect(A.minX, A.minZ, A.maxX, A.minZ + lw); rect(A.minX, A.maxZ - lw, A.maxX, A.maxZ);
  rect(A.minX, -lw / 2, A.maxX, lw / 2); arc(0, 0, 11.5, 0, Math.PI * 2, 64); arc(0, 0, 0.35, 0, Math.PI * 2, 12);
  for (const sgn of [-1, 1]) {
    const gz = sgn < 0 ? A.minZ : A.maxZ, inZ = gz - sgn * 16;
    arc(-A.goalHalf + 1, gz, 15, sgn < 0 ? Math.PI / 2 : -Math.PI, sgn < 0 ? Math.PI : -Math.PI / 2, 24);
    arc(A.goalHalf - 1, gz, 15, sgn < 0 ? 0 : -Math.PI / 2, sgn < 0 ? Math.PI / 2 : 0, 24);
    rect(-A.goalHalf + 1, inZ - lw / 2, A.goalHalf - 1, inZ + lw / 2);
    arc(0, gz - sgn * 11, 0.3, 0, Math.PI * 2, 10);
    for (const sx of [-1, 1]) arc(sx > 0 ? A.maxX : A.minX, gz, 1.5, sx > 0 ? (sgn > 0 ? Math.PI : Math.PI / 2) : (sgn > 0 ? -Math.PI / 2 : 0), sx > 0 ? (sgn > 0 ? Math.PI * 1.5 : Math.PI) : (sgn > 0 ? 0 : Math.PI / 2), 8);
  }
  group.add(meshOf(P, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }), false));
  // dasher boards: sponsor panels, coloured kick rail, glass above, steel posts
  const T = new GeoBuilder(), ads = new GeoBuilder(), glass = new GeoBuilder();
  const boardRun = (ax, az, bx, bz, nx, nz, rail) => {
    const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, H = 1.2, out = 0.12;
    for (let s = 0; s < L - 0.01; s += 6) {
      const e = Math.min(L, s + 6), cell = Math.floor(Math.random() * SIGN_COLS * SIGN_ROWS), cu = (cell % SIGN_COLS) / SIGN_COLS, cv = 1 - (Math.floor(cell / SIGN_COLS) + 1) / SIGN_ROWS;
      const p = (t, yy, o) => [ax + ux * t + nx * o, yy, az + uz * t + nz * o];
      ads.quad(p(s + 0.05, 0.35, out), p(e - 0.05, 0.35, out), p(e - 0.05, H - 0.1, out), p(s + 0.05, H - 0.1, out), [nx, 0, nz], [[cu + 1 / SIGN_COLS, cv], [cu, cv], [cu, cv + 1 / SIGN_ROWS], [cu + 1 / SIGN_COLS, cv + 1 / SIGN_ROWS]], [1, 1, 1]);
    }
    const q = (t0, t1, y0, y1, o0, o1, c) => { const a = [ax + ux * t0 + nx * o0, az + uz * t0 + nz * o0], b = [ax + ux * t1 + nx * o1, az + uz * t1 + nz * o1]; T.box(Math.min(a[0], b[0]), y0, Math.min(a[1], b[1]), Math.max(a[0], b[0]), y1, Math.max(a[1], b[1]), c); };
    q(0, L, 0, 0.35, -0.2, out + 0.02, rail);         // kick rail
    q(0, L, 0.35, H, -0.2, out - 0.02, WHITE);         // board body
    q(0, L, H, H + 0.12, -0.3, out + 0.08, WHITE);     // cap
    for (let s = 0; s <= L; s += 4) q(Math.max(0, s - 0.06), Math.min(L, s + 0.06), H, 3.0, -0.06, 0.06, STEEL);
    q(0, L, 2.95, 3.05, -0.06, 0.06, STEEL);
    const g = (t0, t1) => { const a = [ax + ux * t0, az + uz * t0], b = [ax + ux * t1, az + uz * t1]; glass.quad([a[0], H + 0.1, a[1]], [b[0], H + 0.1, b[1]], [b[0], 2.95, b[1]], [a[0], 2.95, a[1]], [nx, 0, nz], null, [0.75, 0.9, 1]); };
    g(0, L);
  };
  const gd = A.goalDepth;
  boardRun(A.minX, A.minZ - 1, A.minX, A.maxZ + 1, 1, 0, rgb('#22304a'));
  boardRun(A.maxX, A.maxZ + 1, A.maxX, A.minZ - 1, -1, 0, rgb('#22304a'));
  for (const [z, sgn, col] of [[A.minZ, -1, '#2f9bff'], [A.maxZ, 1, '#ff4d57']]) {
    boardRun(A.minX, z, -A.goalHalf - 1, z, 0, -sgn, rgb(col));
    boardRun(A.goalHalf + 1, z, A.maxX, z, 0, -sgn, rgb(col));
  }
  group.add(meshOf(T));
  const adMesh = new THREE.Mesh(ads.build(), new THREE.MeshStandardMaterial({ map: tex.signs, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -1 })); adMesh.userData.keepTextures = true; group.add(adMesh);
  const gm = new THREE.Mesh(glass.build(), new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false })); group.add(gm);
  // goals: posts + crossbar, tubular frame, net
  for (const [z, sgn, col] of [[A.minZ, -1, '#2f9bff'], [A.maxZ, 1, '#ff4d57']]) {
    const G = new GeoBuilder(), gh = 6.2, r = 0.28, back = z + sgn * gd;
    for (const sx of [-1, 1]) {
      G.cyl(sx * A.goalHalf, gh / 2, z, r, gh, WHITE, 16);
      for (let k = 0; k < 6; k++) G.cyl(sx * A.goalHalf, 0.4 + k * 1.0, z, r + 0.02, 0.5, k % 2 ? col : WHITE, 16);
      G.cyl(sx * A.goalHalf, gh * 0.4, back, 0.12, gh * 0.8, STEEL, 8);
      G.geo(prim('cyl8'), xform(sx * A.goalHalf, gh - 0.3, (z + back) / 2, 0, Math.PI / 2 - Math.atan2(gh * 0.2, gd) * sgn, 0, 0.24, Math.hypot(gd, gh * 0.2), 0.24), STEEL);
      G.geo(prim('cyl8'), xform(sx * A.goalHalf, 0.12, (z + back) / 2, 0, Math.PI / 2, 0, 0.2, gd, 0.2), STEEL);
    }
    G.geo(prim('cyl16'), xform(0, gh, z, 0, 0, Math.PI / 2, r * 2, A.goalHalf * 2 + r * 2, r * 2), WHITE);
    G.geo(prim('cyl8'), xform(0, gh * 0.8, back, 0, 0, Math.PI / 2, 0.24, A.goalHalf * 2, 0.24), STEEL);
    G.geo(prim('cyl8'), xform(0, 0.12, back, 0, 0, Math.PI / 2, 0.2, A.goalHalf * 2, 0.2), STEEL);
    group.add(meshOf(G));
    // net grid
    const pts = [], step = 0.6, hx = A.goalHalf - 0.1;
    const zAt = (yy) => back - sgn * 0 + (yy > gh * 0.8 ? -sgn * ((yy - gh * 0.8) / (gh * 0.2)) * gd : 0);
    for (let xx = -hx; xx <= hx + 0.01; xx += step) { pts.push(xx, 0.1, back, xx, gh * 0.8, back, xx, gh * 0.8, back, xx, gh - 0.1, z + sgn * 0.3); }
    for (let yy = 0.1; yy <= gh * 0.8; yy += step) pts.push(-hx, yy, back, hx, yy, back);
    for (let t = 0; t <= 1.001; t += step / gd) { const zz = z + sgn * gd * t; pts.push(-hx, gh - 0.1 - gh * 0.2 * t, zz, hx, gh - 0.1 - gh * 0.2 * t, zz); }
    for (const sx of [-1, 1]) {
      for (let t = 0; t <= 1.001; t += step / gd) { const zz = z + sgn * gd * t; pts.push(sx * hx, 0.1, zz, sx * hx, gh - 0.1 - gh * 0.2 * t, zz); }
      for (let yy = 0.1; yy <= gh * 0.8; yy += step) pts.push(sx * hx, yy, z + sgn * 0.3, sx * hx, yy, back);
    }
    void zAt;
    const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    group.add(new THREE.LineSegments(ng, new THREE.LineBasicMaterial({ color: 0xf4f4f4, transparent: true, opacity: 0.75 })));
  }
  // corner flags
  const F = new GeoBuilder();
  for (const [x, z, c] of [[A.minX + 0.6, A.minZ + 0.6, '#2f9bff'], [A.maxX - 0.6, A.minZ + 0.6, '#2f9bff'], [A.minX + 0.6, A.maxZ - 0.6, '#ff4d57'], [A.maxX - 0.6, A.maxZ - 0.6, '#ff4d57']]) {
    F.cyl(x, 0.9, z, 0.04, 1.8, WHITE, 8);
    F.tri([x, 1.8, z], [x, 1.35, z], [x + 0.5, 1.6, z + 0.1], [0, 0, 1], null, c); F.tri([x, 1.8, z], [x + 0.5, 1.6, z + 0.1], [x, 1.35, z], [0, 0, -1], null, c);
  }
  group.add(meshOf(F));
  scene.add(group);
  return group;
}

// ------------------------------------------------------------------ rumble serving spot
/** Serving bay: painted pad (recoloured by the mode), queue of customers, umbrella table, menu board. */
export function servingSpot(rng) {
  // (customers are animated separately by the mode: see modes/serving.js)
  const grp = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.BoxGeometry(5, 0.08, 8), new THREE.MeshStandardMaterial({ color: 0x3aa9ff, roughness: 0.6, transparent: true, opacity: 0.85 }));
  pad.position.y = 0.26; pad.receiveShadow = true; grp.add(pad);
  const B = new GeoBuilder(), y = 0.31;
  const line = (x0, z0, x1, z1) => B.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [0, 1, 0], null, WHITE);
  line(-2.6, -4.1, 2.6, -3.85); line(-2.6, 3.85, 2.6, 4.1); line(-2.6, -4.1, -2.35, 4.1); line(2.35, -4.1, 2.6, 4.1);
  for (let k = -3; k <= 3; k++) line(-2.6 + 0.0, k * 1.0 - 0.06, -2.1, k * 1.0 + 0.06);
  // umbrella table
  const tx = -3.9, tz = 2.5;
  B.cyl(tx, 0.55, tz, 0.07, 1.1, IRON, 8); B.cyl(tx, 1.12, tz, 0.55, 0.06, WHITE, 16); B.cyl(tx, 2.0, tz, 0.035, 2.0, '#dddddd', 8);
  for (let k = 0; k < 8; k++) B.geo(new THREE.ConeGeometry(1.25, 0.45, 1, 1, true, (k / 8) * Math.PI * 2, Math.PI / 4), xform(tx, 2.85, tz), k % 2 ? '#ff4d57' : '#ffffff');
  for (const a of [0, Math.PI]) { const cx = tx + Math.cos(a) * 0.9, cz = tz + Math.sin(a) * 0.9; B.cyl(cx, 0.32, cz, 0.22, 0.06, '#ff7a1a', 12); B.cyl(cx, 0.16, cz, 0.04, 0.32, IRON, 6); }
  // A-frame menu board
  B.obox(-3.6, 0.55, -2.4, 0.9, 1.1, 0.05, 0, 0.18, INK); B.obox(-3.6, 0.55, -2.6, 0.9, 1.1, 0.05, 0, -0.18, INK);
  grp.add(meshOf(B));
  const menu = panel(0.78, 0.95, labelTexture('MENU', '#ffd626', INK, 256, 300)); menu.position.set(-3.6, 0.58, -2.29); menu.rotation.x = -0.18; grp.add(menu);
  // pole sign
  const S = new GeoBuilder(); S.cyl(0, 1.6, -4.4, 0.08, 3.2, STEEL, 8); grp.add(meshOf(S));
  const sign = panel(2.6, 0.9, labelTexture('SERVE HERE', '#ff7a1a')); sign.position.set(0, 3.3, -4.4); grp.add(sign);
  return { group: grp, pad };
}

// ------------------------------------------------------------------ musical trucks parking bay
export function parkingBay() {
  const grp = new THREE.Group();
  const fill = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.06, 7.1), new THREE.MeshStandardMaterial({ color: 0x3aa9ff, roughness: 0.6 }));
  fill.position.y = 0.27; fill.receiveShadow = true; grp.add(fill);
  const B = new GeoBuilder(), y = 0.31;
  const line = (x0, z0, x1, z1, c = WHITE) => B.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [0, 1, 0], null, c);
  line(-2.1, -3.8, -1.85, 3.8); line(1.85, -3.8, 2.1, 3.8); line(-2.1, -3.8, 2.1, -3.55);
  for (let k = 0; k < 6; k++) line(-1.85 + k * 0.62, 3.55, -1.55 + k * 0.62, 3.8, k % 2 ? INK : '#ffd626');
  // wheel stop
  B.box(-1.2, 0.27, -3.35, 1.2, 0.45, -3.05, '#ffd626');
  // meter
  B.cyl(1.6, 0.65, -4.0, 0.06, 1.3, '#6a737b', 8); B.box(1.42, 1.3, -4.15, 1.78, 1.85, -3.85, '#4f6b8f'); B.geo(prim('dome12'), xform(1.6, 1.85, -4.0, 0, 0, 0, 0.36, 0.25, 0.3), '#4f6b8f');
  B.box(1.48, 1.55, -3.86, 1.72, 1.75, -3.84, '#cfe8f5');
  // sign post
  B.cyl(0, 1.5, -4.2, 0.07, 3.0, STEEL, 8);
  grp.add(meshOf(B));
  const sign = panel(1.4, 1.4, labelTexture('P', '#2f9bff', '#ffffff', 256, 256)); sign.position.set(0, 3.25, -4.17); grp.add(sign);
  return { group: grp, fill };
}

// ------------------------------------------------------------------ race gantry
/** Truss gantry spanning the track, centred on the origin facing +Z; label banner on both faces. */
export function gantry(label, bg) {
  const grp = new THREE.Group(), B = new GeoBuilder(), half = 6.5, H = 7.6, tw = 0.9;
  const col = rgb(bg);
  for (const sx of [-1, 1]) {
    const cx = sx * half;
    B.box(cx - 0.8, 0, -0.8, cx + 0.8, 0.5, 0.8, '#9e988e');
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.cyl(cx + dx * tw / 2, H / 2 + 0.25, dz * tw / 2, 0.07, H - 0.5, STEEL, 8);
    for (let yy = 0.8; yy < H - 0.2; yy += 1.2) for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
      const x0 = cx + ax * tw / 2, z0 = az * tw / 2, x1 = cx + bx * tw / 2, z1 = bz * tw / 2, L = Math.hypot(x1 - x0, 1.2, z1 - z0);
      B.geo(prim('cyl8'), xform((x0 + x1) / 2, yy + 0.6, (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0), Math.atan2(Math.hypot(x1 - x0, z1 - z0), 1.2), 0, 0.06, L, 0.06), STEEL);
      B.geo(prim('cyl8'), xform((x0 + x1) / 2, yy, (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0), Math.PI / 2, 0, 0.06, Math.hypot(x1 - x0, z1 - z0), 0.06), STEEL);
    }
    for (let k = 0; k < 5; k++) B.box(cx - tw / 2 - 0.02, 0.6 + k * 0.5, -tw / 2 - 0.02, cx + tw / 2 + 0.02, 0.85 + k * 0.5, tw / 2 + 0.02, k % 2 ? INK : '#ffffff');
    B.cyl(cx, H + 1.2, 0, 0.04, 2.4, STEEL, 6);
    B.tri([cx, H + 2.4, 0], [cx, H + 1.7, 0], [cx + sx * 1.2, H + 2.05, 0], [0, 0, 1], null, col); B.tri([cx, H + 2.4, 0], [cx + sx * 1.2, H + 2.05, 0], [cx, H + 1.7, 0], [0, 0, -1], null, col);
  }
  for (const [yy, zz] of [[H - 0.45, -0.45], [H - 0.45, 0.45], [H + 0.45, -0.45], [H + 0.45, 0.45]]) B.geo(prim('cyl8'), xform(0, yy, zz, 0, 0, Math.PI / 2, 0.14, half * 2 + tw, 0.14), STEEL);
  for (let xx = -half; xx < half; xx += 1.1) for (const zz of [-0.45, 0.45]) B.geo(prim('cyl8'), xform(xx + 0.55, H, zz, 0, 0, Math.atan2(1.1, 0.9), 0.05, Math.hypot(1.1, 0.9), 0.05), STEEL);
  for (const zz of [-0.62, 0.62]) for (let k = 0; k < 9; k++) { const xx = -half + 0.8 + k * (half * 2 - 1.6) / 8; B.geo(prim('sphere10'), xform(xx, H - 0.75, zz, 0, 0, 0, 0.22, 0.22, 0.22), k % 2 ? '#fff1b8' : col); }
  grp.add(meshOf(B));
  const t = labelTexture(label, bg, '#ffffff', 1024, 200);
  for (const s of [1, -1]) { const p = panel(half * 2 - 1.2, 2.3, t, false); p.position.set(0, H, s * 0.5); p.rotation.y = s > 0 ? 0 : Math.PI; grp.add(p); }
  return grp;
}

/** Hazard-striped ring marker for the rumble arena. */
export function ringMarker(cx, cz, r) {
  const B = new GeoBuilder(), y = 0.26, n = 96;
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2, p = (rr, a) => [cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr];
    B.quad(p(r - 0.7, a0), p(r + 0.7, a0), p(r + 0.7, a1), p(r - 0.7, a1), [0, 1, 0], null, k % 2 ? '#ffd626' : INK);
  }
  return meshOf(B, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }), false);
}

// ------------------------------------------------------------------ pickups and ball
/** Classic black-and-white football: dark pentagon patches around the 12 icosahedron vertices, smooth sphere. */
export function soccerBall(radius) {
  // finely subdivided icosphere, faces coloured by their angular distance from the 12 pentagon centres
  const g = new THREE.IcosahedronGeometry(radius, 5), p = g.attributes.position, n = p.count, col = new Float32Array(n * 3);
  const ico = new THREE.IcosahedronGeometry(1, 0), ip = ico.attributes.position, centres = [];
  for (let i = 0; i < ip.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(ip, i).normalize(); if (!centres.some((c) => c.distanceTo(v) < 1e-3)) centres.push(v); }
  const v = new THREE.Vector3(), nrm = new Float32Array(n * 3);
  for (let t = 0; t < n; t += 3) {
    v.set(0, 0, 0); for (let k = 0; k < 3; k++) v.add(new THREE.Vector3().fromBufferAttribute(p, t + k)); v.normalize();
    let best = -1; for (const c of centres) best = Math.max(best, v.dot(c));
    const c = best > 0.936 ? 0.08 : (best > 0.8 && best < 0.815 ? 0.72 : 0.97);
    for (let k = 0; k < 3; k++) { col[(t + k) * 3] = c; col[(t + k) * 3 + 1] = c; col[(t + k) * 3 + 2] = c; }
  }
  for (let i = 0; i < n; i++) { v.fromBufferAttribute(p, i).normalize(); nrm[i * 3] = v.x; nrm[i * 3 + 1] = v.y; nrm[i * 3 + 2] = v.z; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0 }));
  m.castShadow = true;
  return m;
}
/** Spinning gold coin with a raised rim and stamped dollar sign. */
export function coinMesh() {
  const grp = new THREE.Group(), gold = new THREE.MeshStandardMaterial({ color: 0xffc928, metalness: 0.85, roughness: 0.28 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.16, 32), gold); body.rotation.x = Math.PI / 2; grp.add(body);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.07, 8, 32), gold); grp.add(rim);
  const face = labelTexture('$', '#ffc928', '#fff3b0', 256, 256);
  for (const s of [1, -1]) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.62, 32), new THREE.MeshStandardMaterial({ map: face, metalness: 0.7, roughness: 0.3 })); d.position.z = s * 0.085; d.rotation.y = s > 0 ? 0 : Math.PI; d.userData.keepTextures = true; grp.add(d); }
  grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return grp;
}
/** Grocery coupon: a card with a dashed cut-out border and a big discount. */
export function couponMesh() {
  const c = document.createElement('canvas'); c.width = 320; c.height = 200; const ctx = c.getContext('2d');
  const draw = () => {
    ctx.fillStyle = '#3fd46f'; ctx.fillRect(0, 0, 320, 200); ctx.fillStyle = '#ffffff'; ctx.fillRect(14, 14, 292, 172);
    ctx.setLineDash([12, 8]); ctx.lineWidth = 5; ctx.strokeStyle = '#22304a'; ctx.strokeRect(24, 24, 272, 152); ctx.setLineDash([]);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ff4d57'; ctx.font = '86px "Luckiest Guy", "Arial Black", sans-serif'; ctx.fillText('50%', 160, 92);
    ctx.fillStyle = '#22304a'; ctx.font = '34px "Luckiest Guy", "Arial Black", sans-serif'; ctx.fillText('COUPON', 160, 152);
  };
  draw();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (document.fonts) document.fonts.load('48px "Luckiest Guy"').then(() => { draw(); t.needsUpdate = true; }).catch(() => {});
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.05), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
  m.castShadow = true;
  return m;
}

/** Overwrite UVs with world-space planar XZ coordinates (for ground-like surfaces that use tiling textures). */
export function planarUV(geo, tile) {
  const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / tile; uv[i * 2 + 1] = p.getZ(i) / tile; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// ------------------------------------------------------------------ rumble jump ramp
/** Wrestling-style kicker ramp for a StaticWorld ramp record r. */
export function jumpRamp(r) {
  const B = new GeoBuilder(), L = r.len, hw = r.hw, H = r.height, lx = -r.uz, lz = r.ux;
  const P = (along, lat, y) => [r.cx + r.ux * (along - L / 2) + lx * lat, y, r.cz + r.uz * (along - L / 2) + lz * lat];
  const up = Math.atan2(H, L), nSlope = [-r.ux * Math.sin(up), Math.cos(up), -r.uz * Math.sin(up)];
  // deck in alternating stripes
  const strips = 8;
  for (let k = 0; k < strips; k++) {
    const a0 = (k / strips) * L, a1 = ((k + 1) / strips) * L;
    B.quad(P(a0, -hw, H * a0 / L), P(a0, hw, H * a0 / L), P(a1, hw, H * a1 / L), P(a1, -hw, H * a1 / L), nSlope, null, k % 2 ? '#ff4d57' : '#f4f4f4');
  }
  // chevrons pointing up the ramp
  for (let k = 0; k < 3; k++) {
    const a = L * (0.22 + k * 0.22), y = H * a / L + 0.02, w = hw * 0.55;
    B.tri(P(a + 1.1, 0, y + 1.1 * H / L), P(a, -w, y), P(a, w, y), nSlope, null, '#ffd626');
  }
  // side walls and lip face
  const side = (s) => { const n = [lx * s, 0, lz * s]; B.tri(P(0, s * hw, 0), P(L, s * hw, 0), P(L, s * hw, H), n, null, '#22304a'); };
  side(1); side(-1);
  B.quad(P(L, -hw, 0), P(L, hw, 0), P(L, hw, H), P(L, -hw, H), [r.ux, 0, r.uz], null, '#ffd626');
  for (let k = 0; k < 5; k++) { const l0 = -hw + (k * 2 * hw) / 5; B.quad(P(L + 0.01, l0, H * 0.15), P(L + 0.01, l0 + hw * 0.2, H * 0.15), P(L + 0.01, l0 + hw * 0.2 + 0.4, H * 0.85), P(L + 0.01, l0 + 0.4, H * 0.85), [r.ux, 0, r.uz], null, '#22304a'); }
  // steel trim rails along the edges
  for (const s of [-1, 1]) { const a = P(0, s * (hw + 0.08), 0.1), b = P(L, s * (hw + 0.08), H + 0.1), len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); B.geo(prim('cyl8'), xform((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, r.yaw, Math.PI / 2 - up, 0, 0.16, len, 0.16), STEEL); }
  // flags on the lip corners
  for (const s of [-1, 1]) { const f = P(L, s * hw, H); B.cyl(f[0], H + 1.2, f[2], 0.05, 2.4, STEEL, 6); B.tri([f[0], H + 2.4, f[2]], [f[0], H + 1.8, f[2]], [f[0] + r.ux * 1.0, H + 2.1, f[2] + r.uz * 1.0], [lx, 0, lz], null, '#ff7a1a'); B.tri([f[0], H + 2.4, f[2]], [f[0] + r.ux * 1.0, H + 2.1, f[2] + r.uz * 1.0], [f[0], H + 1.8, f[2]], [-lx, 0, -lz], null, '#ff7a1a'); }
  return meshOf(B);
}

// ------------------------------------------------------------------ soccer: team markers and neon scoreboard
const UNDERGLOW = {};
function glowTexture(hex) {
  if (UNDERGLOW[hex]) return UNDERGLOW[hex];
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const col = new THREE.Color(hex), rgb = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
  // soft team-coloured pool with a crisp rim, readable on sunny turf as well as at night
  const g = x.createRadialGradient(64, 64, 8, 64, 64, 60); g.addColorStop(0, `rgba(${rgb},0.75)`); g.addColorStop(0.7, `rgba(${rgb},0.5)`); g.addColorStop(0.84, `rgba(${rgb},0.95)`); g.addColorStop(0.9, `rgba(255,255,255,0.9)`); g.addColorStop(0.95, `rgba(${rgb},0.8)`); g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (UNDERGLOW[hex] = t);
}
/** Team identity that leaves the truck's skin alone: neon underglow, a rear flag on a whip pole and a roof beacon. */
export function teamMarker(hex) {
  const grp = new THREE.Group();
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 7.6), new THREE.MeshBasicMaterial({ map: glowTexture(hex), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.05; glow.renderOrder = 1; grp.add(glow);
  // short whip pole on the rear corner, kept below the chase camera's sight line so it never covers the ball
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.6, roughness: 0.3 }));
  pole.position.set(-1.05, 3.5, -2.55); grp.add(pole);
  const flagGeo = new THREE.PlaneGeometry(1.0, 0.62, 8, 1); flagGeo.translate(0.5, 0, 0);
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: hex, side: THREE.DoubleSide, roughness: 0.7, emissive: hex, emissiveIntensity: 0.35 }));
  flag.position.set(-1.05, 3.95, -2.55); flag.rotation.y = Math.PI / 2; grp.add(flag);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: hex, toneMapped: false }));
  beacon.position.set(-1.05, 4.35, -2.55); grp.add(beacon);
  grp.userData = { flag, base: flagGeo.attributes.position.array.slice() };
  return grp;
}
/** Wave a team flag (cheap vertex wobble). */
export function waveFlag(marker, t, speed) {
  const { flag, base } = marker.userData, p = flag.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = base[i * 3]; p.setZ(i, Math.sin(x * 4 - t * (6 + speed * 0.2)) * 0.12 * x); }
  p.needsUpdate = true;
}

/** Giant neon scoreboard on a truss. update({ blue, red, time, note }) redraws only when something changed. */
export class NeonScoreboard {
  constructor() {
    this.group = new THREE.Group();
    const W = 30, H = 12;
    const c = document.createElement('canvas'); c.width = 1024; c.height = 410; this.canvas = c; this.ctx = c.getContext('2d');
    this.tex = new THREE.CanvasTexture(c); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    screen.position.y = 13; this.group.add(screen);
    const back = new THREE.Mesh(new THREE.BoxGeometry(W + 1.2, H + 1.2, 0.8), new THREE.MeshStandardMaterial({ color: 0x1a1f2b, roughness: 0.6, metalness: 0.3 }));
    back.position.set(0, 13, -0.45); this.group.add(back);
    // neon tubes around the frame
    const tube = (w, h, x, y, color) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.25), new THREE.MeshBasicMaterial({ color, toneMapped: false })); m.position.set(x, y, 0.15); this.group.add(m); };
    tube(W + 0.6, 0.25, 0, 13 + H / 2 + 0.35, 0x2f9bff); tube(W + 0.6, 0.25, 0, 13 - H / 2 - 0.35, 0xff4d57);
    tube(0.25, H + 0.9, -W / 2 - 0.35, 13, 0x2f9bff); tube(0.25, H + 0.9, W / 2 + 0.35, 13, 0xff4d57);
    // truss legs
    const B = new GeoBuilder();
    for (const sx of [-W / 2 + 2, W / 2 - 2]) {
      for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) B.cyl(sx + dx, 3.6, -1.4 + dz, 0.09, 7.2, STEEL, 8);
      for (let y = 0.6; y < 7; y += 1.3) { B.geo(prim('cyl8'), xform(sx, y + 0.65, -2.0, 0, 0, Math.atan2(1.2, 1.3), 0.06, Math.hypot(1.2, 1.3), 0.06), STEEL); B.geo(prim('cyl8'), xform(sx, y + 0.65, -0.8, 0, 0, -Math.atan2(1.2, 1.3), 0.06, Math.hypot(1.2, 1.3), 0.06), STEEL); }
      B.box(sx - 1.2, 0, -2.6, sx + 1.2, 0.5, -0.2, '#9e988e');
    }
    this.group.add(meshOf(B));
    this.key = '';
    if (document.fonts) document.fonts.load('48px "Luckiest Guy"').then(() => { this.key = ''; }).catch(() => {});
  }
  update({ blue, red, time, note = '' }) {
    const key = `${blue}|${red}|${time}|${note}`;
    if (key === this.key) return; this.key = key;
    const x = this.ctx, W = 1024, H = 410;
    x.fillStyle = '#05070d'; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(255,255,255,0.035)'; for (let i = 0; i < W; i += 8) x.fillRect(i, 0, 3, H); for (let j = 0; j < H; j += 8) x.fillRect(0, j, W, 3);
    const neon = (txt, px, py, size, color, align = 'center') => {
      x.font = `${size}px "Luckiest Guy", "Arial Black", sans-serif`; x.textAlign = align; x.textBaseline = 'middle';
      x.shadowColor = color; x.shadowBlur = 34; x.fillStyle = color; x.fillText(txt, px, py); x.shadowBlur = 12; x.fillText(txt, px, py);
      x.shadowBlur = 0; x.fillStyle = 'rgba(255,255,255,0.85)'; x.font = `${size * 0.96}px "Luckiest Guy", "Arial Black", sans-serif`; x.fillText(txt, px, py);
    };
    neon('BLUE', 180, 80, 70, '#2f9bff'); neon('RED', W - 180, 80, 70, '#ff4d57');
    neon(String(blue), 180, 230, 200, '#2f9bff'); neon(String(red), W - 180, 230, 200, '#ff4d57');
    neon(time, W / 2, 200, 110, '#ffd626'); neon('TIME', W / 2, 92, 54, '#ffffff');
    if (note) neon(note, W / 2, 340, 52, '#ff7a1a');
    this.tex.needsUpdate = true;
  }
}
