// Procedural city: textured streets and pavements, detailed buildings, parks, plazas and street props.
import * as THREE from 'three';
import { StaticWorld } from './colliders.js';
import { PropSystem } from './props.js';
import { roadX, roadZ, blockRect, P_ROAD } from './layouts.js';
import { getCityTextures, TILE, FACADE_STYLES } from './citytex.js';
import { CityBuilder } from './buildings.js';
import { rgb, mix, shade } from './builder.js';

/** Standard material whose vertex colour tints the texture only where the data map's red channel says so. */
function tintMaterial(t, { night = false, emissive = 1, envMapIntensity = 1 } = {}) {
  const m = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.dataMap, roughness: 1, metalness: 0, vertexColors: true, envMapIntensity });
  if (night && t.emissiveMap) { m.emissive.set(0xffffff); m.emissiveMap = t.emissiveMap; m.emissiveIntensity = emissive; }
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_fragment>', `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  float tintMask = texture2D( roughnessMap, vRoughnessMapUv ).r;
  diffuseColor.rgb *= mix( sampledDiffuseColor.rgb, sampledDiffuseColor.rgb * vColor, tintMask );
#endif`)
      .replace('#include <color_fragment>', '');
  };
  m.customProgramCacheKey = () => 'ms-tint';
  return m;
}

/**
 * Build the city for a plan. Returns { group, world (StaticWorld), props (PropSystem) }.
 */
