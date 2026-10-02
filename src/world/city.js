// Procedural city: buildings, sidewalks, parks, road markings, perimeter walls, street props.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { StaticWorld } from './colliders.js';
import { PropSystem } from './props.js';
import { roadX, roadZ, blockRect, P_ROAD } from './layouts.js';

const _c = new THREE.Color();
function paint(geo, color, jitter = 0) {
  _c.set(color);
  if (jitter) _c.offsetHSL((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * jitter, (Math.random() - 0.5) * jitter);
  const n = geo.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
function flatUV(geo) {
  const uv = geo.attributes.uv; if (!uv) { geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2).fill(0.01), 2)); return geo; }
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.01, 0.01);
  return geo;
}
// Box with window-scaled UVs on the sides and plain roof/bottom.
const WIN = 3.6, CELLS = 4;
function windowBox(w, h, d, x, y, z, color) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const su = (w) => w / (WIN * CELLS), sv = h / (WIN * CELLS);
  const off = Math.random();
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      if (f === 2 || f === 3) { uv.setXY(i, 0.01, 0.01); continue; }
      const s = (f < 2) ? su(d) : su(w);
      uv.setXY(i, uv.getX(i) * s + off, uv.getY(i) * sv);
    }
  }
  g.translate(x, y, z);
  return paint(g, color, 0.06);
}

export function makeWindowTextures() {
  const size = 512, cell = size / CELLS;
  const mk = (draw) => {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const ctx = c.getContext('2d'); draw(ctx, cell);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4; return t;
  };
  const diffuse = mk((ctx, cell) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < CELLS; y++) for (let x = 0; x < CELLS; x++) {
      const v = 70 + Math.random() * 40;
      ctx.fillStyle = `rgb(${v * 0.8},${v * 0.9},${v * 1.15})`;
      ctx.fillRect(x * cell + cell * 0.22, y * cell + cell * 0.2, cell * 0.56, cell * 0.55);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x * cell + cell * 0.22, y * cell + cell * 0.2, cell * 0.56, cell * 0.08);
    }
  });
  const emissive = mk((ctx, cell) => {
    ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < CELLS; y++) for (let x = 0; x < CELLS; x++) {
      if (Math.random() < 0.45) {
        ctx.fillStyle = Math.random() < 0.7 ? '#ffd27a' : '#cfe8ff';
        ctx.fillRect(x * cell + cell * 0.22, y * cell + cell * 0.2, cell * 0.56, cell * 0.55);
      }
    }
  });
  return { diffuse, emissive };
}

/**
 * Build the city for a plan. Returns { group, world (StaticWorld), props (PropSystem), buildingMat }
 */
