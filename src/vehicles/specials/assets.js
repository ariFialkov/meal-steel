// Models for the special moves: cooks and their vats, puddles, cacti, a noodle net, the churro spinner, grenades, the
// BLT-9 drone kit, a laser, a squeeze bottle, the trojan gyro, a butter stick, the egg turret and eggs, tortillas,
// take-out boxes, bottles and pints, the cheese cannon, status shells (ice, cheese goo) and the keg tap.
// Geometry is built once and cached; every call returns a new object sharing it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GeoBuilder, prim, xform, rgb, mix } from '../../world/builder.js';
import { person } from '../../world/setpieces.js';

const GEO = new Map(), MAT = new Map();
const cached = (key, make) => { if (!GEO.has(key)) GEO.set(key, make()); return GEO.get(key); };
const cachedMat = (key, make) => { if (!MAT.has(key)) MAT.set(key, make()); return MAT.get(key); };
/** shared materials: 'vc' (vertex colours), 'vcGloss', 'steel', 'glass:<hex>', 'liquid:<hex>', 'glow:<hex>' */
export function mat(key) {
  if (MAT.has(key)) return MAT.get(key);
  const [kind, arg] = key.split(':'), col = arg ? parseInt(arg, 16) : 0xffffff;
  let m;
  switch (kind) {
    case 'vc': m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }); break;
    case 'vcGloss': m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.15 }); break;
    case 'vcMetal': m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.75 }); break;
    case 'steel': m = new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.28, metalness: 0.85 }); break;
    case 'glass': m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.72 }); break;
    case 'liquid': m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }); break;
    case 'glow': m = new THREE.MeshBasicMaterial({ color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }); break;
    case 'gloss': m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.3, metalness: 0.05 }); break;
    case 'metal': m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.4, metalness: 0.7 }); break;
    case 'ice': m = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55, flatShading: true }); break;
    default: m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 });
  }
  MAT.set(key, m); return m;
}
const mesh = (g, m, shadow = true) => { const o = new THREE.Mesh(g, typeof m === 'string' ? mat(m) : m); o.castShadow = shadow; o.userData.keepGeometry = true; return o; };
const lathe = (pts, seg = 20) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ------------------------------------------------------------------ people
/** A cook: white jacket, checked trousers, red neckerchief and a tall toque. calm / armsUp are two meshes to swap. */
export function cook(rng) {
  const look = { skin: rng.pick(['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac']), shirt: '#f6f5f0', pants: '#3b3b44', hair: '#2a1b12' };
  const hat = (b) => {
    b.geo(prim('cyl12'), xform(0, 2.05, -0.02, 0, 0, 0, 0.36, 0.36, 0.36), '#ffffff');
    b.geo(prim('sphere10'), xform(0, 2.3, -0.02, 0, 0, 0, 0.5, 0.32, 0.5), '#ffffff');
    b.geo(prim('cyl12'), xform(0, 1.5, 0.02, 0, 0, 0, 0.3, 0.07, 0.3), '#d62828');
    for (let k = 0; k < 2; k++) b.geo(prim('sphere10'), xform(0.13 - k * 0.26, 1.0, 0.16, 0, 0, 0, 0.05, 0.05, 0.03), '#c9c9c9'); // jacket buttons
  };
  const b1 = new GeoBuilder(); person(b1, 0, 0, 0, rng, 1, look, 'stand'); hat(b1);
  const b2 = new GeoBuilder(); person(b2, 0, 0, 0, rng, 1, look, 'panic'); hat(b2);
  const g = new THREE.Group(), calm = mesh(b1.build(), 'vc'), up = mesh(b2.build(), 'vc');
  up.visible = false; g.add(calm, up); g.userData = { calm, up };
  return g;
}

/** Steel stock pot with handles, full of something. */
export function vat(liquid) {
  const g = new THREE.Group();
  const body = cached('vatBody', () => lathe([[0, 0], [0.42, 0], [0.45, 0.04], [0.45, 0.66], [0.49, 0.7], [0.46, 0.72], [0.42, 0.7], [0.42, 0.06], [0, 0.06]], 24));
  g.add(mesh(body, 'steel'));
  const handle = cached('vatHandle', () => new THREE.TorusGeometry(0.1, 0.022, 6, 12, Math.PI));
  for (const s of [-1, 1]) { const h = mesh(handle, 'steel'); h.position.set(0.5 * s, 0.55, 0); h.rotation.set(0, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2); g.add(h); }
  const top = mesh(cached('vatLiquid', () => new THREE.CircleGeometry(0.42, 20).rotateX(-Math.PI / 2)), 'liquid:' + liquid.toString(16).padStart(6, '0'), false);
  top.position.y = 0.6; g.add(top);
  return g;
}