export function buildCity(scene, plan, nb, weather, rng) {
  const group = new THREE.Group();
  const world = new StaticWorld();
  const props = new PropSystem(scene, 420);
  const tex = getCityTextures();
  const night = !!weather.night;
  const tall = /Downtown|Noodle/.test(nb.name) ? 1.7 : 1;
  const cb = new CityBuilder(rng, nb, { tall });
  const span = Math.max(plan.cols, plan.rows) * plan.P;
  const walkTint = mix('#ffffff', nb.palette[0], 0.12), curb = '#cfccc4';
  const inClear = (x, z) => plan.clear && x > roadX(plan, plan.clear.i0) + P_ROAD / 2 - 0.5 && x < roadX(plan, plan.clear.i1 + 1) - P_ROAD / 2 + 0.5 && z > roadZ(plan, plan.clear.j0) + P_ROAD / 2 - 0.5 && z < roadZ(plan, plan.clear.j1 + 1) - P_ROAD / 2 + 0.5;
  const ground = (bucket, x0, z0, x1, z1, y, tile, tint = [1, 1, 1]) => cb.bucket(bucket).quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [0, 1, 0], [[x0 / tile, z0 / tile], [x0 / tile, z1 / tile], [x1 / tile, z1 / tile], [x1 / tile, z0 / tile]], tint);
  const curbBox = (x0, z0, x1, z1, y, h, c = curb) => cb.bucket('trim').box(x0, y - h, z0, x1, y, z1, c);

  // ground: lawn all around, asphalt under the street grid
  const ext = span / 2 + 450;
  ground('grass', -ext, -ext, ext, ext, -0.05, TILE.grass[0], night ? [0.45, 0.55, 0.5] : [1, 1, 1]);
  ground('asphalt', plan.minX - P_ROAD / 2, plan.minZ - P_ROAD / 2, plan.maxX + P_ROAD / 2, plan.maxZ + P_ROAD / 2, 0, TILE.asphalt[0]);

  // blocks
  for (let j = 0; j < plan.rows; j++) for (let i = 0; i < plan.cols; i++) {
    const type = plan.blocks[j][i];
    if (type === 'open') continue;
    const r = blockRect(plan, i, j), x0 = r.x0 - 1.5, x1 = r.x1 + 1.5, z0 = r.z0 - 1.5, z1 = r.z1 + 1.5;
    if (type === 'park') {
      ground('grass', x0 + 0.3, z0 + 0.3, x1 - 0.3, z1 - 0.3, 0.25, TILE.grass[0]);
      ground('sidewalk', x0, z0, x1, z0 + 0.3, 0.25, TILE.sidewalk[0], walkTint); ground('sidewalk', x0, z1 - 0.3, x1, z1, 0.25, TILE.sidewalk[0], walkTint);
      ground('sidewalk', x0, z0 + 0.3, x0 + 0.3, z1 - 0.3, 0.25, TILE.sidewalk[0], walkTint); ground('sidewalk', x1 - 0.3, z0 + 0.3, x1, z1 - 0.3, 0.25, TILE.sidewalk[0], walkTint);
      edgeCurbs(x0, z0, x1, z1);
      buildPark(r, rng, props, cb, !!plan.smallParks);
      continue;
    }
    ground('sidewalk', x0, z0, x1, z1, 0.25, TILE.sidewalk[0], walkTint);
    edgeCurbs(x0, z0, x1, z1);
    const lr = plan.lowRise, maxH = lr && i >= lr.i0 && i <= lr.i1 && j >= lr.j0 && j <= lr.j1 ? lr.maxH : Infinity;
    buildBlockBuildings(r, rng, cb, world, maxH);
    buildSidewalkProps(r, rng, props);
  }
  function edgeCurbs(x0, z0, x1, z1) {
    curbBox(x0 - 0.18, z0 - 0.18, x1 + 0.18, z0, 0.27, 0.27); curbBox(x0 - 0.18, z1, x1 + 0.18, z1 + 0.18, 0.27, 0.27);
    curbBox(x0 - 0.18, z0, x0, z1, 0.27, 0.27); curbBox(x1, z0, x1 + 0.18, z1, 0.27, 0.27);
    // storm drains
    for (const [dx, dz] of [[x0 + 4, z0 - 0.2], [x1 - 5, z1 + 0.05]]) cb.bucket('trim').box(dx, 0.01, dz, dx + 1.0, 0.03, dz + 0.16, '#2a2c30');
  }

  // cleared plaza floor
  if (plan.clear) {
    const c = plan.clear;
    const x0 = roadX(plan, c.i0) + P_ROAD / 2 - 1.5, x1 = roadX(plan, c.i1 + 1) - P_ROAD / 2 + 1.5;
    const z0 = roadZ(plan, c.j0) + P_ROAD / 2 - 1.5, z1 = roadZ(plan, c.j1 + 1) - P_ROAD / 2 + 1.5;
    if (c.floor === 'grass') {
      ground('grass', x0, z0, x1, z1, 0.2, TILE.grass[0]);
      for (let k = 0; k < 8; k++) { const px = rng.range(x0 + 12, x1 - 12), pz = rng.range(z0 + 12, z1 - 12), pr = rng.range(3, 6); ground('sidewalk', px - pr, pz - pr, px + pr, pz + pr, 0.21, TILE.sidewalk[0] / 2, mix(walkTint, '#c9b79c', 0.6)); }
    } else {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, half = Math.min(x1 - x0, z1 - z0) / 2, ts = TILE.sidewalk[0] / 2.2;
      // checker of warm and cool paving squares
      const sq = 6.5;
      for (let x = x0; x < x1 - 0.01; x += sq) for (let z = z0; z < z1 - 0.01; z += sq) {
        const k = (Math.round((x - x0) / sq) + Math.round((z - z0) / sq)) % 2;
        ground('sidewalk', x, z, Math.min(x + sq, x1), Math.min(z + sq, z1), 0.2, ts, k ? rgb('#e3cba9') : rgb('#c9ab8a'));
      }
      // radial bands and rings of dark granite, compass rose in the middle
      const S = cb.bucket('sidewalk'), y = 0.205, dark = rgb('#6d625c'), terra = rgb('#c75a34');
      const ringQuad = (r0, r1, a0, a1, c, yy) => { const p = (r, a) => [cx + Math.cos(a) * r, yy, cz + Math.sin(a) * r], q = [p(r0, a0), p(r1, a0), p(r1, a1), p(r0, a1)]; S.quad(q[0], q[1], q[2], q[3], [0, 1, 0], q.map((v) => [v[0] / ts, v[2] / ts]), c); };
      for (let k = 0; k < 64; k++) { const a0 = (k / 64) * Math.PI * 2, a1 = ((k + 1) / 64) * Math.PI * 2; ringQuad(half * 0.3, half * 0.33, a0, a1, dark, y); ringQuad(half * 0.92, half * 0.96, a0, a1, dark, y); ringQuad(half * 0.58, half * 0.6, a0, a1, terra, y); }
      for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2, w = 0.035; ringQuad(half * 0.33, half * 0.92, a - w, a + w, k % 2 ? dark : terra, y + 0.002); }
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, r = half * (k % 2 ? 0.16 : 0.27), p = (rr, aa) => [cx + Math.cos(aa) * rr, y + 0.004, cz + Math.sin(aa) * rr]; S.tri(p(0, 0), p(r, a), p(half * 0.07, a + Math.PI / 8), [0, 1, 0], null, k % 2 ? dark : terra); S.tri(p(0, 0), p(half * 0.07, a - Math.PI / 8), p(r, a), [0, 1, 0], null, k % 2 ? terra : dark); }
    }
    curbBox(x0 - 0.18, z0 - 0.18, x1 + 0.18, z1 + 0.18, 0.18, 0.2, '#bdb8ae');
  }

  // road markings: dashed centre lines, zebra crossings, manholes
  const P = cb.bucket('paint'), lineC = [0.96, 0.92, 0.76], white = [0.97, 0.97, 0.95];
  const flat = (x0, z0, x1, z1, c, y = 0.03) => P.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [0, 1, 0], null, c);
  const nearInt = (v, isX) => { const n = isX ? plan.cols : plan.rows; for (let k = 0; k <= n; k++) if (Math.abs(v - (isX ? roadX(plan, k) : roadZ(plan, k))) < P_ROAD / 2 + 3.5) return true; return false; };
  for (let i = 0; i <= plan.cols; i++) {
    const x = roadX(plan, i);
    for (let z = plan.minZ + 3; z < plan.maxZ - 3; z += 7) if (!nearInt(z, false) && !inClear(x, z)) flat(x - 0.13, z - 1.5, x + 0.13, z + 1.5, lineC);
  }
  for (let j = 0; j <= plan.rows; j++) {
    const z = roadZ(plan, j);
    for (let x = plan.minX + 3; x < plan.maxX - 3; x += 7) if (!nearInt(x, true) && !inClear(x, z)) flat(x - 1.5, z - 0.13, x + 1.5, z + 0.13, lineC);
  }
  for (let i = 0; i <= plan.cols; i++) for (let j = 0; j <= plan.rows; j++) {
    const x = roadX(plan, i), z = roadZ(plan, j), h = P_ROAD / 2, o = h + 1.6;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ax = x + dx * o, az = z + dz * o;
      if (inClear(ax, az) || ax < plan.minX - h || ax > plan.maxX + h || az < plan.minZ - h || az > plan.maxZ + h) continue;
      for (let s = -h + 0.6; s < h - 0.4; s += 1.2) {
        if (dx) flat(ax - 1.2, z + s, ax + 1.2, z + s + 0.6, white); else flat(x + s, az - 1.2, x + s + 0.6, az + 1.2, white);
      }
    }
    if (rng.chance(0.5)) { const mx = x + rng.range(-3, 3), mz = z + (rng.chance(0.5) ? 1 : -1) * rng.range(8, 20); if (!inClear(mx, mz)) { cb.bucket('trim').cyl(mx, 0.02, mz, 0.62, 0.05, '#3d3f44', 16); cb.bucket('trim').cyl(mx, 0.035, mz, 0.5, 0.03, '#55585e', 16); } }
  }

  // perimeter: jersey barriers with hazard blocks + colliders
  const m = P_ROAD / 2 + 1;
  const edges = [
    [plan.minX - m, plan.minZ - m, plan.maxX + m, plan.minZ - m + 1.2],
    [plan.minX - m, plan.maxZ + m - 1.2, plan.maxX + m, plan.maxZ + m],
    [plan.minX - m, plan.minZ - m, plan.minX - m + 1.2, plan.maxZ + m],
    [plan.maxX + m - 1.2, plan.minZ - m, plan.maxX + m, plan.maxZ + m],
  ];
  for (const [x0, z0, x1, z1] of edges) {
    world.addAABB(x0, z0, x1, z1, 'wall', 1.2);
    const T = cb.bucket('trim'), alongX = x1 - x0 > z1 - z0, L = alongX ? x1 - x0 : z1 - z0;
    for (let s = 0; s < L; s += 3) {
      const c = Math.floor(s / 3) % 2 ? '#e8e4dc' : '#ff4d57', e = Math.min(L, s + 2.95);
      if (alongX) { T.box(x0 + s, 0, z0, x0 + e, 0.5, z1, '#d9d4cb'); T.box(x0 + s, 0.5, z0 + 0.25, x0 + e, 1.2, z1 - 0.25, c); }
      else { T.box(x0, 0, z0 + s, x1, 0.5, z0 + e, '#d9d4cb'); T.box(x0 + 0.25, 0.5, z0 + s, x1 - 0.25, 1.2, z0 + e, c); }
    }
  }
  world.bounds = { minX: plan.minX - m, maxX: plan.maxX + m, minZ: plan.minZ - m, maxZ: plan.maxZ + m };
  // distant skyline ring for depth
  cb.prefix = 'sky:';
  for (let k = 0; k < 70; k++) {
    const ang = rng.range(0, Math.PI * 2), rad = span / 2 + rng.range(60, 220);
    cb.skyline(Math.cos(ang) * rad, Math.sin(ang) * rad, rng.range(11, 26), Math.round(rng.range(20, 90) * tall / 3.6) * 3.6);
  }
  cb.prefix = '';

  // one mesh per bucket
  const mats = {
    store: tintMaterial(tex.store, { night, emissive: 1.1 }), roof: tintMaterial(tex.roof), roofTile: tintMaterial(tex.roofTile),
    awning: tintMaterial(tex.awning), asphalt: tintMaterial(tex.asphalt, { envMapIntensity: 0.4 }), sidewalk: tintMaterial(tex.sidewalk, { envMapIntensity: 0.5 }), grass: tintMaterial(tex.grass, { envMapIntensity: 0.3 }),
    sign: new THREE.MeshStandardMaterial({ map: tex.signs, roughness: 0.8, envMapIntensity: 0.3, emissive: night ? 0xffffff : 0x000000, emissiveMap: night ? tex.signs : null, emissiveIntensity: 0.85 }),
    billboard: new THREE.MeshStandardMaterial({ map: tex.billboard, roughness: 0.8, envMapIntensity: 0.3, emissive: night ? 0xffffff : 0x000000, emissiveMap: night ? tex.billboard : null, emissiveIntensity: 0.7 }),
    trim: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 }),
    paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1 }),
  };
  for (const s of FACADE_STYLES) mats[s] = tintMaterial(tex.facade[s], { night, emissive: 1.0 });
  // meshes per material, split into ~2-block chunks so the view and shadow passes cull what they cannot see
  const flatBuckets = new Set(['asphalt', 'sidewalk', 'grass', 'paint']);
  for (const [key, b] of Object.entries(cb.B)) {
    const sky = key.startsWith('sky:'), name = sky ? key.slice(4) : key;
    for (const g of sky ? [b.build()] : b.buildChunks(112)) {
      if (!g) continue;
      const mesh = new THREE.Mesh(g, mats[name]); mesh.name = key;
      mesh.receiveShadow = !sky; mesh.castShadow = !sky && !flatBuckets.has(name);
      mesh.userData.keepTextures = true;
      group.add(mesh);
    }
  }
  scene.add(group);
  return { group, world, props };
}

