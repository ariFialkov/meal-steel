// Street furniture: destructible props (knock them flying) and fixed props (total your truck).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SpatialHash } from './colliders.js';

function colored(geo, hex) {
  const c = new THREE.Color(hex); const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  geo.deleteAttribute('uv');
  return geo;
}
function part(geo, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  geo.rotateX(rx); geo.rotateY(ry); geo.rotateZ(rz); geo.translate(x, y, z);
  return colored(geo, hex);
}
const G = THREE;
export const PROP_TYPES = {
  hydrant: { r: 0.45, fixed: false, mass: 0.3, build: () => mergeGeometries([
    part(new G.CylinderGeometry(0.28, 0.32, 0.9, 8), 0xd62828, 0, 0.45, 0),
    part(new G.SphereGeometry(0.3, 8, 6), 0xd62828, 0, 0.95, 0),
    part(new G.BoxGeometry(0.9, 0.2, 0.25), 0xb0b0b0, 0, 0.6, 0),
  ]) },
  mailbox: { r: 0.55, fixed: false, mass: 0.5, build: () => mergeGeometries([
    part(new G.BoxGeometry(0.8, 0.9, 0.7), 0x2f6fd6, 0, 0.95, 0),
    part(new G.CylinderGeometry(0.4, 0.4, 0.8, 8, 1, false, 0, Math.PI), 0x2f6fd6, 0, 1.4, 0, 0, 0, Math.PI / 2),
    part(new G.BoxGeometry(0.5, 0.6, 0.5), 0x555, 0, 0.3, 0),
  ]) },
  lamp: { r: 0.3, fixed: false, mass: 0.8, build: () => mergeGeometries([
    part(new G.CylinderGeometry(0.12, 0.18, 6, 6), 0x3b3f46, 0, 3, 0),
    part(new G.BoxGeometry(0.4, 0.3, 1.6), 0x3b3f46, 0, 6, 0.7),
    part(new G.BoxGeometry(0.5, 0.15, 0.8), 0xfff2b0, 0, 5.9, 1.2),
  ]) },
  bench: { r: 0.9, fixed: false, mass: 0.6, build: () => mergeGeometries([
    part(new G.BoxGeometry(1.8, 0.1, 0.5), 0x8b5a2b, 0, 0.5, 0),
    part(new G.BoxGeometry(1.8, 0.5, 0.1), 0x8b5a2b, 0, 0.8, -0.25),
    part(new G.BoxGeometry(0.1, 0.5, 0.5), 0x333, -0.8, 0.25, 0),
    part(new G.BoxGeometry(0.1, 0.5, 0.5), 0x333, 0.8, 0.25, 0),
  ]) },
  trash: { r: 0.45, fixed: false, mass: 0.3, build: () => mergeGeometries([
    part(new G.CylinderGeometry(0.4, 0.35, 1.0, 8), 0x5f6b6d, 0, 0.5, 0),
    part(new G.CylinderGeometry(0.44, 0.44, 0.1, 8), 0x2e3436, 0, 1.03, 0),
  ]) },
  tree: { r: 0.7, fixed: false, mass: 1.2, build: () => mergeGeometries([
    part(new G.CylinderGeometry(0.18, 0.25, 1.8, 6), 0x6b4a2b, 0, 0.9, 0),
    part(new G.SphereGeometry(1.3, 8, 6), 0x4caf50, 0, 2.6, 0),
    part(new G.SphereGeometry(0.9, 7, 5), 0x5ec25e, 0.5, 3.2, 0.3),
  ]) },
  cone: { r: 0.3, fixed: false, mass: 0.1, build: () => mergeGeometries([
    part(new G.ConeGeometry(0.32, 0.9, 8), 0xff6a2a, 0, 0.45, 0),
    part(new G.BoxGeometry(0.8, 0.08, 0.8), 0x222, 0, 0.04, 0),
  ]) },
  barrel: { r: 0.6, fixed: false, mass: 0.7, build: () => mergeGeometries([
    part(new G.CylinderGeometry(0.5, 0.5, 1.1, 10), 0x2f6fd6, 0, 0.55, 0),
    part(new G.CylinderGeometry(0.52, 0.52, 0.12, 10), 0xdddddd, 0, 0.3, 0),
    part(new G.CylinderGeometry(0.52, 0.52, 0.12, 10), 0xdddddd, 0, 0.8, 0),
  ]) },
  cart: { r: 0.9, fixed: false, mass: 0.9, build: () => mergeGeometries([
    part(new G.BoxGeometry(1.6, 1.0, 1.0), 0xeeeeee, 0, 0.9, 0),
    part(new G.BoxGeometry(1.9, 0.1, 1.3), 0xd62828, 0, 2.0, 0),
    part(new G.CylinderGeometry(0.05, 0.05, 1.2, 4), 0x444, 0.8, 1.4, 0.5), part(new G.CylinderGeometry(0.05, 0.05, 1.2, 4), 0x444, -0.8, 1.4, 0.5),
    part(new G.CylinderGeometry(0.3, 0.3, 0.2, 8), 0x222, 0.7, 0.3, 0, Math.PI / 2), part(new G.CylinderGeometry(0.3, 0.3, 0.2, 8), 0x222, -0.7, 0.3, 0, Math.PI / 2),
  ]) },
  planter: { r: 0.7, fixed: false, mass: 1.0, build: () => mergeGeometries([
    part(new G.BoxGeometry(1.2, 0.6, 1.2), 0x8d6e63, 0, 0.3, 0),
    part(new G.SphereGeometry(0.7, 7, 5), 0xe91e63, 0, 0.9, 0),
  ]) },
  sign: { r: 0.25, fixed: false, mass: 0.3, build: () => mergeGeometries([
    part(new G.CylinderGeometry(0.06, 0.06, 2.6, 5), 0x888, 0, 1.3, 0),
    part(new G.BoxGeometry(0.7, 0.7, 0.06), 0xffffff, 0, 2.5, 0),
    part(new G.BoxGeometry(0.55, 0.55, 0.07), 0xd62828, 0, 2.5, 0),
  ]) },
  // fixed props: hitting these fast totals your truck
  bigtree: { r: 1.4, fixed: true, build: () => mergeGeometries([
    part(new G.CylinderGeometry(0.6, 0.9, 4, 8), 0x5b3d22, 0, 2, 0),
    part(new G.SphereGeometry(3.6, 10, 8), 0x2e7d32, 0, 6.2, 0),
    part(new G.SphereGeometry(2.6, 9, 7), 0x43a047, 1.6, 7.6, 1.0),
    part(new G.SphereGeometry(2.2, 9, 7), 0x388e3c, -1.8, 7.2, -0.8),
  ]) },
  celltower: { r: 1.3, fixed: true, build: () => mergeGeometries([
    part(new G.BoxGeometry(2.4, 1.2, 2.4), 0x777, 0, 0.6, 0),
    part(new G.CylinderGeometry(0.35, 0.8, 22, 6), 0x9aa0a6, 0, 12, 0),
    part(new G.BoxGeometry(3.2, 0.3, 3.2), 0x9aa0a6, 0, 21, 0),
    part(new G.CylinderGeometry(0.8, 0.3, 0.5, 8), 0xeeeeee, 1.2, 19, 0, Math.PI / 3),
    part(new G.CylinderGeometry(0.8, 0.3, 0.5, 8), 0xeeeeee, -1.2, 18, 0, -Math.PI / 3),
    part(new G.SphereGeometry(0.25, 6, 5), 0xff2a2a, 0, 23.3, 0),
  ]) },
  statue: { r: 1.8, fixed: true, build: () => mergeGeometries([
    part(new G.BoxGeometry(3.6, 1.4, 3.6), 0x8d8d8d, 0, 0.7, 0),
    part(new G.BoxGeometry(2.2, 1.0, 2.2), 0x9d9d9d, 0, 1.9, 0),
    part(new G.CylinderGeometry(0.5, 0.7, 2.4, 8), 0x6f7f6f, 0, 3.6, 0),
    part(new G.SphereGeometry(0.6, 8, 6), 0x6f7f6f, 0, 5.2, 0),
    part(new G.BoxGeometry(2.2, 0.3, 0.3), 0x6f7f6f, 0, 4.5, 0),
  ]) },
  fountain: { r: 4.2, fixed: true, build: () => mergeGeometries([
    part(new G.CylinderGeometry(4.2, 4.4, 0.8, 18), 0xb0bec5, 0, 0.4, 0),
    part(new G.CylinderGeometry(3.6, 3.6, 0.5, 18), 0x4fc3f7, 0, 0.8, 0),
    part(new G.CylinderGeometry(0.6, 1.0, 2.4, 10), 0xb0bec5, 0, 1.8, 0),
    part(new G.CylinderGeometry(1.4, 0.8, 0.5, 12), 0xb0bec5, 0, 3.0, 0),
    part(new G.SphereGeometry(0.5, 8, 6), 0x81d4fa, 0, 3.6, 0),
  ]) },
  pillar: { r: 0.9, fixed: true, h: 5.5, build: () => mergeGeometries([part(new G.BoxGeometry(1.6, 6, 1.6), 0x8d8d8d, 0, 3, 0)]) },
  goalpost: { r: 0.6, fixed: true, build: () => mergeGeometries([part(new G.CylinderGeometry(0.4, 0.4, 7, 8), 0xffffff, 0, 3.5, 0)]) },
};

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();