/** Glossy liquid puddle on the ground: an irregular blob with a few satellite drops. */
export function puddle(color, r = 3, seed = 1) {
  const key = 'puddle' + (seed % 6);
  const geo = cached(key, () => {
    const parts = [];
    const blob = (cx, cz, rad, n, s) => {
      const sh = new THREE.Shape();
      for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2, rr = rad * (0.78 + 0.22 * Math.sin(a * 3 + s) * Math.cos(a * 2 - s * 1.7) + 0.12 * hash(s * 31 + i)); const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr; if (i === 0) sh.moveTo(x, z); else sh.lineTo(x, z); }
      return new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2);
    };
    parts.push(blob(0, 0, 1, 40, seed));
    for (let k = 0; k < 6; k++) { const a = hash(seed * 7 + k) * Math.PI * 2, d = 1.05 + hash(seed * 13 + k) * 0.35; parts.push(blob(Math.cos(a) * d, Math.sin(a) * d, 0.07 + hash(k + seed) * 0.12, 10, k + seed)); }
    return mergeGeometries(parts.map((p) => p.toNonIndexed()));
  });
  const m = mesh(geo, 'liquid:' + color.toString(16).padStart(6, '0'), false);
  m.receiveShadow = true; m.scale.set(r, 1, r); m.rotation.y = seed;
  return m;
}

// ------------------------------------------------------------------ plants and food
/** Saguaro cactus, ribbed, with arms and a flower on top. ~3.2 m tall. */
export function cactus(seed = 0) {
  const geo = cached('cactus' + (seed % 3), () => {
    const b = new GeoBuilder();
    const ribbed = (r, h, segs = 20) => {
      const g = new THREE.CylinderGeometry(r, r * 1.05, h, segs, 6).toNonIndexed(); const P = g.attributes.position.array;
      for (let i = 0; i < P.length; i += 3) { const a = Math.atan2(P[i + 2], P[i]), k = 1 + 0.1 * Math.cos(a * 8); P[i] *= k; P[i + 2] *= k; }
      g.computeVertexNormals(); return g;
    };
    const green = '#3f8f3a', dark = '#2c6e2a';
    b.geo(ribbed(0.38, 2.6), xform(0, 1.3, 0), green);
    b.geo(new THREE.SphereGeometry(0.4, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), xform(0, 2.6, 0), green);
    const arms = seed % 3 === 0 ? [[1, 1.0, 1.9], [-1, 1.4, 2.3]] : seed % 3 === 1 ? [[1, 1.3, 2.4]] : [[-1, 0.9, 1.8], [1, 1.6, 2.5]];
    for (const [s, y0, y1] of arms) {
      b.geo(ribbed(0.2, 0.55, 14), xform(s * 0.55, y0, 0, 0, 0, Math.PI / 2), dark);
      b.geo(ribbed(0.2, y1 - y0, 14), xform(s * 0.82, (y0 + y1) / 2 + 0.05, 0), green);
      b.geo(new THREE.SphereGeometry(0.21, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), xform(s * 0.82, y1 + 0.05, 0), green);
    }
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; b.geo(prim('sphere10'), xform(Math.cos(a) * 0.12, 2.98, Math.sin(a) * 0.12, 0, 0, 0, 0.16, 0.08, 0.16), '#ff5fa2'); }
    b.geo(prim('sphere10'), xform(0, 3.0, 0, 0, 0, 0, 0.1, 0.1, 0.1), '#ffd23f');
    // spines: little pale ticks down the ribs
    for (let k = 0; k < 40; k++) { const a = (k % 8) / 8 * Math.PI * 2, y = 0.3 + Math.floor(k / 8) * 0.48; b.geo(prim('box'), xform(Math.cos(a) * 0.43, y, Math.sin(a) * 0.43, -a, 0, 0, 0.02, 0.02, 0.12), '#f3efd0'); }
    return b.build();
  });
  return mesh(geo, 'vc');
}