function buildBlockBuildings(r, rng, cb, world, maxH = Infinity) {
  // split the block into lots
  const splits = (len, minLot) => {
    const n = rng.chance(0.5) ? 2 : 3; const pts = [0];
    for (let k = 1; k < n; k++) pts.push(pts[k - 1] + rng.range(minLot, (len - pts[k - 1]) / (n - k + 1) * 1.3));
    pts.push(len); return pts.filter((p, i, a) => i === 0 || p - a[i - 1] > 7);
  };
  const xs = splits(r.x1 - r.x0, 10), zs = splits(r.z1 - r.z0, 10);
  for (let a = 0; a < xs.length - 1; a++) for (let b = 0; b < zs.length - 1; b++) {
    const lot = { x0: r.x0 + xs[a] + 0.3, x1: r.x0 + xs[a + 1] - 0.3, z0: r.z0 + zs[b] + 0.3, z1: r.z0 + zs[b + 1] - 0.3 };
    if (rng.chance(0.07)) { // parking lot
      const T = cb.bucket('asphalt'), y = 0.27, [tw] = TILE.asphalt;
      T.quad([lot.x0, y, lot.z0], [lot.x0, y, lot.z1], [lot.x1, y, lot.z1], [lot.x1, y, lot.z0], [0, 1, 0], [[lot.x0 / tw, lot.z0 / tw], [lot.x0 / tw, lot.z1 / tw], [lot.x1 / tw, lot.z1 / tw], [lot.x1 / tw, lot.z0 / tw]], [1, 1, 1]);
      for (let x = lot.x0 + 1; x < lot.x1 - 1; x += 2.8) cb.bucket('paint').quad([x, y + 0.02, lot.z0 + 1], [x, y + 0.02, lot.z0 + 5.5], [x + 0.12, y + 0.02, lot.z0 + 5.5], [x + 0.12, y + 0.02, lot.z0 + 1], [0, 1, 0], null, [0.97, 0.97, 0.95]);
      continue;
    }
    const fp = cb.building(lot, r, { maxH });
    if (fp) world.addAABB(fp.x0 - 0.15, fp.z0 - 0.15, fp.x1 + 0.15, fp.z1 + 0.15, 'building', fp.h);
  }
}