export class PropSystem {
  constructor(scene, maxPerType = 400) {
    this.scene = scene;
    this.items = []; this.hash = new SpatialHash(16); this._q = [];
    this.meshes = {}; this.counts = {};
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.maxPerType = maxPerType;
    this.active = [];
  }
  _mesh(type) {
    if (this.meshes[type]) return this.meshes[type];
    const geo = PROP_TYPES[type].build();
    const m = new THREE.InstancedMesh(geo, this.material, this.maxPerType);
    m.count = 0; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(m); this.meshes[type] = m; this.counts[type] = 0;
    return m;
  }
  add(type, x, z, rotY = 0, scale = 1, y = 0) {
    const def = PROP_TYPES[type]; const mesh = this._mesh(type);
    if (mesh.count >= this.maxPerType) return null;
    const idx = mesh.count++;
    const it = { type, def, idx, x, y, z, rot: rotY, scale, r: def.r * scale, fixed: def.fixed, alive: true,
      vx: 0, vy: 0, vz: 0, spin: 0, tilt: 0, tiltAxis: 0, life: 0, mesh, _st: 0 };
    this.items.push(it);
    this.hash.insert(it, x - it.r - 0.5, z - it.r - 0.5, x + it.r + 0.5, z + it.r + 0.5);
    this._write(it);
    return it;
  }
  _write(it) {
    _p.set(it.x, it.y, it.z);
    _e.set(it.tilt * Math.cos(it.tiltAxis), it.rot, it.tilt * Math.sin(it.tiltAxis));
    _q.setFromEuler(_e);
    _s.setScalar(it.scale);
    _m.compose(_p, _q, _s);
    it.mesh.setMatrixAt(it.idx, _m);
    it.mesh.instanceMatrix.needsUpdate = true;
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
  reset() { for (const m of Object.values(this.meshes)) { m.count = 0; } this.items.length = 0; this.hash = new SpatialHash(16); this.active.length = 0; }
}