/** Star-section churro, sugar speckled, lying along +z. */
function churroGeo(len, r = 0.22) {
  return cached('churro' + len + ':' + r, () => {
    const sh = new THREE.Shape(), n = 8;
    for (let i = 0; i <= n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2, rr = i % 2 ? r * 0.72 : r; if (i === 0) sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: true, bevelSize: r * 0.25, bevelThickness: r * 0.4, bevelSegments: 2, steps: Math.max(1, Math.round(len * 2)) });
    g.translate(0, 0, -len / 2);
    const cols = new Float32Array(g.attributes.position.count * 3), base = rgb('#c27a2c'), sugar = rgb('#f6e7c8');
    for (let i = 0; i < g.attributes.position.count; i++) { const c = hash(i * 0.37) < 0.18 ? sugar : base; cols.set([c[0], c[1], c[2]], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.computeVertexNormals();
    return g;
  });
}
/** The churro spinner: a fold-out arm with a 3.6 m churro across it. The churro group spins about y. */
export function churroSpinner() {
  const g = new THREE.Group();
  const arm = mesh(cached('spinArm', () => new THREE.CylinderGeometry(0.12, 0.16, 0.6, 12)), 'steel'); arm.position.y = 0.3; g.add(arm);
  const hub = mesh(cached('spinHub', () => new THREE.CylinderGeometry(0.28, 0.28, 0.18, 16)), 'steel'); hub.position.y = 0.05; g.add(hub);
  const rotor = new THREE.Group(); const ch = mesh(churroGeo(5.0, 0.24), 'vc'); ch.rotation.y = Math.PI / 2; rotor.add(ch); g.add(rotor);
  // steel end caps so it reads as a machine part, not a snack
  const cap = cached('spinCap', () => new THREE.CylinderGeometry(0.27, 0.27, 0.16, 14).rotateZ(Math.PI / 2));
  for (const s of [-1, 1]) { const c = mesh(cap, 'steel'); c.position.x = s * 2.5; rotor.add(c); }
  g.userData.rotor = rotor; return g;
}
/** Sugar-cinnamon grenade: a short sugared churro bomb with a red pin ring. */
export function grenade() {
  const g = new THREE.Group();
  const body = mesh(churroGeo(0.55, 0.2), 'vc'); g.add(body);
  const ring = mesh(cached('pin', () => new THREE.TorusGeometry(0.09, 0.02, 6, 14)), 'std:d62828'); ring.position.z = 0.42; g.add(ring);
  return g;
}

/** A woven net of noodles (flat, facing +z) or draped over a truck (dome). */
export function noodleNet(dome = false) {
  const geo = cached(dome ? 'netDome' : 'netFlat', () => {
    const tubes = [], n = 7, S = 2.2;
    const map = (u, v, w) => {
      if (!dome) return new THREE.Vector3(u * S, v * S, w);
      // drape over a truck-sized half-ellipsoid
      const a = u * Math.PI * 0.5, b = v * Math.PI * 0.5;
      return new THREE.Vector3(Math.sin(a) * Math.cos(b) * 1.7, 0.2 + Math.cos(a) * Math.cos(b) * 3.0, Math.sin(b) * 3.3);
    };
    for (let i = 0; i < n; i++) for (const dir of [0, 1]) {
      const pts = [];
      for (let k = 0; k <= 16; k++) { const t = -1 + (2 * k) / 16, s = -1 + (2 * i) / (n - 1), wob = Math.sin(t * 9 + i * 2.1) * 0.05; pts.push(dir ? map(s + wob * 0.3, t, wob) : map(t, s + wob * 0.3, wob)); }
      tubes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.055, 5).toNonIndexed());
    }
    return mergeGeometries(tubes);
  });
  return mesh(geo, 'std:f2c94c');
}