export function buildCity(scene, plan, nb, weather, rng, opts = {}) {
  const group = new THREE.Group();
  const world = new StaticWorld();
  const props = new PropSystem(scene, 420);
  const tex = makeWindowTextures();
  const night = !!weather.night;
  const bMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex.diffuse, emissive: night ? 0xffffff : 0x000000, emissiveMap: tex.emissive, emissiveIntensity: night ? 0.9 : 0 });
  const flatMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const buildings = [], flats = [];
  const palette = nb.palette;
  const tall = /Downtown|Noodle/.test(nb.name) ? 1.8 : 1;

  // ground
  const span = Math.max(plan.cols, plan.rows) * plan.P;
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(span + 900, span + 900), new THREE.MeshLambertMaterial({ color: night ? 0x1d2a1a : 0x4f7a3a }));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.05; outer.receiveShadow = true; group.add(outer);
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(plan.maxX - plan.minX + P_ROAD, plan.maxZ - plan.minZ + P_ROAD), new THREE.MeshLambertMaterial({ color: nb.ground }));
  asphalt.rotation.x = -Math.PI / 2; asphalt.position.set((plan.minX + plan.maxX) / 2, 0, (plan.minZ + plan.maxZ) / 2); asphalt.receiveShadow = true; group.add(asphalt);

  const inClear = (x, z) => plan.clear && x > roadX(plan, plan.clear.i0) + P_ROAD / 2 - 0.5 && x < roadX(plan, plan.clear.i1 + 1) - P_ROAD / 2 + 0.5 && z > roadZ(plan, plan.clear.j0) + P_ROAD / 2 - 0.5 && z < roadZ(plan, plan.clear.j1 + 1) - P_ROAD / 2 + 0.5;
  const sidewalkColor = new THREE.Color(nb.ground).offsetHSL(0, 0, 0.32).getHex();

  // blocks
  for (let j = 0; j < plan.rows; j++) for (let i = 0; i < plan.cols; i++) {
    const type = plan.blocks[j][i];
    const r = blockRect(plan, i, j);
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, w = r.x1 - r.x0, d = r.z1 - r.z0;
    if (type === 'open') continue;
    // sidewalk / grass slab
    const slab = new THREE.BoxGeometry(w + 3, 0.25, d + 3); slab.translate(cx, 0.125, cz);
    flats.push(paint(slab, type === 'park' ? 0x5c9e4a : sidewalkColor, 0.03));
    if (type === 'park') { buildPark(r, rng, props, flats); continue; }
    buildBlockBuildings(r, rng, palette, tall, buildings, flats, world, nb);
    buildSidewalkProps(r, rng, props);
  }

  // cleared plaza floor
  if (plan.clear) {
    const c = plan.clear;
    const x0 = roadX(plan, c.i0) + P_ROAD / 2 - 1.5, x1 = roadX(plan, c.i1 + 1) - P_ROAD / 2 + 1.5;
    const z0 = roadZ(plan, c.j0) + P_ROAD / 2 - 1.5, z1 = roadZ(plan, c.j1 + 1) - P_ROAD / 2 + 1.5;
    const floor = new THREE.BoxGeometry(x1 - x0, 0.2, z1 - z0); floor.translate((x0 + x1) / 2, 0.1, (z0 + z1) / 2);
    flats.push(paint(floor, c.floor === 'grass' ? 0x5c9e4a : 0x9c8f86));
    if (c.floor === 'pave') {
      // tile pattern: a few contrasting slabs
      for (let k = 0; k < 14; k++) {
        const sx = rng.range(8, 20), sz = rng.range(8, 20);
        const t = new THREE.BoxGeometry(sx, 0.22, sz); t.translate(rng.range(x0 + 10, x1 - 10), 0.1, rng.range(z0 + 10, z1 - 10));
        flats.push(paint(t, rng.pick([0x8c7f76, 0xa89b90, 0x7f746c])));
      }
    } else {
      for (let k = 0; k < 10; k++) {
        const t = new THREE.CylinderGeometry(rng.range(4, 9), rng.range(4, 9), 0.22, 10); t.translate(rng.range(x0 + 10, x1 - 10), 0.1, rng.range(z0 + 10, z1 - 10));
        flats.push(paint(flatUV(t), rng.pick([0x6ab04c, 0x4e8a3a, 0x7fbf5a])));
      }
    }
  }

  // lane markings (dashed centre lines), skipping intersections and cleared areas
  const dash = (x, z, alongX) => {
    const g = new THREE.BoxGeometry(alongX ? 3 : 0.25, 0.04, alongX ? 0.25 : 3); g.translate(x, 0.03, z);
    flats.push(paint(g, 0xf4e9c1));
  };
  for (let i = 0; i <= plan.cols; i++) {
    const x = roadX(plan, i);
    for (let z = plan.minZ + 3; z < plan.maxZ - 3; z += 7) {
      let nearInt = false; for (let j = 0; j <= plan.rows; j++) if (Math.abs(z - roadZ(plan, j)) < P_ROAD / 2 + 2) nearInt = true;
      if (nearInt || inClear(x, z)) continue;
      dash(x, z, false);
    }
  }
  for (let j = 0; j <= plan.rows; j++) {
    const z = roadZ(plan, j);
    for (let x = plan.minX + 3; x < plan.maxX - 3; x += 7) {
      let nearInt = false; for (let i = 0; i <= plan.cols; i++) if (Math.abs(x - roadX(plan, i)) < P_ROAD / 2 + 2) nearInt = true;
      if (nearInt || inClear(x, z)) continue;
      dash(x, z, true);
    }
  }

  // perimeter: concrete barriers + colliders, outer grass
  const m = P_ROAD / 2 + 1;
  const edges = [
    [plan.minX - m, plan.minZ - m, plan.maxX + m, plan.minZ - m + 1.2],
    [plan.minX - m, plan.maxZ + m - 1.2, plan.maxX + m, plan.maxZ + m],
    [plan.minX - m, plan.minZ - m, plan.minX - m + 1.2, plan.maxZ + m],
    [plan.maxX + m - 1.2, plan.minZ - m, plan.maxX + m, plan.maxZ + m],
  ];
  for (const [x0, z0, x1, z1] of edges) {
    world.addAABB(x0, z0, x1, z1, 'wall', 1.2);
    const g = new THREE.BoxGeometry(x1 - x0, 1.2, z1 - z0); g.translate((x0 + x1) / 2, 0.6, (z0 + z1) / 2);
    flats.push(paint(g, 0xb9b1a7));
    world.bounds = { minX: plan.minX - m, maxX: plan.maxX + m, minZ: plan.minZ - m, maxZ: plan.maxZ + m };
  }
  // distant skyline ring for depth
  for (let k = 0; k < 70; k++) {
    const ang = rng.range(0, Math.PI * 2), rad = span / 2 + rng.range(60, 220);
    const h = rng.range(20, 90) * tall, wdt = rng.range(10, 26);
    buildings.push(windowBox(wdt, h, wdt, Math.cos(ang) * rad, h / 2, Math.sin(ang) * rad, rng.pick(palette)));
  }

  const bMesh = new THREE.Mesh(mergeGeometries(buildings), bMat); bMesh.castShadow = true; bMesh.receiveShadow = true; group.add(bMesh);
  const fMesh = new THREE.Mesh(mergeGeometries(flats.map(flatUV)), flatMat); fMesh.receiveShadow = true; fMesh.castShadow = false; group.add(fMesh);
  scene.add(group);
  return { group, world, props, materials: [bMat, flatMat], textures: [tex.diffuse, tex.emissive] };
}

