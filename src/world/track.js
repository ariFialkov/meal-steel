// Race track: a non-looping route through the grid with chicane, roundabout plaza, overpass and start/finish.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { roadX, roadZ, P_ROAD, PITCH } from './layouts.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function randomRoute(plan, rng, targetLen) {
  const visited = new Set(), key = (i, j) => i * 1000 + j;
  let i = rng.int(0, plan.cols), j = rng.int(0, plan.rows);
  const route = [[i, j]]; visited.add(key(i, j));
  let dir = rng.pick(DIRS), straight = 0;
  while (route.length <= targetLen) {
    const options = [];
    for (const d of DIRS) {
      if (d[0] === -dir[0] && d[1] === -dir[1]) continue;
      const ni = i + d[0], nj = j + d[1];
      if (ni < 0 || ni > plan.cols || nj < 0 || nj > plan.rows) continue;
      if (visited.has(key(ni, nj))) continue;
      // keep away from previously visited nodes (not just the last one) to avoid tight spirals
      let crowded = false;
      for (const dd of DIRS) { const k = key(ni + dd[0], nj + dd[1]); if (visited.has(k) && !(ni + dd[0] === i && nj + dd[1] === j)) crowded = true; }
      const isStraight = d[0] === dir[0] && d[1] === dir[1];
      let w = isStraight ? (straight >= 3 ? 0.4 : 1.6) : 1.0;
      if (crowded) w *= 0.25;
      options.push({ d, w });
    }
    if (!options.length) break;
    const total = options.reduce((s, o) => s + o.w, 0); let r = rng.next() * total, pick = options[0];
    for (const o of options) { r -= o.w; if (r <= 0) { pick = o; break; } }
    const isStraight = pick.d[0] === dir[0] && pick.d[1] === dir[1];
    straight = isStraight ? straight + 1 : 1;
    dir = pick.d; i += dir[0]; j += dir[1];
    route.push([i, j]); visited.add(key(i, j));
  }
  return route;
}

function runs(route) {
  // maximal straight runs: {start, end (node indices), dir}
  const out = []; let s = 0;
  const dirOf = (k) => [route[k + 1][0] - route[k][0], route[k + 1][1] - route[k][1]];
  for (let k = 1; k < route.length - 1; k++) {
    const a = dirOf(k - 1), b = dirOf(k);
    if (a[0] !== b[0] || a[1] !== b[1]) { out.push({ start: s, end: k, dir: a, segs: k - s }); s = k; }
  }
  out.push({ start: s, end: route.length - 1, dir: dirOf(route.length - 2), segs: route.length - 1 - s });
  return out;
}

