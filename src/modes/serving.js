// Customer queues for Rumble serving spots: a short line of pedestrians waits at an open spot; when a truck parks
// they step up one at a time, order (speech bubble), get their food and walk off. Cheap: a handful of small merged
// meshes per spot, animated with plain transforms. Knock the serving truck off its spot and the line panics: everyone
// runs off screaming, arms up and pants on fire, and a fresh line pops back in once a truck holds the spot again.
import * as THREE from 'three';
import { GeoBuilder } from '../world/builder.js';
import { person } from '../world/setpieces.js';

const QUEUE_LEN = 4;
const _w = new THREE.Vector3(), clamp01 = (v) => Math.max(0, Math.min(1, v));
const SLOT = (k) => new THREE.Vector3(3.4 + k * 1.15, 0, 0.25 + k * 0.55);   // local positions, front of the line first
const ARRIVE = new THREE.Vector3(9.5, 0, 4.5), LEAVE_DIR = new THREE.Vector3(0.9, 0, -1).normalize();
let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.strokeStyle = '#22304a'; x.lineWidth = 7;
  x.beginPath(); x.roundRect(8, 8, 112, 84, 22); x.moveTo(40, 92); x.lineTo(34, 118); x.lineTo(64, 92); x.fill(); x.stroke();
  x.fillStyle = '#e9b96e'; x.beginPath(); x.ellipse(64, 40, 32, 16, 0, Math.PI, 0); x.fill();               // burger bun
  x.fillStyle = '#3fd46f'; x.fillRect(30, 40, 68, 7); x.fillStyle = '#8a4a2a'; x.fillRect(32, 47, 64, 10);
  x.fillStyle = '#e9b96e'; x.beginPath(); x.roundRect(32, 57, 64, 12, 6); x.fill();
  const bubble = new THREE.CanvasTexture(c); bubble.colorSpace = THREE.SRGBColorSpace;
  const boxGeo = new THREE.BoxGeometry(0.45, 0.3, 0.32), boxMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  const bandGeo = new THREE.BoxGeometry(0.46, 0.08, 0.33), bandMat = new THREE.MeshStandardMaterial({ color: 0xff4d57, roughness: 0.6 });
  // cartoon flame for panicking customers
  const f = document.createElement('canvas'); f.width = 64; f.height = 96; const fx = f.getContext('2d');
  const flame = (sc, col) => { fx.save(); fx.translate(32, 92); fx.scale(sc, sc); fx.beginPath(); fx.moveTo(0, 0); fx.bezierCurveTo(-30, -6, -26, -40, -8, -58); fx.bezierCurveTo(-6, -40, 6, -44, 2, -86); fx.bezierCurveTo(22, -60, 30, -30, 24, -12); fx.bezierCurveTo(20, -2, 10, 0, 0, 0); fx.closePath(); fx.fillStyle = col; fx.fill(); fx.restore(); };
  fx.lineWidth = 6; fx.strokeStyle = '#22304a'; flame(1, '#ff5a1f'); fx.stroke(); flame(0.68, '#ffb02a'); flame(0.38, '#fff3a0');
  const flameTex = new THREE.CanvasTexture(f); flameTex.colorSpace = THREE.SRGBColorSpace;
  const flameMat = new THREE.SpriteMaterial({ map: flameTex, depthWrite: false, toneMapped: false });
  SHARED = { mat, bubble, boxGeo, boxMat, bandGeo, bandMat, flameMat };
  return SHARED;
}

function makeCustomer(rng) {
  const S = shared(), b = new GeoBuilder(), scale = rng.range(0.92, 1.08);
  const look = person(b, 0, 0, 0, rng, scale);
  const g = new THREE.Group(), body = new THREE.Mesh(b.build(), S.mat); body.castShadow = true; g.add(body);
  const food = new THREE.Group(); food.add(new THREE.Mesh(S.boxGeo, S.boxMat), new THREE.Mesh(S.bandGeo, S.bandMat));
  food.position.set(0.28, 0.85, 0.22); food.visible = false; g.add(food);
  g.userData = { body, food, look, scale };
  return g;
}
/** swap a customer into the panic pose (built on demand) with flames on the back and head */
function makePanic(m, rng) {
  const S = shared(), u = m.userData, b = new GeoBuilder();
  person(b, 0, 0, 0, rng, u.scale, u.look, 'panic');
  const panic = new THREE.Mesh(b.build(), S.mat); panic.castShadow = true;
  u.body.visible = false; u.food.visible = false; m.add(panic); u.panic = panic;
  u.flames = [[0, 2.45, -0.05, 0.95], [0.14, 1.35, -0.3, 0.75], [-0.16, 0.9, -0.25, 0.6]].map(([x, y, z, sc]) => { const sp = new THREE.Sprite(S.flameMat); sp.position.set(x, y, z); sp.scale.set(sc * 0.66, sc, 1); sp.userData.base = sc; m.add(sp); return sp; });
}
function disposeCustomer(m) { m.userData.body.geometry.dispose(); m.userData.panic?.geometry.dispose(); }