/** Tortilla with a charred, speckled face; slightly dished. */
export function tortilla() {
  const geo = cached('tortilla', () => { const g = new THREE.CircleGeometry(0.6, 24, 0, Math.PI * 2); const P = g.attributes.position.array; for (let i = 0; i < P.length; i += 3) P[i + 2] = (P[i] * P[i] + P[i + 1] * P[i + 1]) * 0.25; g.computeVertexNormals(); return g; });
  const m = mat('tortillaTex');
  if (!m.map) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    x.fillStyle = '#e8c88d'; x.fillRect(0, 0, 128, 128);
    for (let k = 0; k < 70; k++) { x.fillStyle = `rgba(${120 + hash(k) * 40},${70 + hash(k + 9) * 30},30,${0.3 + hash(k + 3) * 0.5})`; x.beginPath(); x.arc(hash(k * 3) * 128, hash(k * 7) * 128, 2 + hash(k * 11) * 6, 0, Math.PI * 2); x.fill(); }
    m.map = new THREE.CanvasTexture(c); m.map.colorSpace = THREE.SRGBColorSpace; m.side = THREE.DoubleSide; m.roughness = 0.85; m.needsUpdate = true;
  }
  return mesh(geo, m);
}

/** Classic folded take-out box: tapered, white with a red pagoda print and a wire handle. */
export function takeoutBox() {
  const geo = cached('takeout', () => {
    const b = new GeoBuilder();
    const body = new THREE.CylinderGeometry(0.34, 0.24, 0.42, 4, 1).rotateY(Math.PI / 4);
    b.geo(body, xform(0, 0.21, 0), '#fbfbf6');
    b.geo(new THREE.CylinderGeometry(0.3, 0.34, 0.06, 4, 1).rotateY(Math.PI / 4), xform(0, 0.45, 0), '#f1f1ea');
    b.geo(prim('box'), xform(0, 0.24, 0.205, 0, 0.12, 0, 0.26, 0.16, 0.01), '#d62828'); // printed pagoda panel
    b.geo(prim('box'), xform(0, 0.33, 0.21, 0, 0.12, 0, 0.3, 0.04, 0.01), '#d62828');
    b.geo(new THREE.TorusGeometry(0.2, 0.01, 5, 14, Math.PI), xform(0, 0.48, 0), '#8a8f98');
    return b.build();
  });
  return mesh(geo, 'vc');
}