export function generateTrack(plan, rng) {
  let best = null;
  for (let tries = 0; tries < 60; tries++) {
    const r = randomRoute(plan, rng, rng.int(15, 19));
    if (!best || r.length > best.length) best = r;
    if (best.length >= 15) break;
  }
  const route = best;
  const nodePos = (n) => [roadX(plan, n[0]), roadZ(plan, n[1])];
  const rs = runs(route);
  // choose feature runs
  const long = rs.filter((r) => r.segs >= 3 && r.start > 0 && r.end < route.length - 1);
  const medium = rs.filter((r) => r.segs >= 2 && r.start > 0 && r.end < route.length - 1);
  const overRun = long.length ? rng.pick(long) : null;
  const chicRun = medium.filter((r) => r !== overRun).length ? rng.pick(medium.filter((r) => r !== overRun)) : null;
  // roundabout node: a turn node away from start/finish and features
  let rbNode = null;
  const turnNodes = [];
  for (let k = 2; k < route.length - 2; k++) {
    const a = [route[k][0] - route[k - 1][0], route[k][1] - route[k - 1][1]], b = [route[k + 1][0] - route[k][0], route[k + 1][1] - route[k][1]];
    const isTurn = a[0] !== b[0] || a[1] !== b[1];
    const inFeature = (overRun && k >= overRun.start && k <= overRun.end) || (chicRun && k >= chicRun.start && k <= chicRun.end);
    const [ni, nj] = route[k];
    if (isTurn && !inFeature && ni > 0 && ni < plan.cols && nj > 0 && nj < plan.rows) turnNodes.push(k);
  }
  if (turnNodes.length) rbNode = rng.pick(turnNodes);

  // waypoints
  const wps = [];
  const features = { chicane: null, overpass: null, roundabout: null };
  for (let k = 0; k < route.length; k++) {
    const [x, z] = nodePos(route[k]);
    if (rbNode === k) {
      const [ni, nj] = route[k];
      for (let dj = -1; dj <= 0; dj++) for (let di = -1; di <= 0; di++) plan.blocks[nj + dj][ni + di] = 'open';
      const R = 15;
      const a = [route[k][0] - route[k - 1][0], route[k][1] - route[k - 1][1]], b = [route[k + 1][0] - route[k][0], route[k + 1][1] - route[k][1]];
      const angIn = Math.atan2(-a[0], -a[1]);  // point on circle facing the incoming road
      const angOut = Math.atan2(b[0], b[1]);
      // go the long way around (>= 180deg) for a proper wide ring
      let delta = angOut - angIn; while (delta <= -Math.PI) delta += Math.PI * 2; while (delta > Math.PI) delta -= Math.PI * 2;
      const ccw = delta > 0; const sweep = ccw ? (Math.PI * 2 - Math.abs(delta)) * -1 : (Math.PI * 2 - Math.abs(delta));
      const steps = Math.max(4, Math.round(Math.abs(sweep) / 0.5));
      for (let s = 0; s <= steps; s++) { const ang = angIn + sweep * (s / steps); wps.push([x + Math.sin(ang) * R, z + Math.cos(ang) * R]); }
      features.roundabout = { x, z, r: R };
      plan.roundabouts.push({ x, z, r: R });
      plan.noPropRects.push({ minX: x - R - 8, maxX: x + R + 8, minZ: z - R - 8, maxZ: z + R + 8 });
      continue;
    }
    wps.push([x, z]);
    // chicane inside the first segment of the chicane run
    if (chicRun && k === chicRun.start) {
      const [x2, z2] = nodePos(route[k + 1]);
      const d = chicRun.dir; const px = -d[1], pz = d[0]; // perpendicular
      const off = 3.6, cones = [];
      for (let q = 1; q <= 3; q++) {
        const t = 0.2 + 0.3 * (q - 1) + 0.0, side = q % 2 === 0 ? 1 : -1;
        const cx = x + (x2 - x) * t, cz = z + (z2 - z) * t;
        wps.push([cx + px * off * side, cz + pz * off * side]);
        for (let c = 0; c < 4; c++) cones.push([cx - px * side * (0.8 + c * 1.3), cz - pz * side * (0.8 + c * 1.3)]);
      }
      features.chicane = { cones, barriers: [] };
    }
  }
  // overpass definition from midpoints
  if (overRun) {
    const [ax0, az0] = nodePos(route[overRun.start]), [ax1, az1] = nodePos(route[overRun.start + 1]);
    const [bx0, bz0] = nodePos(route[overRun.end - 1]), [bx1, bz1] = nodePos(route[overRun.end]);
    features.overpass = { ax: (ax0 + ax1) / 2, az: (az0 + az1) / 2, bx: (bx0 + bx1) / 2, bz: (bz0 + bz1) / 2, dir: overRun.dir, nodes: route.slice(overRun.start + 1, overRun.end).map(nodePos) };
  }
  // extend the ends a little for a start grid & run-off
  const first = wps[0], second = wps[1];
  const dx0 = first[0] - second[0], dz0 = first[1] - second[1], l0 = Math.hypot(dx0, dz0);
  wps.unshift([first[0] + (dx0 / l0) * 2, first[1] + (dz0 / l0) * 2]);
  const last = wps[wps.length - 1], prev = wps[wps.length - 2];
  const dx1 = last[0] - prev[0], dz1 = last[1] - prev[1], l1 = Math.hypot(dx1, dz1);
  wps.push([last[0] + (dx1 / l1) * 2, last[1] + (dz1 / l1) * 2]);
  return { route, waypoints: wps, features };
}

/** Sample the spline, with elevation from the world. Call after the city is built. */
export function finalizeTrack(track, world) {
  const pts3 = track.waypoints.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(pts3, false, 'centripetal', 0.5);
  const approxLen = curve.getLength();
  const n = Math.max(50, Math.floor(approxLen / 2));
  const pts = curve.getSpacedPoints(n);
  const samples = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i > 0) s += p.distanceTo(pts[i - 1]);
    const q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
    let tx = q.x - o.x, tz = q.z - o.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const h = world.elevation(p.x, p.z).h;
    samples.push({ x: p.x, z: p.z, y: h, s, tx, tz });
  }
  track.samples = samples; track.length = s;
  track.startS = 30; track.finishS = s - 14;
  track.startIdx = samples.findIndex((a) => a.s >= track.startS);
  track.finishIdx = samples.findIndex((a) => a.s >= track.finishS);
  return track;
}

export function trackPointAt(track, s) {
  const S = track.samples; s = Math.max(0, Math.min(track.length - 0.01, s));
  let lo = 0, hi = S.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (S[mid].s <= s) lo = mid; else hi = mid; }
  const a = S[lo], b = S[hi], t = (s - a.s) / Math.max(1e-6, b.s - a.s);
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t, tx: a.tx, tz: a.tz, idx: lo };
}