function buildBlockBuildings(r, rng, palette, tall, buildings, flats, world) {
  // split the block into lots
  const splits = (len, minLot) => {
    const n = rng.chance(0.5) ? 2 : 3; const pts = [0];
    for (let k = 1; k < n; k++) pts.push(pts[k - 1] + rng.range(minLot, (len - pts[k - 1]) / (n - k + 1) * 1.3));
    pts.push(len); return pts.filter((p, i, a) => i === 0 || p - a[i - 1] > 7);
  };
  const xs = splits(r.x1 - r.x0, 10), zs = splits(r.z1 - r.z0, 10);
  for (let a = 0; a < xs.length - 1; a++) for (let b = 0; b < zs.length - 1; b++) {
    if (rng.chance(0.07)) { // courtyard / parking lot
      const cx = r.x0 + (xs[a] + xs[a + 1]) / 2, cz = r.z0 + (zs[b] + zs[b + 1]) / 2;
      const g = new THREE.BoxGeometry(xs[a + 1] - xs[a] - 2, 0.3, zs[b + 1] - zs[b] - 2); g.translate(cx, 0.15, cz);
      flats.push(paint(g, 0x55595f)); continue;
    }
    const inset = rng.range(1.0, 2.2);
    const x0 = r.x0 + xs[a] + inset, x1 = r.x0 + xs[a + 1] - inset, z0 = r.z0 + zs[b] + inset, z1 = r.z0 + zs[b + 1] - inset;
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    let h = (6 + Math.pow(rng.next(), 2.2) * 30) * tall;
    if (rng.chance(0.08)) h *= 1.8;
    h = Math.round(h / 3.6) * 3.6 + 0.4;
    const color = rng.pick(palette);
    const style = rng.next();
    const base = 0.25;
    if (style < 0.5 || h < 12) {
      buildings.push(windowBox(w, h, d, cx, base + h / 2, cz, color));
    } else if (style < 0.8) {
      const h1 = Math.max(7.2, Math.round(h * 0.5 / 3.6) * 3.6);
      buildings.push(windowBox(w, h1, d, cx, base + h1 / 2, cz, color));
      const w2 = w * rng.range(0.55, 0.75), d2 = d * rng.range(0.55, 0.75);
      const ox = rng.range(-(w - w2) / 2, (w - w2) / 2), oz = rng.range(-(d - d2) / 2, (d - d2) / 2);
      buildings.push(windowBox(w2, h - h1, d2, cx + ox, base + h1 + (h - h1) / 2, cz + oz, rng.chance(0.5) ? color : rng.pick(palette)));
    } else {
      const pod = 5;
      buildings.push(windowBox(w, pod, d, cx, base + pod / 2, cz, rng.pick(palette)));
      const w2 = w * 0.7, d2 = d * 0.7;
      buildings.push(windowBox(w2, h - pod, d2, cx, base + pod + (h - pod) / 2, cz, color));
      const ant = new THREE.CylinderGeometry(0.1, 0.15, 5, 5); ant.translate(cx, base + h + 2.5, cz); buildings.push(flatUV(paint(ant, 0x888888)));
    }
    // roof details
    if (rng.chance(0.4)) {
      const t = new THREE.CylinderGeometry(1.1, 1.1, 2.2, 8); t.translate(cx + rng.range(-w / 4, w / 4), base + h + 1.1, cz + rng.range(-d / 4, d / 4));
      buildings.push(flatUV(paint(t, 0x6d4c41)));
    }
    if (rng.chance(0.4)) {
      const t = new THREE.BoxGeometry(2, 1.2, 1.6); t.translate(cx + rng.range(-w / 4, w / 4), base + h + 0.6, cz + rng.range(-d / 4, d / 4));
      buildings.push(flatUV(paint(t, 0x9e9e9e)));
    }
    // awning at ground level on a road-facing side
    if (rng.chance(0.35)) {
      const aw = new THREE.BoxGeometry(w * 0.6, 0.2, 1.6); aw.translate(cx, base + 3.4, z1 + 0.8);
      buildings.push(flatUV(paint(aw, rng.pick([0xd62828, 0x2f6fd6, 0x2e8b57, 0xf5c518]))));
    }
    world.addAABB(x0, z0, x1, z1, 'building', h);
  }
}