/** Bottle (beer / wine) or a pint glass with foam. */
export function bottle(kind = 0) {
  if (kind === 2) {
    const g = new THREE.Group();
    g.add(mesh(cached('pint', () => lathe([[0.1, 0], [0.12, 0.3], [0.12, 0.31], [0.11, 0.31], [0.09, 0.01], [0, 0.01]], 14)), 'glass:ffcf6b'));
    const foam = mesh(cached('foam', () => new THREE.SphereGeometry(0.12, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), 'std:fff8e6'); foam.position.y = 0.3; g.add(foam);
    return g;
  }
  return mesh(cached('bottle', () => lathe([[0, 0], [0.08, 0], [0.085, 0.02], [0.085, 0.24], [0.06, 0.3], [0.03, 0.34], [0.03, 0.44], [0.035, 0.45], [0, 0.45]], 14)), kind ? 'glass:6b3a12' : 'glass:2f7a3b');
}

// ------------------------------------------------------------------ hardware
/** The Howhizzer: a .50 cal cheese-whiz cannon on a turret ring, with ammo can and cooling shroud. Barrel along +z. */
export function cheeseCannon() {
  const g = new THREE.Group();
  const base = mesh(cached('cc_ring', () => new THREE.CylinderGeometry(0.55, 0.62, 0.22, 24)), 'metal:3b3f46'); g.add(base);
  const yoke = new THREE.Group(); yoke.position.y = 0.2; g.add(yoke);
  const geo = cached('cc_gun', () => {
    const b = new GeoBuilder(), gm = '#2f3238', chr = '#9aa1ab', ch = '#ffb21f';
    for (const s of [-1, 1]) b.geo(prim('box'), xform(s * 0.32, 0.3, 0, 0, 0, 0, 0.08, 0.6, 0.4), gm);           // yoke arms
    b.geo(prim('box'), xform(0, 0.42, -0.05, 0, 0, 0, 0.46, 0.36, 0.9), gm);                                  // receiver
    b.geo(prim('box'), xform(0.32, 0.36, -0.15, 0, 0, 0, 0.26, 0.3, 0.42), ch);                               // ammo can (cheese)
    b.geo(prim('box'), xform(0.32, 0.53, -0.15, 0, 0, 0, 0.28, 0.04, 0.44), '#c98a12');
    b.geo(prim('cyl14'), xform(0, 0.45, 0.85, 0, Math.PI / 2, 0, 0.22, 1.2, 0.22), gm);                       // cooling shroud
    for (let k = 0; k < 8; k++) b.geo(prim('cyl14'), xform(0, 0.45, 0.35 + k * 0.14, 0, Math.PI / 2, 0, 0.26, 0.03, 0.26), chr);
    b.geo(prim('cyl10'), xform(0, 0.45, 1.75, 0, Math.PI / 2, 0, 0.1, 0.8, 0.1), chr);                        // barrel
    b.geo(prim('box'), xform(0, 0.45, 2.18, 0, 0, 0, 0.2, 0.16, 0.18), gm);                                   // muzzle brake
    for (const s of [-1, 1]) b.geo(prim('box'), xform(s * 0.105, 0.45, 2.18, 0, 0, 0, 0.01, 0.1, 0.12), '#111111');
    b.geo(prim('box'), xform(0, 0.68, 0.1, 0, 0, 0, 0.06, 0.12, 0.3), gm);                                   // sight
    return b.build();
  });
  const gun = mesh(geo, 'vcMetal'); yoke.add(gun);
  g.userData = { yoke, muzzle: new THREE.Vector3(0, 0.65, 2.3) };
  return g;
}
/** Glob of cheese whiz (round and splat). */
export function whizGlob() {
  return mesh(cached('whiz', () => { const g = new THREE.IcosahedronGeometry(0.22, 1); const P = g.attributes.position.array; for (let i = 0; i < P.length; i += 3) { const k = 1 + 0.15 * Math.sin(P[i] * 20 + P[i + 1] * 13); P[i] *= k; P[i + 1] *= k * 0.85; P[i + 2] *= k * 1.4; } g.computeVertexNormals(); return g; }), 'liquid:ffa51f');
}

/** BLT-9 kit for the sandwich: swept wings, tail fins and a jet engine. Children scale in when it transforms. */
export function droneKit(len = 3.8) {
  const g = new THREE.Group();
  const wingGeo = cached('wing', () => {
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(2.3, -0.7); sh.lineTo(2.45, -1.25); sh.lineTo(0, -1.6); sh.lineTo(0, 0);
    const w = new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 }); w.rotateX(Math.PI / 2); return w;
  });
  const wings = [];
  for (const s of [-1, 1]) {
    const w = mesh(wingGeo, 'std:9aa3ad'); w.scale.x = s; w.position.set(s * 0.55, 0.5, 0.6); g.add(w); wings.push(w);
    const tip = mesh(cached('wingTip', () => new THREE.BoxGeometry(0.12, 0.1, 0.55)), 'std:d62828'); tip.position.set(s * 2.95, 0.5, -0.3); g.add(tip); wings.push(tip);
  }
  const fin = mesh(cached('fin', () => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(-0.9, 0); sh.lineTo(-1.1, 1.1); sh.lineTo(-0.6, 1.1); sh.lineTo(0, 0); const f = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: false }); f.rotateY(Math.PI / 2); f.translate(-0.035, 0, 0); return f; }), 'std:9aa3ad');
  fin.position.set(0, 0.9, -len / 2 + 0.6); g.add(fin);
  const stab = mesh(cached('stab', () => new THREE.BoxGeometry(1.8, 0.06, 0.55)), 'std:9aa3ad'); stab.position.set(0, 0.95, -len / 2 + 0.25); g.add(stab);
  const eng = new THREE.Group(); eng.position.set(0, 0.95, -len / 2 + 0.1); g.add(eng);
  eng.add(mesh(cached('engBody', () => new THREE.CylinderGeometry(0.32, 0.36, 1.2, 18).rotateX(Math.PI / 2)), 'steel'));
  const intake = mesh(cached('engIntake', () => new THREE.TorusGeometry(0.33, 0.05, 6, 18)), 'std:3b3f46'); intake.position.z = 0.6; eng.add(intake);
  const nozzle = mesh(cached('engNozzle', () => new THREE.CylinderGeometry(0.36, 0.26, 0.35, 18, 1, true).rotateX(Math.PI / 2)), 'std:3b3f46'); nozzle.position.z = -0.75; eng.add(nozzle);
  const flame = new THREE.Mesh(cached('engFlame', () => new THREE.ConeGeometry(0.24, 1.4, 14, 1, true).rotateX(-Math.PI / 2)), mat('glow:ff8a2a')); flame.position.z = -1.5; flame.visible = false; eng.add(flame);
  g.userData = { wings, fin, stab, eng, flame };
  return g;
}