/** Update a truck's progress along the track (monotone window search). */
export function trackProgress(track, truck) {
  const S = track.samples;
  let idx = truck.trackIdx ?? 0;
  let best = idx, bd = Infinity;
  for (let k = Math.max(0, idx - 25); k < Math.min(S.length, idx + 45); k++) {
    const d = (S[k].x - truck.x) ** 2 + (S[k].z - truck.z) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  truck.trackIdx = best;
  const a = S[best];
  const along = (truck.x - a.x) * a.tx + (truck.z - a.z) * a.tz;
  truck.trackS = Math.max(0, Math.min(track.length, a.s + along));
  truck.trackLat = -(truck.x - a.x) * a.tz + (truck.z - a.z) * a.tx;
  truck.trackDist = Math.sqrt(bd);
  return truck.trackS;
}

function colorGeo(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3)); geo.deleteAttribute('uv'); return geo;
}
function ribbon(samples, offA, offB, hex, yOff = 0.05, from = 0, to = Infinity) {
  const pos = [], idx = [];
  let count = 0;
  for (let i = from; i < Math.min(samples.length, to); i++) {
    const p = samples[i], nx = -p.tz, nz = p.tx;
    pos.push(p.x + nx * offA, p.y + yOff, p.z + nz * offA, p.x + nx * offB, p.y + yOff, p.z + nz * offB);
    if (count > 0) { const b = count * 2; idx.push(b - 2, b - 1, b, b - 1, b + 1, b); }
    count++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return colorGeo(g, hex);
}
function textTexture(text, bg, fg) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = fg; ctx.font = 'bold 84px "Arial Black", Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function checkerTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 32; const ctx = c.getContext('2d');
  for (let y = 0; y < 2; y++) for (let x = 0; x < 8; x++) { ctx.fillStyle = (x + y) % 2 ? '#111' : '#fff'; ctx.fillRect(x * 16, y * 16, 16, 16); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Build track visuals + colliders: ribbon, kerbs, start/finish, chicane cones, roundabout island, overpass deck. */
export function buildTrackVisuals(scene, track, world, props, rng) {
  const group = new THREE.Group();
  const S = track.samples;
  const geos = [ribbon(S, -4.8, 4.8, 0x3a3f4b, 0.05)];
  // kerbs alternate red/white every ~6 samples
  for (let i = 0; i < S.length - 1; i += 4) {
    const hex = ((i / 4) % 2) ? 0xd62828 : 0xf4f4f4;
    geos.push(ribbon(S, -5.6, -4.8, hex, 0.07, i, i + 5), ribbon(S, 4.8, 5.6, hex, 0.07, i, i + 5));
  }
  // direction chevrons
  for (let i = 10; i < S.length - 10; i += 14) {
    const p = S[i], g = new THREE.PlaneGeometry(2.2, 1.2); g.rotateX(-Math.PI / 2); g.rotateY(Math.atan2(p.tx, p.tz)); g.translate(p.x, p.y + 0.08, p.z);
    geos.push(colorGeo(g, 0xffd166));
  }
  const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ vertexColors: true })); mesh.receiveShadow = true; group.add(mesh);

  // start & finish
  const line = (sIdx, label, bg) => {
    const p = S[sIdx], ang = Math.atan2(p.tx, p.tz);
    const l = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.4), new THREE.MeshLambertMaterial({ map: checkerTexture() }));
    l.rotation.x = -Math.PI / 2; l.rotation.z = -ang; l.position.set(p.x, p.y + 0.1, p.z); l.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), 0); group.add(l);
    const gantry = new THREE.Group(); gantry.position.set(p.x, p.y, p.z); gantry.rotation.y = ang;
    const pm = new THREE.MeshLambertMaterial({ color: 0xdddddd });
    for (const sx of [-6.5, 6.5]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7.5, 0.6), pm); post.position.set(sx, 3.75, 0); post.castShadow = true; gantry.add(post); }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(13.6, 2.2, 0.5), [pm, pm, pm, pm, new THREE.MeshLambertMaterial({ map: textTexture(label, bg, '#fff6e8') }), new THREE.MeshLambertMaterial({ map: textTexture(label, bg, '#fff6e8') })]);
    banner.position.set(0, 7.2, 0); banner.castShadow = true; gantry.add(banner);
    group.add(gantry);
    world.addAABB(p.x + Math.cos(ang) * 6.5 - 0.5, p.z - Math.sin(ang) * 6.5 - 0.5, p.x + Math.cos(ang) * 6.5 + 0.5, p.z - Math.sin(ang) * 6.5 + 0.5, 'post', 8);
    world.addAABB(p.x - Math.cos(ang) * 6.5 - 0.5, p.z + Math.sin(ang) * 6.5 - 0.5, p.x - Math.cos(ang) * 6.5 + 0.5, p.z + Math.sin(ang) * 6.5 + 0.5, 'post', 8);
  };
  line(track.startIdx, 'START', '#3ad17c');
  line(track.finishIdx, 'FINISH', '#ef3b4b');

  // chicane cones
  if (track.features.chicane) for (const [x, z] of track.features.chicane.cones) props.add('cone', x, z, 0, 1.1);
  // roundabout island
  const rb = track.features.roundabout;
  if (rb) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(rb.r + 9, rb.r + 9, 0.18, 32), new THREE.MeshLambertMaterial({ color: 0x9c8f86 })); disc.position.set(rb.x, 0.09, rb.z); disc.receiveShadow = true; group.add(disc);
    const island = new THREE.Mesh(new THREE.CylinderGeometry(rb.r - 6, rb.r - 6, 0.5, 24), new THREE.MeshLambertMaterial({ color: 0x5c9e4a })); island.position.set(rb.x, 0.25, rb.z); group.add(island);
    props.add('fountain', rb.x, rb.z, 0, 1);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; props.add('tree', rb.x + Math.cos(a) * (rb.r - 7.5), rb.z + Math.sin(a) * (rb.r - 7.5), a, 1); }
    // island collider ring approximated by boxes
    const R = rb.r - 6.3;
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; const cx = rb.x + Math.cos(a) * (R - 1.5), cz = rb.z + Math.sin(a) * (R - 1.5); world.addAABB(cx - 1.6, cz - 1.6, cx + 1.6, cz + 1.6, 'island', 1); }
  }
  // overpass deck
  const op = track.features.overpass;
  if (op && op.world) {
    const o = op.world, deck = [], rail = [];
    for (let a = 0; a < o.L; a += 2) {
      const h1 = world.overpassHeightAlong(o, a), h2 = world.overpassHeightAlong(o, a + 2);
      if (h1 < 0.05 && h2 < 0.05) continue;
      const cx = o.ax + o.ux * (a + 1), cz = o.az + o.uz * (a + 1);
      const g = new THREE.BoxGeometry(o.halfWidth * 2 + 1.2, 0.7, 2.4); g.rotateX(-Math.atan2(h2 - h1, 2)); g.rotateY(Math.atan2(o.ux, o.uz)); g.translate(cx, (h1 + h2) / 2 - 0.4, cz);
      deck.push(colorGeo(g, 0x8a8f99));
      for (const side of [-1, 1]) {
        const r = new THREE.BoxGeometry(0.35, 1.1, 2.4); r.rotateX(-Math.atan2(h2 - h1, 2)); r.rotateY(Math.atan2(o.ux, o.uz));
        r.translate(cx - o.uz * side * (o.halfWidth + 0.4), (h1 + h2) / 2 + 0.5, cz + o.ux * side * (o.halfWidth + 0.4));
        rail.push(colorGeo(r, 0xffd166));
      }
    }
    const dm = new THREE.Mesh(mergeGeometries([...deck, ...rail]), new THREE.MeshLambertMaterial({ vertexColors: true })); dm.castShadow = true; dm.receiveShadow = true; group.add(dm);
    // pillars where the deck is high, avoiding intersections
    for (let a = 8; a < o.L - 8; a += 14) {
      if (world.overpassHeightAlong(o, a) < 5.4) continue;
      const cx = o.ax + o.ux * a, cz = o.az + o.uz * a;
      let nearInt = false; for (const [nx, nz] of op.nodes) if (Math.hypot(nx - cx, nz - cz) < P_ROAD / 2 + 3) nearInt = true;
      if (nearInt) continue;
      for (const side of [-1, 1]) props.add('pillar', cx - o.uz * side * (o.halfWidth - 0.6), cz + o.ux * side * (o.halfWidth - 0.6), 0, 1);
    }
    // ramp retaining walls (ground-level colliders)
    for (const [a0, a1] of [[o.rampLen * 0.4, o.rampLen], [o.L - o.rampLen, o.L - o.rampLen * 0.4]]) {
      for (const side of [-1, 1]) {
        const x0 = o.ax + o.ux * a0 - o.uz * side * (o.halfWidth + 0.9), z0 = o.az + o.uz * a0 + o.ux * side * (o.halfWidth + 0.9);
        const x1 = o.ax + o.ux * a1 - o.uz * side * (o.halfWidth + 0.9), z1 = o.az + o.uz * a1 + o.ux * side * (o.halfWidth + 0.9);
        world.addAABB(Math.min(x0, x1) - 0.3, Math.min(z0, z1) - 0.3, Math.max(x0, x1) + 0.3, Math.max(z0, z1) + 0.3, 'ramp', 2.5);
      }
    }
  }
  scene.add(group);
  return group;
}

export { PITCH };