function buildSidewalkProps(r, rng, props) {
  const edge = 1.1; // from block edge outwards
  const kinds = ['lamp', 'tree', 'tree', 'hydrant', 'mailbox', 'bench', 'trash', 'sign', 'planter', 'cart'];
  const place = (x, z, rot) => {
    if (!rng.chance(0.55)) return;
    const k = rng.pick(kinds);
    props.add(k, x, z, rot + rng.range(-0.2, 0.2), rng.range(0.9, 1.15));
  };
  for (let x = r.x0 + 3; x < r.x1 - 2; x += rng.range(6, 9)) { place(x, r.z0 - edge, 0); place(x + 2, r.z1 + edge, Math.PI); }
  for (let z = r.z0 + 3; z < r.z1 - 2; z += rng.range(6, 9)) { place(r.x0 - edge, z, Math.PI / 2); place(r.x1 + edge, z + 2, -Math.PI / 2); }
}

function buildPark(r, rng, props, flats) {
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  const pathA = new THREE.BoxGeometry(r.x1 - r.x0 + 3, 0.27, 3); pathA.translate(cx, 0.135, cz); flats.push(paint(pathA, 0xc9b79c));
  const pathB = new THREE.BoxGeometry(3, 0.27, r.z1 - r.z0 + 3); pathB.translate(cx, 0.135, cz); flats.push(paint(pathB, 0xc9b79c));
  const n = rng.int(5, 9);
  for (let k = 0; k < n; k++) {
    const x = rng.range(r.x0 + 3, r.x1 - 3), z = rng.range(r.z0 + 3, r.z1 - 3);
    if (Math.abs(x - cx) < 2.5 || Math.abs(z - cz) < 2.5) continue;
    props.add(rng.chance(0.75) ? 'tree' : 'bench', x, z, rng.range(0, Math.PI * 2), rng.range(0.9, 1.3));
  }
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