/** Two-axis steel gimbal (yaw ring outside, pitch ring inside) the laser cone swings round in. */
export function gimbal(r = 0.9) {
  const g = new THREE.Group();
  const ring = (rr, t) => cached('gimbal' + rr + ':' + t, () => new THREE.TorusGeometry(rr, t, 8, 36));
  const yaw = new THREE.Group(), pitch = new THREE.Group();
  const outer = mesh(ring(r, 0.06), 'steel'); outer.rotation.x = Math.PI / 2; yaw.add(outer);
  const inner = mesh(ring(r * 0.78, 0.05), 'metal:ff5fa2'); pitch.add(inner);
  // pins joining the rings, and bolts round the outer ring
  const pin = cached('gimbalPin', () => new THREE.CylinderGeometry(0.07, 0.07, 0.3, 10).rotateZ(Math.PI / 2));
  for (const s of [-1, 1]) { const p = mesh(pin, 'steel'); p.position.x = s * r * 0.89; yaw.add(p); }
  const bolt = cached('gimbalBolt', () => new THREE.SphereGeometry(0.06, 8, 6));
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, b = mesh(bolt, 'metal:3b3f46'); b.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r); yaw.add(b); }
  yaw.add(pitch); g.add(yaw); g.userData = { yaw, pitch };
  return g;
}

/** Laser beam along +z: a white-hot core, a pink sheath and a flare at the emitter. Length via scale.z. */
export function laserBeam() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(cached('lzCore', () => new THREE.CylinderGeometry(0.11, 0.11, 1, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5)), mat('glow:ffffff'));
  // a solid hot-pink tube under the glow, so the beam still reads against a pale, sunlit plaza (additive light alone washes out)
  const body = new THREE.Mesh(cached('lzBody', () => new THREE.CylinderGeometry(0.22, 0.22, 1, 14, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5)), cachedMat('lzBody', () => new THREE.MeshBasicMaterial({ color: 0xff2e8c, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false })));
  const sheath = new THREE.Mesh(cached('lzSheath', () => new THREE.CylinderGeometry(0.36, 0.36, 1, 14, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5)), mat('glow:ff5fa2'));
  core.renderOrder = 6;
  const halo = new THREE.Mesh(cached('lzHalo', () => new THREE.CylinderGeometry(0.7, 0.7, 1, 14, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5)), mat('glow:6fd8ff'));
  halo.material = halo.material.clone(); halo.material.opacity = 0.25;
  const beam = new THREE.Group(); beam.add(body, core, sheath, halo); g.add(beam);
  const flare = new THREE.Mesh(cached('lzFlare', () => new THREE.SphereGeometry(0.55, 14, 10)), mat('glow:ff9ad1')); g.add(flare);
  g.userData = { beam, flare, sheath };
  return g;
}

/** Tzatziki squeeze bottle: white body, green label, red nozzle. Points along +z. */
export function squeezeBottle() {
  const geo = cached('squeeze', () => {
    const b = new GeoBuilder();
    b.geo(lathe([[0, 0], [0.3, 0], [0.32, 0.08], [0.32, 0.95], [0.25, 1.1], [0.12, 1.18], [0, 1.18]], 16), xform(0, 0, 0, 0, Math.PI / 2), '#f8f8f2');
    b.geo(prim('cyl14'), xform(0, 0, 0.55, 0, Math.PI / 2, 0, 0.66, 0.35, 0.66), '#5aa84c');
    b.geo(new THREE.ConeGeometry(0.11, 0.42, 12), xform(0, 0, 1.38, 0, Math.PI / 2), '#d62828');
    return b.build();
  });
  return mesh(geo, 'vcGloss');
}

