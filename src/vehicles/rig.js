// Truck rig: the imported models are single merged meshes, so the wheels are found geometrically and split out into
// their own meshes (spinning and steering about their hubs); the rest stays as the body, which rides on suspension.
//
// Wheel finding, in model space (forward +z, ground y = lowest vertex):
//  1. on each side, vertices touching the ground cluster along z: one cluster per axle (the tyre's contact patch);
//  2. around each cluster a circle is fitted in the side (z,y) plane: the radius whose rim collects the most vertices,
//     with the hub at ground + radius;
//  3. the tyre's inner and outer faces come from the x range of the contact patch.
// Triangles fully inside that cylinder become the wheel; everything else (including arches) stays on the body.
import * as THREE from 'three';

/** Flatten a model (any node transforms, quantized attributes) into one float geometry in model space. */
export function bakeGeometry(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const parts = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry, m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), nm = new THREE.Matrix3().getNormalMatrix(m);
    const idx = g.index, pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv, n = idx ? idx.count : pos.count;
    const P = new Float32Array(n * 3), N = nor ? new Float32Array(n * 3) : null, U = uv ? new Float32Array(n * 2) : null, v = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      const i = idx ? idx.getX(k) : k;
      v.fromBufferAttribute(pos, i).applyMatrix4(m); P[k * 3] = v.x; P[k * 3 + 1] = v.y; P[k * 3 + 2] = v.z;
      if (N) { v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); N[k * 3] = v.x; N[k * 3 + 1] = v.y; N[k * 3 + 2] = v.z; }
      if (U) { U[k * 2] = uv.getX(i); U[k * 2 + 1] = uv.getY(i); }
    }
    parts.push({ P, N, U, material: o.material });
  });
  return parts;
}

/**
 * Connected pieces of a triangle soup (vertices welded by position): returns an Int32Array island id per triangle.
 * Separate objects in a merged model (a sausage lying in its bun, fries in a bucket) come out as separate islands.
 */
export function islandsOf(P) {
  const nt = P.length / 9, parent = new Int32Array(nt); for (let i = 0; i < nt; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const owner = new Map();
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) {
    const i = (t * 3 + k) * 3, key = `${Math.round(P[i] * 2000)},${Math.round(P[i + 1] * 2000)},${Math.round(P[i + 2] * 2000)}`;
    const o = owner.get(key);
    if (o === undefined) owner.set(key, t); else { const ra = find(o), rb = find(t); if (ra !== rb) parent[ra] = rb; }
  }
  const id = new Int32Array(nt); for (let t = 0; t < nt; t++) id[t] = find(t);
  return id;
}

/** Find the wheels of a baked model. Returns [{ side, z, y, r, x0, x1 }] (x0 < x1). */
export function findWheels(P) {
  let minY = Infinity, maxAX = 0;
  for (let i = 0; i < P.length; i += 3) { minY = Math.min(minY, P[i + 1]); maxAX = Math.max(maxAX, Math.abs(P[i])); }
  const wheels = [];
  for (const side of [1, -1]) {
    // contact patch vertices on this side
    const contact = [];
    for (let i = 0; i < P.length; i += 3) if (P[i + 1] < minY + 0.1 && P[i] * side > maxAX * 0.25) contact.push(i);
    contact.sort((a, b) => P[a + 2] - P[b + 2]);
    const clusters = []; let cur = [];
    for (const i of contact) { if (cur.length && P[i + 2] - P[cur[cur.length - 1] + 2] > 0.45) { clusters.push(cur); cur = []; } cur.push(i); }
    if (cur.length) clusters.push(cur);
    for (const c of clusters) {
      if (c.length < 3) continue;
      let zMin = Infinity, zMax = -Infinity, xMin = Infinity, xMax = -Infinity;
      for (const i of c) { zMin = Math.min(zMin, P[i + 2]); zMax = Math.max(zMax, P[i + 2]); xMin = Math.min(xMin, P[i]); xMax = Math.max(xMax, P[i]); }
      const zc = (zMin + zMax) / 2;
      // vertices near this axle on this side, low enough to be tyre
      const near = [];
      for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i + 2] - zc) < 1.1 && P[i + 1] < minY + 1.6 && P[i] * side > maxAX * 0.2) near.push(i);
      let best = null;
      for (let r = 0.28; r <= 0.8; r += 0.01) for (let dz = -0.2; dz <= 0.2001; dz += 0.04) {
        const hy = minY + r, hz = zc + dz;
        let rim = 0, inside = 0;
        for (const i of near) { const d = Math.hypot(P[i + 1] - hy, P[i + 2] - hz); if (Math.abs(d - r) < 0.045) rim++; else if (d < r) inside++; }
        const score = rim / Math.sqrt(r) + inside * 0.05;
        if (!best || score > best.score) best = { score, r, hy, hz };
      }
      if (!best) continue;
      // tyre faces: x range of vertices on the rim/inside the circle near the contact x range
      let x0 = Infinity, x1 = -Infinity;
      for (const i of near) { const d = Math.hypot(P[i + 1] - best.hy, P[i + 2] - best.hz); if (d < best.r * 1.02 && P[i] >= Math.min(xMin, xMax) - 0.25 && P[i] <= Math.max(xMin, xMax) + 0.25) { x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); } }
      wheels.push({ side, z: best.hz, y: best.hy, r: best.r, x0, x1, score: best.score, contact: c.length });
    }
  }
  return wheels;
}