export class ServeQueue {
  constructor(spotGroup, rng) {
    this.group = spotGroup; this.rng = rng; this.line = []; this.leaving = []; this.fleeing = []; this.spawnT = 0; this.cycle = null; this.panicking = false;
    this.onPuff = null; // (worldX, worldY, worldZ) smoke trail from the runners
    const S = shared();
    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: S.bubble, depthWrite: false })); this.bubble.scale.set(1.3, 1.3, 1); this.bubble.visible = false;
    spotGroup.add(this.bubble);
    for (let k = 0; k < QUEUE_LEN; k++) this.join(SLOT(k));
  }
  join(at, pop = false) {
    const c = makeCustomer(this.rng); c.position.copy(at); c.rotation.y = -Math.PI / 2 + this.rng.range(-0.3, 0.3);
    if (pop) c.scale.setScalar(0.01);
    this.group.add(c); this.line.push({ mesh: c, phase: this.rng.range(0, 6), pop: pop ? -this.line.length * 0.12 : null });
  }
  /** The serving truck got knocked off the spot: everyone in (and leaving) the line runs for it. */
  panic() {
    if (this.panicking) return;
    this.panicking = true; this.cycle = null; this.bubble.visible = false; this.spawnT = 0;
    for (const cu of [...this.line, ...this.leaving]) {
      const m = cu.mesh, a = Math.atan2(m.position.x, m.position.z) + this.rng.range(-0.7, 0.7);
      makePanic(m, this.rng); m.scale.setScalar(1);
      this.fleeing.push({ mesh: m, t: this.rng.range(-0.15, 0), dir: a, speed: this.rng.range(5.5, 7.5), wig: this.rng.range(0, 6) });
    }
    this.line = []; this.leaving = [];
  }
  /** A truck holds the spot again: a fresh line pops back in. */
  restore() {
    this.panicking = false;
    for (let k = 0; k < QUEUE_LEN; k++) this.join(SLOT(k), true);
  }
  /** occupied: a truck is parked and serving. onServed is called when a customer gets their food. */
  update(dt, t, occupied, onServed) {
    this.updateFleeing(dt, t);
    if (this.panicking) { if (occupied) this.restore(); else return; }
    // walk everyone in line towards their slot
    this.line.forEach((cu, k) => {
      if (cu.pop !== null) { cu.pop += dt; const q = clamp01(cu.pop / 0.35); cu.mesh.scale.setScalar(Math.max(0.01, q < 1 ? 1 + Math.sin(q * Math.PI) * 0.25 - (1 - q) : 1)); if (cu.pop > 0.35) { cu.pop = null; cu.mesh.scale.setScalar(1); } }
      const target = SLOT(k), m = cu.mesh, d = target.clone().sub(m.position); const dist = d.length();
      if (dist > 0.03) { m.position.addScaledVector(d, Math.min(1, (2.2 * dt) / dist)); m.rotation.y = Math.atan2(d.x, d.z); m.userData.body.position.y = Math.abs(Math.sin(t * 11 + cu.phase)) * 0.07; }
      else { m.userData.body.position.y = 0; m.rotation.y += ((-Math.PI / 2 + Math.sin(t * 0.7 + cu.phase) * 0.35) - m.rotation.y) * Math.min(1, 3 * dt); }
    });
    // serving cycle for the customer at the front
    const front = this.line[0];
    if (occupied && front && front.mesh.position.distanceTo(SLOT(0)) < 0.2) {
      if (!this.cycle) this.cycle = { t: 0 };
      this.cycle.t += dt;
      const ct = this.cycle.t;
      this.bubble.visible = ct < 0.9;
      this.bubble.position.set(front.mesh.position.x, 2.75 + Math.sin(t * 6) * 0.05, front.mesh.position.z);
      if (ct > 1.4 && !front.mesh.userData.food.visible) { front.mesh.userData.food.visible = true; onServed(); }
      if (ct > 1.9) { this.line.shift(); this.leaving.push({ mesh: front.mesh, t: 0 }); this.cycle = null; this.bubble.visible = false; }
    } else if (!occupied) { this.cycle = null; this.bubble.visible = false; }
    // leavers walk off with their food and fade out
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const l = this.leaving[i]; l.t += dt;
      l.mesh.position.addScaledVector(LEAVE_DIR, 2.4 * dt); l.mesh.rotation.y = Math.atan2(LEAVE_DIR.x, LEAVE_DIR.z);
      l.mesh.userData.body.position.y = Math.abs(Math.sin(t * 11 + i)) * 0.07;
      if (l.t > 2.2) l.mesh.scale.setScalar(Math.max(0.01, 1 - (l.t - 2.2) / 0.5));
      if (l.t > 2.7) { this.group.remove(l.mesh); disposeCustomer(l.mesh); this.leaving.splice(i, 1); }
    }
    // new customers wander up to the back of the line
    if (this.line.length < QUEUE_LEN) { this.spawnT += dt; if (this.spawnT > 1.2) { this.spawnT = 0; this.join(ARRIVE); } }
  }
  /** runners: sprint away zig-zagging with a frantic bounce, flames flickering, then shrink away */
  updateFleeing(dt, t) {
    for (let i = this.fleeing.length - 1; i >= 0; i--) {
      const f = this.fleeing[i], m = f.mesh; f.t += dt;
      if (f.t < 0) continue;
      const a = f.dir + Math.sin(t * 7 + f.wig) * 0.5;
      m.position.x += Math.sin(a) * f.speed * dt; m.position.z += Math.cos(a) * f.speed * dt; m.rotation.y = a;
      m.userData.panic.position.y = Math.abs(Math.sin(t * 19 + f.wig)) * 0.22; m.userData.panic.rotation.z = Math.sin(t * 19 + f.wig) * 0.12;
      for (const sp of m.userData.flames) { const k = sp.userData.base * (0.85 + Math.random() * 0.35); sp.scale.set(k * 0.66, k, 1); }
      if (this.onPuff && Math.random() < 0.06) { const w = m.getWorldPosition(_w); this.onPuff(w.x, w.y + 2.2, w.z); }
      if (f.t > 2.3) m.scale.setScalar(Math.max(0.01, 1 - (f.t - 2.3) / 0.4));
      if (f.t > 2.7) { this.group.remove(m); disposeCustomer(m); this.fleeing.splice(i, 1); }
    }
  }
  dispose() { for (const c of [...this.line, ...this.leaving, ...this.fleeing]) disposeCustomer(c.mesh); }
}