/** The trojan gyro: a wooden half-pita stuffed with carved filling, on a plank cart with wooden wheels. */
export function trojanGyro() {
  const geo = cached('trojan', () => {
    const b = new GeoBuilder(), wood = '#a06b38', dark = '#7a4c22', light = '#c08a50';
    // cart: planks and axles
    for (let k = 0; k < 6; k++) b.geo(prim('box'), xform(0, 0.62, -1.25 + k * 0.5, 0, 0, 0, 1.9, 0.12, 0.46), k % 2 ? wood : light);
    for (const s of [-1, 1]) b.geo(prim('box'), xform(s * 0.85, 0.5, 0, 0, 0, 0, 0.14, 0.14, 3.1), dark);
    for (const [x, z] of [[-1, -1.1], [1, -1.1], [-1, 1.1], [1, 1.1]]) {
      b.geo(prim('cyl16'), xform(x, 0.42, z, 0, 0, Math.PI / 2, 0.84, 0.16, 0.84), dark);
      for (let k = 0; k < 4; k++) b.geo(prim('box'), xform(x + Math.sign(x) * 0.09, 0.42, z, 0, (k / 4) * Math.PI, 0, 0.04, 0.72, 0.06), light);
    }
    // the pita: a thick half disc standing up, wood grain bands
    const pita = new THREE.CylinderGeometry(1.45, 1.45, 0.9, 28, 1, false, 0, Math.PI).toNonIndexed();
    pita.rotateZ(Math.PI / 2); pita.rotateY(Math.PI / 2);
    b.geo(pita, xform(0, 0.7, 0), wood);
    for (let k = 0; k < 6; k++) b.geo(new THREE.TorusGeometry(0.45 + k * 0.17, 0.018, 4, 24, Math.PI), xform(0, 0.72, 0, Math.PI / 2, 0, 0, 1, 1, 1), dark);
    // carved filling poking out of the top
    for (let k = 0; k < 14; k++) { const a = 0.25 + (k / 13) * (Math.PI - 0.5), r = 1.45; b.geo(prim('sphere10'), xform(Math.cos(a) * r * 0.98 * (k % 2 ? 1 : 0.92), 0.7 + Math.sin(a) * r, (hash(k) - 0.5) * 0.5, 0, 0, 0, 0.36, 0.3, 0.36), k % 3 ? light : '#8c5a2b'); }
    return b.build();
  });
  return mesh(geo, 'vc');
}

/** A giant stick of butter on a mechanical arm (the arm hinge is the group origin; the butter trails along -z). */
export function butterStick() {
  const g = new THREE.Group();
  const arm = mesh(cached('butterArm', () => new THREE.BoxGeometry(0.16, 0.16, 1.1).translate(0, 0, -0.55)), 'steel'); g.add(arm);
  const b = new THREE.Group(); b.position.z = -1.1; g.add(b);
  const butter = mesh(cached('butter', () => new RoundedBoxGeometry(0.6, 0.5, 1.6, 3, 0.08).translate(0, 0, -0.75)), 'gloss:ffe27a'); b.add(butter);
  const wrap = mesh(cached('butterWrap', () => new THREE.BoxGeometry(0.64, 0.54, 0.7).translate(0, 0, -0.25)), 'std:f7f4ea'); b.add(wrap);
  const stripe = mesh(cached('butterStripe', () => new THREE.BoxGeometry(0.66, 0.08, 0.72).translate(0, 0.1, -0.25)), 'std:2f6fd6'); b.add(stripe);
  g.userData = { stick: b };
  return g;
}
/** Egg (shell) and the egg turret: drum, yoke, barrel and a clear hopper of eggs. Barrel along +z. */
export function egg() { return mesh(cached('egg', () => new THREE.SphereGeometry(0.17, 12, 8).scale(1, 1.3, 1)), 'std:fff3df'); }
export function eggTurret() {
  const g = new THREE.Group();
  const geo = cached('eggTurret', () => {
    const b = new GeoBuilder(), gm = '#3b3f46', y = '#ffb100';
    b.geo(prim('cyl20'), xform(0, 0.12, 0, 0, 0, 0, 1.0, 0.24, 1.0), gm);
    b.geo(prim('cyl20'), xform(0, 0.26, 0, 0, 0, 0, 0.8, 0.06, 0.8), y);
    for (const s of [-1, 1]) b.geo(prim('box'), xform(s * 0.32, 0.55, 0, 0, 0, 0, 0.1, 0.5, 0.36), gm);
    b.geo(prim('box'), xform(0, 0.62, 0.05, 0, 0, 0, 0.5, 0.32, 0.7), gm);
    b.geo(prim('cyl14'), xform(0, 0.62, 0.85, 0, Math.PI / 2, 0, 0.26, 1.1, 0.26), '#9aa1ab');
    b.geo(prim('cyl14'), xform(0, 0.62, 1.4, 0, Math.PI / 2, 0, 0.32, 0.12, 0.32), y);
    return b.build();
  });
  const gun = new THREE.Group(); g.add(gun); gun.add(mesh(geo, 'vcMetal'));
  const hopper = mesh(cached('hopper', () => new THREE.SphereGeometry(0.34, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)), 'glass:dff4ff'); hopper.position.set(0, 0.78, -0.12); gun.add(hopper);
  for (let k = 0; k < 6; k++) { const e = egg(); e.scale.setScalar(0.8); e.position.set(Math.cos(k) * 0.14, 0.86 + (k % 2) * 0.08, -0.12 + Math.sin(k) * 0.14); gun.add(e); }
  g.userData = { gun, muzzle: new THREE.Vector3(0, 0.62, 1.5) };
  return g;
}