function buildSidewalkProps(r, rng, props) {
  const edge = 1.1; // from block edge outwards
  const kinds = ['lamp', 'tree', 'tree', 'hydrant', 'mailbox', 'bench', 'trash', 'sign', 'planter', 'cart'];
  const place = (x, z, rot) => {
    if (!rng.chance(0.42)) return;
    const k = rng.pick(kinds);
    props.add(k, x, z, rot + rng.range(-0.2, 0.2), rng.range(0.9, 1.15));
  };
  for (let x = r.x0 + 3; x < r.x1 - 2; x += rng.range(6, 9)) { place(x, r.z0 - edge, 0); place(x + 2, r.z1 + edge, Math.PI); }
  for (let z = r.z0 + 3; z < r.z1 - 2; z += rng.range(6, 9)) { place(r.x0 - edge, z, Math.PI / 2); place(r.x1 + edge, z + 2, -Math.PI / 2); }
}

function buildPark(r, rng, props, cb, small = false) {
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  const pt = TILE.sidewalk[0] / 2, tint = [0.92, 0.84, 0.72];
  const path = (x0, z0, x1, z1) => cb.bucket('sidewalk').quad([x0, 0.27, z0], [x0, 0.27, z1], [x1, 0.27, z1], [x1, 0.27, z0], [0, 1, 0], [[x0 / pt, z0 / pt], [x0 / pt, z1 / pt], [x1 / pt, z1 / pt], [x1 / pt, z0 / pt]], tint);
  path(r.x0 - 1.2, cz - 1.5, r.x1 + 1.2, cz + 1.5); path(cx - 1.5, r.z0 - 1.2, cx + 1.5, cz - 1.5); path(cx - 1.5, cz + 1.5, cx + 1.5, r.z1 + 1.2);
  const n = rng.int(5, 9);
  for (let k = 0; k < n; k++) {
    const x = rng.range(r.x0 + 3, r.x1 - 3), z = rng.range(r.z0 + 3, r.z1 - 3);
    if (Math.abs(x - cx) < 2.5 || Math.abs(z - cz) < 2.5) continue;
    props.add(rng.chance(0.75) ? 'tree' : 'bench', x, z, rng.range(0, Math.PI * 2), rng.range(0.9, 1.3));
  }
  if (small) return;
  for (let k = 0; k < rng.int(1, 2); k++) {
    const x = rng.range(r.x0 + 6, r.x1 - 6), z = rng.range(r.z0 + 6, r.z1 - 6);
    if (Math.abs(x - cx) < 4 || Math.abs(z - cz) < 4) continue;
    props.add('bigtree', x, z, rng.range(0, Math.PI * 2), rng.range(0.85, 1.2));
  }
  if (rng.chance(0.3)) props.add('statue', cx, cz, rng.range(0, Math.PI * 2), 0.9);
}