/**
 * Split a loaded model into { body: Mesh, wheels: [{ mesh (pivot at hub), side, front, r }] }.
 * Returns null when the wheel search does not find a plausible set (the model then stays rigid).
 */
export function rigTruck(root, partDefs = {}) {
  const parts = bakeGeometry(root);
  if (parts.length !== 1) return null; // our imports are single-mesh models
  const { P, N, U, material } = parts[0];
  const found = findWheels(P).filter((w) => w.r > 0.25 && w.x1 - w.x0 > 0.12);
  // all wheels of a truck are the same size: an axle whose fit came out much bigger than the smallest (it caught a
  // bumper or a skirt) takes the smallest radius, hub back at ground + radius
  if (found.length) {
    const minY = Math.min(...found.map((w) => w.y - w.r)), rMin = Math.min(...found.map((w) => w.r));
    for (const w of found) if (w.r > rMin * 1.18) { w.r = rMin; w.y = minY + rMin; }
  }
  const sides = [1, -1].map((s) => found.filter((w) => w.side === s));
  if (sides.some((l) => l.length < 2 || l.length > 3)) return null;
  const inWheel = new Int16Array(P.length / 9).fill(-1);
  // a triangle is tyre when it sits in the wheel's slab and inside its circle (a little slack for bulging treads;
  // a triangle whose centre is inside may poke out further)
  const triIn = (t, w) => {
    let maxD = 0, cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) {
      const i = (t * 3 + k) * 3, x = P[i], y = P[i + 1], z = P[i + 2];
      if (x < w.x0 - 0.05 || x > w.x1 + 0.05) return false;
      maxD = Math.max(maxD, Math.hypot(y - w.y, z - w.z)); cy += y / 3; cz += z / 3;
    }
    return maxD < w.r * 1.1 || (maxD < w.r * 1.3 && Math.hypot(cy - w.y, cz - w.z) < w.r * 0.98);
  };
  for (let t = 0; t < inWheel.length; t++) for (let wi = 0; wi < found.length; wi++) if (triIn(t, found[wi])) { inWheel[t] = wi; break; }
  // named moving parts. mode 'box' (default): body triangles whose centre lies in the box (a cut, for things joined
  // to the body); 'islands': whole separate pieces whose bounds fit in the box (optionally at least minSize big);
  // 'each': like 'islands' but every piece becomes its own part (name0, name1...), pivoting at its base
  const partList = []; // { name, id, pivot, bbox }
  let isl = null;
  for (const [name, def] of Object.entries(partDefs)) {
    const [x0, y0, z0, x1, y1, z1] = def.box, mode = def.mode || 'box';
    if (mode === 'box') {
      const id = 100 + partList.length; partList.push({ name, id, pivot: def.pivot });
      for (let t = 0; t < inWheel.length; t++) {
        if (inWheel[t] >= 0) continue;
        let cx = 0, cy = 0, cz = 0; for (let j = 0; j < 3; j++) { cx += P[t * 9 + j * 3] / 3; cy += P[t * 9 + j * 3 + 1] / 3; cz += P[t * 9 + j * 3 + 2] / 3; }
        if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1 && cz >= z0 && cz <= z1) inWheel[t] = id;
      }
      continue;
    }
    isl = isl || islandsOf(P);
    const bounds = new Map();
    for (let t = 0; t < inWheel.length; t++) {
      if (inWheel[t] >= 0) continue;
      let b = bounds.get(isl[t]); if (!b) bounds.set(isl[t], b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity, []]);
      b[6].push(t);
      for (let j = 0; j < 3; j++) { const i = (t * 3 + j) * 3; for (let a = 0; a < 3; a++) { b[a] = Math.min(b[a], P[i + a]); b[a + 3] = Math.max(b[a + 3], P[i + a]); } }
    }
    const tol = 0.03, min = def.minSize || [0, 0, 0], max = def.maxSize || [99, 99, 99];
    const fits = [...bounds.values()].filter((b) => b[0] >= x0 - tol && b[1] >= y0 - tol && b[2] >= z0 - tol && b[3] <= x1 + tol && b[4] <= y1 + tol && b[5] <= z1 + tol && b[3] - b[0] >= min[0] && b[4] - b[1] >= min[1] && b[5] - b[2] >= min[2] && b[3] - b[0] <= max[0] && b[4] - b[1] <= max[1] && b[5] - b[2] <= max[2]);
    if (mode === 'each') {
      fits.sort((a, b) => a[2] - b[2] || a[0] - b[0]).forEach((b, k) => {
        const id = 100 + partList.length; partList.push({ name: name + k, id, pivot: [(b[0] + b[3]) / 2, b[1], (b[2] + b[5]) / 2], bbox: b.slice(0, 6) });
        for (const t of b[6]) inWheel[t] = id;
      });
    } else {
      const id = 100 + partList.length, bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (const b of fits) { for (const t of b[6]) inWheel[t] = id; for (let a = 0; a < 3; a++) { bb[a] = Math.min(bb[a], b[a]); bb[a + 3] = Math.max(bb[a + 3], b[a + 3]); } }
      partList.push({ name, id, pivot: def.pivot || [(bb[0] + bb[3]) / 2, bb[1], (bb[2] + bb[5]) / 2], bbox: bb });
    }
  }
  const build = (sel, ox = 0, oy = 0, oz = 0) => {
    const tris = []; for (let t = 0; t < inWheel.length; t++) if (sel(inWheel[t])) tris.push(t);
    const p = new Float32Array(tris.length * 9), n = N ? new Float32Array(tris.length * 9) : null, u = U ? new Float32Array(tris.length * 6) : null;
    tris.forEach((t, k) => {
      for (let j = 0; j < 9; j++) { p[k * 9 + j] = P[t * 9 + j] - (j % 3 === 0 ? ox : j % 3 === 1 ? oy : oz); if (n) n[k * 9 + j] = N[t * 9 + j]; }
      if (u) for (let j = 0; j < 6; j++) u[k * 6 + j] = U[t * 6 + j];
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    if (n) g.setAttribute('normal', new THREE.BufferAttribute(n, 3)); if (u) g.setAttribute('uv', new THREE.BufferAttribute(u, 2));
    g.computeBoundingSphere(); return { g, count: tris.length };
  };
  const wheels = [];
  const frontZ = Math.max(...found.map((w) => w.z));
  for (let wi = 0; wi < found.length; wi++) {
    const w = found[wi], hx = (w.x0 + w.x1) / 2, { g, count } = build((v) => v === wi, hx, w.y, w.z);
    if (count < 12) return null; // nothing that looks like a tyre
    const mesh = new THREE.Mesh(g, material); mesh.castShadow = true;
    const pivot = new THREE.Group(); pivot.position.set(hx, w.y, w.z); pivot.add(mesh);
    wheels.push({ pivot, mesh, side: w.side, front: w.z > frontZ - 0.3, r: w.r, z: w.z, x: hx });
  }
  const body = new THREE.Mesh(build((v) => v < 0).g, material); body.castShadow = true; body.receiveShadow = true;
  const partsOut = {};
  for (const pd of partList) {
    const [px, py, pz] = pd.pivot, { g, count } = build((v) => v === pd.id, px, py, pz);
    if (!count) continue;
    const mesh = new THREE.Mesh(g, material); mesh.castShadow = true;
    const pivot = new THREE.Group(); pivot.position.set(px, py, pz); pivot.add(mesh);
    pivot.userData.bbox = pd.bbox || null; pivot.userData.rest = [px, py, pz];
    partsOut[pd.name] = { pivot, mesh };
  }
  return { body, wheels, parts: partsOut };
}