/** A brass tap screwed into Barmaggeddon's keg. */
export function kegTap() {
  return mesh(cached('tap', () => { const b = new GeoBuilder(), brass = '#c9a03a'; b.geo(prim('cyl10'), xform(0, 0, 0.12, 0, Math.PI / 2, 0, 0.09, 0.24, 0.09), brass); b.geo(prim('cyl10'), xform(0, -0.08, 0.25, 0, 0, 0, 0.07, 0.18, 0.07), brass); b.geo(prim('cyl10'), xform(0, 0.16, 0.2, 0, 0, 0, 0.05, 0.3, 0.05), '#2a2a2a'); return b.build(); }), 'vcMetal');
}

// ------------------------------------------------------------------ status shells
/** Faceted ice shell with icicles, sized to a truck. */
export function iceShell() {
  const g = new THREE.Group();
  const shell = mesh(cached('iceShell', () => { const s = new THREE.IcosahedronGeometry(1, 1); const P = s.attributes.position.array; for (let i = 0; i < P.length; i += 3) { const k = 1 + (hash(i) - 0.5) * 0.12; P[i] *= k; P[i + 1] *= k; P[i + 2] *= k; } s.computeVertexNormals(); return s; }), 'ice', false);
  shell.scale.set(1.75, 2.15, 3.35); shell.position.y = 1.7; g.add(shell);
  const icicle = cached('icicle', () => new THREE.ConeGeometry(0.09, 0.5, 6).rotateX(Math.PI));
  for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2, ic = mesh(icicle, 'ice', false); ic.position.set(Math.cos(a) * 1.55, 0.55 + hash(k) * 0.3, Math.sin(a) * 2.9); ic.scale.y = 0.6 + hash(k + 4); g.add(ic); }
  return g;
}
/** Molten cheese gumming up the axles: gooey blobs at each wheel. */
export function cheeseGoo(wheelPositions) {
  const g = new THREE.Group();
  const blob = cached('goo', () => { const s = new THREE.IcosahedronGeometry(0.5, 1); const P = s.attributes.position.array; for (let i = 0; i < P.length; i += 3) { const k = 1 + Math.sin(P[i] * 9 + P[i + 2] * 7) * 0.18; P[i] *= k * 0.8; P[i + 1] *= k; P[i + 2] *= k; } s.computeVertexNormals(); return s; });
  for (const p of wheelPositions) { const m = mesh(blob, 'liquid:ffa51f', false); m.position.copy(p); m.position.y = Math.max(0.3, p.y * 0.7); g.add(m); }
  return g;
}

/** A glowing ball (flares, muzzle flashes, fuses). */
export function glowBall(color = 0xffd166, r = 0.3) {
  const m = new THREE.Mesh(cached('glowBall', () => new THREE.SphereGeometry(1, 12, 8)), mat('glow:' + color.toString(16).padStart(6, '0')));
  m.scale.setScalar(r); return m;
}

export { mix };