/** Scatter destructibles (and a few fixed hazards) around the edge of an open square. */
export function scatterOpenProps(props, plan, rng, count = 44) {
  const ring = plan.ring; if (!ring) return;
  const kinds = ['cone', 'barrel', 'bench', 'trash', 'hydrant', 'mailbox', 'cart', 'planter', 'tree', 'sign'];
  const onAvenue = (x, z) => {
    for (let i = 0; i <= plan.cols; i++) if (Math.abs(x - roadX(plan, i)) < P_ROAD / 2 + 2.5) return true;
    for (let j = 0; j <= plan.rows; j++) if (Math.abs(z - roadZ(plan, j)) < P_ROAD / 2 + 2.5) return true;
    return false;
  };
  for (let k = 0; k < count; k++) {
    const a = rng.range(0, Math.PI * 2), rad = ring.r + rng.range(-9, 8);
    const x = ring.x + Math.cos(a) * rad, z = ring.z + Math.sin(a) * rad;
    props.add(rng.pick(kinds), x, z, rng.range(0, Math.PI * 2), rng.range(0.9, 1.2));
  }
  // fixed hazards near the edge, off the avenues
  let placed = 0, tries = 0;
  while (placed < 5 && tries++ < 60) {
    const a = rng.range(0, Math.PI * 2), rad = ring.r + rng.range(-4, 6);
    const x = ring.x + Math.cos(a) * rad, z = ring.z + Math.sin(a) * rad;
    if (onAvenue(x, z)) continue;
    props.add(placed % 2 === 0 ? 'bigtree' : 'celltower', x, z, rng.range(0, Math.PI * 2), 1);
    placed++;
  }
  // inner clutter: a few cones/barrels in the ring
  for (let k = 0; k < 12; k++) {
    const a = rng.range(0, Math.PI * 2), rad = rng.range(18, ring.r - 14);
    props.add(rng.pick(['cone', 'barrel', 'planter']), ring.x + Math.cos(a) * rad, ring.z + Math.sin(a) * rad, rng.range(0, 6.28), 1);
  }
}
