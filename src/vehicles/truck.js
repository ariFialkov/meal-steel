// Truck: cartoon mesh + arcade physics + status effects.
import * as THREE from 'three';
import { clamp, wrapAngle, damp } from '../core/math.js';
import { obbVsObb } from '../world/colliders.js';
import { getTruckModel } from './models.js';
import { iceShell, noodleNet, cheeseGoo } from './specials/assets.js';

const labelCache = new Map();
function makeLabel(def) {
  if (labelCache.has(def.id)) return labelCache.get(def.id);
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#' + def.accent.toString(16).padStart(6, '0'); ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#' + def.trim.toString(16).padStart(6, '0'); ctx.fillRect(0, 0, 512, 14); ctx.fillRect(0, 114, 512, 14);
  ctx.font = 'bold 64px "Arial Black", Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lum = ((def.accent >> 16) & 255) * 0.3 + ((def.accent >> 8) & 255) * 0.59 + (def.accent & 255) * 0.11;
  ctx.fillStyle = lum > 140 ? '#1b1430' : '#fff6e8';
  let size = 64; ctx.font = `bold ${size}px "Arial Black", Impact, sans-serif`;
  while (ctx.measureText(def.name.toUpperCase()).width > 470 && size > 30) { size -= 4; ctx.font = `bold ${size}px "Arial Black", Impact, sans-serif`; }
  ctx.fillText(def.name.toUpperCase(), 256, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  labelCache.set(def.id, t); return t;
}

function mat(color, extra = {}) { return new THREE.MeshLambertMaterial({ color, ...extra }); }
function box(w, h, d, color, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color)); m.position.set(x, y, z); m.castShadow = true; return m; }
function cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 10) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color)); m.position.set(x, y, z); m.castShadow = true; return m; }
function sph(r, color, x = 0, y = 0, z = 0, ws = 10, hs = 8) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat(color)); m.position.set(x, y, z); m.castShadow = true; return m; }

function buildTopper(kind, def) {
  const g = new THREE.Group(); const a = def.accent, t = def.trim;
  switch (kind) {
    case 'sausage': { const bun = box(1.5, 0.5, 3.2, 0xe8c07a, 0, 0.25, 0); g.add(bun); const s = cyl(0.42, 0.42, 3.0, 0xa5452a, 0, 0.75, 0); s.rotation.x = Math.PI / 2; g.add(s); g.add(sph(0.42, 0xa5452a, 0, 0.75, 1.5), sph(0.42, 0xa5452a, 0, 0.75, -1.5)); const m = box(0.25, 0.1, 2.6, 0xf5d20a, 0, 1.2, 0); g.add(m); break; }
    case 'fries': { g.add(box(1.6, 1.3, 1.0, 0xd2302b, 0, 0.65, 0)); for (let i = 0; i < 6; i++) { const f = box(0.22, 1.9, 0.22, 0xf5c518, -0.55 + (i % 3) * 0.55, 1.5 + (i % 2) * 0.2, -0.25 + Math.floor(i / 3) * 0.5); f.rotation.z = (i - 2.5) * 0.08; g.add(f); } break; }
    case 'bowl': { g.add(cyl(1.3, 0.9, 1.0, a, 0, 0.5, 0, 14)); g.add(cyl(1.15, 1.15, 0.12, 0xf3e5ab, 0, 1.02, 0, 14)); const c1 = cyl(0.06, 0.06, 2.4, 0x5a3b10, 0.3, 1.5, 0, 5); c1.rotation.z = 0.6; const c2 = c1.clone(); c2.position.x = -0.3; c2.rotation.z = -0.6; g.add(c1, c2); break; }
    case 'burrito': { const b = cyl(0.55, 0.55, 3.2, 0xd9d9d9, 0, 0.7, 0, 12); b.rotation.x = Math.PI / 2; b.rotation.z = 0.25; g.add(b); g.add(sph(0.55, 0xd9d9d9, 0.35, 0.7, 1.5)); const o = sph(0.5, 0xf9e4b7, -0.4, 0.7, -1.6); g.add(o); break; }
    case 'pot': { g.add(cyl(1.1, 1.0, 1.2, 0x5a1a1a, 0, 0.6, 0, 14)); g.add(cyl(1.15, 1.15, 0.2, 0x8a8a8a, 0, 1.25, 0, 14)); g.add(sph(0.2, 0x333, 0, 1.5, 0)); g.add(box(0.5, 0.12, 0.12, 0x8a8a8a, 1.3, 0.8, 0), box(0.5, 0.12, 0.12, 0x8a8a8a, -1.3, 0.8, 0)); break; }
    case 'churro': { for (let i = 0; i < 3; i++) { const c = cyl(0.17, 0.17, 3.4, 0xd98c3f, 0, 0.5 + i * 0.3, 0, 6); c.rotation.x = Math.PI / 2; c.rotation.y = (i - 1) * 0.35; g.add(c); } g.add(sph(0.2, 0xfff0d6, 0.3, 1.2, 0.5), sph(0.15, 0xfff0d6, -0.4, 1.3, -0.4)); break; }
    case 'sub': { const b = cyl(0.6, 0.6, 3.4, 0xe8c07a, 0, 0.6, 0, 12); b.rotation.x = Math.PI / 2; g.add(b, sph(0.6, 0xe8c07a, 0, 0.6, 1.7), sph(0.6, 0xe8c07a, 0, 0.6, -1.7)); const l = box(1.4, 0.12, 3.2, 0x4caf50, 0, 0.62, 0); g.add(l); const h = box(1.2, 0.1, 3.0, 0xd25a5a, 0, 0.74, 0); g.add(h); break; }
    case 'cone': { const c = cyl(0.6, 0.05, 1.8, 0xe6b86a, 0, 0.9, 0, 10); g.add(c); g.add(sph(0.75, 0xff7eb6, 0, 2.1, 0), sph(0.55, 0xfff8f0, 0.2, 2.7, 0.1), sph(0.12, 0xd62828, 0.3, 3.2, 0.1)); break; }
    case 'spit': { g.add(cyl(0.05, 0.05, 3.2, 0xbbbbbb, 0, 1.6, 0, 6)); g.add(cyl(0.5, 0.75, 2.0, 0x8b5a2b, 0, 1.6, 0, 12)); g.add(cyl(0.5, 0.5, 0.3, 0x5a3b10, 0, 2.7, 0, 12)); break; }
    case 'egg': { g.add(cyl(1.3, 1.1, 0.25, 0xffffff, 0, 0.15, 0, 14)); g.add(sph(0.6, 0xffb100, 0, 0.3, 0)); const sh = sph(0.9, 0xfff3b0, 1.3, 0.9, -1.2); sh.scale.y = 1.3; g.add(sh); break; }
    case 'wrap': { const w = cyl(0.5, 0.5, 2.8, 0x9fcb6f, 0, 0.7, 0, 12); w.rotation.x = Math.PI / 2; w.rotation.y = 0.5; g.add(w); g.add(cyl(0.45, 0.45, 0.2, 0xd25a5a, 1.0, 0.7, 1.1, 12)); break; }
    case 'box': { g.add(box(1.4, 1.5, 1.2, 0xffffff, 0, 0.75, 0)); g.add(box(1.5, 0.15, 1.3, 0xd62828, 0, 1.5, 0)); const h = cyl(0.05, 0.05, 1.6, 0xbbbbbb, 0, 1.9, 0, 5); h.rotation.z = Math.PI / 2; g.add(h); const p = box(0.4, 0.5, 0.05, 0xd62828, 0, 0.7, 0.62); g.add(p); break; }
    case 'smoker': { const s = cyl(0.8, 0.8, 2.6, 0x222, 0, 0.8, 0, 12); s.rotation.x = Math.PI / 2; g.add(s); g.add(cyl(0.22, 0.22, 1.4, 0x444, 0.3, 1.9, -0.9, 8)); g.add(sph(0.35, 0x888, 0.3, 2.7, -0.9)); break; }
    case 'keg': { const k = cyl(0.8, 0.8, 2.2, 0xc0c0c0, 0, 0.8, 0, 12); k.rotation.x = Math.PI / 2; g.add(k); g.add(cyl(0.82, 0.82, 0.2, 0x555, 0, 0.8, 0.6, 12), cyl(0.82, 0.82, 0.2, 0x555, 0, 0.8, -0.6, 12)); g.add(cyl(0.08, 0.08, 0.8, 0xffc400, 0, 1.8, 0.9, 6), sph(0.3, 0xffc400, 0, 2.2, 0.9)); break; }
    default: g.add(sph(0.8, a, 0, 0.8, 0));
  }
  g.position.set(0, 3.1, -0.6);
  return g;
}

/** Blocky fallback truck for trucks without a model. Adds parts to body/root and returns the wheels. */
function buildProceduralBody(def, body, root) {
  // chassis + body box + cab
  body.add(box(2.4, 0.5, 5.4, def.trim, 0, 0.75, 0));
  const cargo = box(2.5, 2.0, 3.6, def.body, 0, 2.0, -0.7); body.add(cargo);
  body.add(box(2.3, 1.3, 1.7, def.body, 0, 1.6, 1.95));
  body.add(box(2.1, 0.7, 0.9, 0x9ad4ff, 0, 1.75, 2.4)); // windshield
  body.add(box(2.5, 0.25, 0.4, def.trim, 0, 0.75, 2.75)); // bumper
  body.add(box(0.3, 0.2, 0.1, 0xfff2b0, -0.9, 1.05, 2.78), box(0.3, 0.2, 0.1, 0xfff2b0, 0.9, 1.05, 2.78));
  body.add(box(0.3, 0.2, 0.1, 0xff2a2a, -0.9, 1.1, -2.72), box(0.3, 0.2, 0.1, 0xff2a2a, 0.9, 1.1, -2.72));
  // serving window + awning on the right side
  body.add(box(0.1, 1.0, 2.4, 0x1b1430, 1.27, 2.3, -0.7));
  const awn = box(0.9, 0.12, 2.8, def.accent, 1.65, 2.95, -0.7); awn.rotation.z = 0.25; body.add(awn);
  // labels
  const lab = new THREE.MeshLambertMaterial({ map: makeLabel(def) });
  const lmL = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), lab); lmL.position.set(-1.26, 2.1, -0.7); lmL.rotation.y = -Math.PI / 2; body.add(lmL);
  const lmB = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), lab); lmB.position.set(0, 2.3, -2.51); lmB.rotation.y = Math.PI; body.add(lmB);
  // accent stripe
  body.add(box(2.52, 0.3, 3.62, def.accent, 0, 1.25, -0.7));
  // topper
  body.add(buildTopper(def.topper, def));
  // wheels
  const wheels = [];
  const wgeo = new THREE.CylinderGeometry(0.55, 0.55, 0.5, 12), wmat = mat(0x1e1e24), hmat = mat(0xcccccc);
  for (const [x, z] of [[-1.15, 1.7], [1.15, 1.7], [-1.15, -1.6], [1.15, -1.6]]) {
    const w = new THREE.Group(); w.position.set(x, 0.55, z);
    const spin = new THREE.Group(); w.add(spin);
    const tyre = new THREE.Mesh(wgeo, wmat); tyre.rotation.z = Math.PI / 2; tyre.castShadow = true; spin.add(tyre);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.52, 8), hmat); hub.rotation.z = Math.PI / 2; spin.add(hub);
    root.add(w); wheels.push({ pivot: w, spin, front: z > 0, r: 0.55 });
  }
  return wheels;
}

/**
 * root (position, heading) -> chassis (ramp slope, tumbles) -> body on suspension + wheels planted on the ground.
 * userData.wheels: [{ pivot (steers about y), spin (rolls about x), front, r }].
 */
export function buildTruckMesh(def) {
  const root = new THREE.Group();
  const chassis = new THREE.Group(); root.add(chassis);
  const body = new THREE.Group(); chassis.add(body);
  const model = getTruckModel(def.id);
  let wheels = [];
  if (model) {
    body.add(model.body);
    for (const w of model.wheels) { chassis.add(w.pivot); wheels.push({ pivot: w.pivot, spin: w.pivot.children[0], front: w.front, r: w.r }); }
    for (const p of Object.values(model.parts)) body.add(p);
  } else wheels = buildProceduralBody(def, body, chassis);
  const parts = model ? model.parts : {};
  // status visuals
  const ice = iceShell(); ice.visible = false; root.add(ice);
  const net = noodleNet(true); net.visible = false; root.add(net);
  const shield = new THREE.Mesh(new THREE.SphereGeometry(3.8, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.25 })); shield.position.y = 1.8; shield.visible = false; root.add(shield);
  root.userData = { chassis, body, wheels, parts, ice, net, shield };
  return root;
}

const HW = 1.25, HL = 2.75, CIRC_R = 1.3, CIRC_OFF = 1.55;
const RAMP_PTS = [[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 1], [0, -1], [1, 0], [-1, 0], [0.5, 1], [0.5, -1], [-0.5, 1], [-0.5, -1]];
let nextId = 1;

export class Truck {
  constructor(def, { isPlayer = false, team = 0 } = {}) {
    this.id = nextId++;
    this.def = def; this.name = def.name; this.isPlayer = isPlayer; this.team = team;
    this.mesh = buildTruckMesh(def);
    this.x = 0; this.z = 0; this.y = 0; this.heading = 0; this.vx = 0; this.vz = 0; this.vy = 0; this.angVel = 0;
    this.hw = HW; this.hl = HL;
    const s = def.stats;
    this.maxSpeed = 24 + s.speed * 2.4;
    this.accel = 9 + s.accel * 2.0;
    this.turnRate = 1.7 + s.handling * 0.28;
    this.mass = 1 + s.weight * 0.3;
    this.turboTime = 0; this.turboCd = 0; this.turboCdMax = 7;
    // two special moves, each on its own cooldown (light: quick and cheap, heavy: big and slow to recharge)
    this.cd = { light: 0, heavy: 0 }; this.cdMax = { light: def.light.cooldown, heavy: def.heavy.cooldown };
    this.powerMul = 1; // a move may supercharge the truck for a while
    this.fx = { spin: 0, slick: 0, freeze: 0, drunk: 0, slow: 0, snare: 0, stun: 0, air: 0, burn: 0, blind: 0, ram: 0, gum: 0 };
    this.control = { steer: 0, throttle: 0, brake: false, handbrake: false, turbo: false, special: null };
    this.drifting = false; this.speed = 0; this.fwdSpeed = 0; this.lastImpact = 0; this.airborne = false; this.onOverpass = false;
    this.score = 0; this.alive = true; this.visible = true;
    this.lastHitBy = null; this.lastHitTime = -99;
    this.wheelDist = 0; this.steerVis = 0; this.slopeVis = 0; this.bounce = 0;
    // suspension: body heave / pitch / roll springs (slightly under-damped so it bobs on its axles)
    this.susp = { h: 0, hv: 0, p: 0, pv: 0, r: 0, rv: 0, acc: 0, lastFwd: 0 };
    this.groundH = 0; this.slope = 0; this._contacts = [];
    this.stuckTime = 0; this.events = [];
  }
  get fwdX() { return Math.sin(this.heading); }
  get fwdZ() { return Math.cos(this.heading); }
  get obb() { return { x: this.x, z: this.z, cos: Math.cos(this.heading), sin: Math.sin(this.heading), hw: this.hw, hl: this.hl }; }
  place(x, z, heading) { this.x = x; this.z = z; this.heading = heading; this.vx = this.vz = this.vy = 0; this.angVel = 0; this.y = 0; this.syncMesh(0); }
  disabled() { return this.fx.stun > 0 || this.fx.freeze > 0 || this.fx.snare > 0 || this.fx.spin > 0; }
  /** Footprint vs jump ramps: any corner or side point inside a ramp where its surface is well above the truck gets
   * pushed out the short way (sideways, or off the high end), and the velocity into the ramp is cancelled. */
  rampContacts(world, nfX, nfZ, nrX, nrZ) {
    for (const r of world.ramps) {
      const dx = this.x - r.cx, dz = this.z - r.cz;
      if (dx * dx + dz * dz > (r.len / 2 + 6) ** 2) continue;
      const k = r.height / r.len, ac = dx * r.ux + dz * r.uz + r.len / 2;
      let best = null;
      for (const [fo, so] of RAMP_PTS) {
        const px = this.x + nfX * fo * HL + nrX * so * HW, pz = this.z + nfZ * fo * HL + nrZ * so * HW;
        const qx = px - r.cx, qz = pz - r.cz, along = qx * r.ux + qz * r.uz + r.len / 2, lat = -qx * r.uz + qz * r.ux;
        if (along <= 0 || along >= r.len || Math.abs(lat) >= r.hw) continue;
        // the surface a truck climbing the ramp expects at this point; anything well above it is a wall
        const expect = this.y + Math.max(0, along - ac) * k;
        if (r.height * (along / r.len) - expect < 0.6) continue;
        const side = r.hw - Math.abs(lat), back = r.len - along;
        const out = side < back ? { nx: -r.uz * (Math.sign(lat) || 1), nz: r.ux * (Math.sign(lat) || 1), d: side } : { nx: r.ux, nz: r.uz, d: back };
        if (!best || out.d > best.d) best = out;
      }
      if (!best) continue;
      this.x += best.nx * (best.d + 0.02); this.z += best.nz * (best.d + 0.02); this.touching = true;
      const vn = this.vx * best.nx + this.vz * best.nz;
      if (vn < 0) {
        const e = -vn > 4 ? 0.3 : 0;
        this.vx -= best.nx * vn * (1 + e); this.vz -= best.nz * vn * (1 + e);
        if (-vn > 4) this.events.push({ type: 'wall', strength: -vn / 10, x: this.x, z: this.z });
      }
    }
  }
  /** shielded trucks (a mode keeping its result on track) only wobble briefly from disabling effects */
  applyEffect(name, dur) { if (this.shielded && name !== 'ram') dur *= 0.15; this.fx[name] = Math.max(this.fx[name], dur); }
  impulse(ix, iz, iy = 0) { this.vx += ix / this.mass; this.vz += iz / this.mass; if (iy > 0) { this.vy += iy / this.mass; this.airborne = true; } }

  update(dt, world, t) {
    this.px = this.x; this.py = this.y; this.pz = this.z; this.ph = this.heading;
    const c = this.control, fx = this.fx;
    for (const k in fx) if (fx[k] > 0) fx[k] = Math.max(0, fx[k] - dt);
    if (this.turboTime > 0) this.turboTime -= dt; else if (this.turboCd > 0) this.turboCd = Math.max(0, this.turboCd - dt);
    for (const k of ['light', 'heavy']) if (this.cd[k] > 0) this.cd[k] = Math.max(0, this.cd[k] - dt);

    const disabled = this.disabled();
    let steer = disabled ? 0 : clamp(c.steer, -1, 1);
    let throttle = disabled ? 0 : clamp(c.throttle, -1, 1);
    if (fx.drunk > 0) steer = clamp(steer * -0.6 + Math.sin(t * 5.3) * 0.9, -1, 1);
    if (fx.blind > 0 && !this.isPlayer) steer = clamp(steer + Math.sin(t * 7.1 + this.id) * 0.8, -1, 1);
    if (c.turbo && this.turboCd <= 0 && this.turboTime <= 0 && !disabled) { this.turboTime = 1.6; this.turboCd = this.turboCdMax; this.events.push({ type: 'turbo' }); }
    // a mode may drive this truck kinematically (e.g. race bots on the racing line); effects hand it back to physics
    if (this.kinematicStep && !disabled && !this.airborne) {
      this.kinematicStep(dt, world);
      this.fwdSpeed = this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading); this.speed = Math.hypot(this.vx, this.vz);
      this.stuckTime = 0; this.drifting = false;
      this.syncMesh(dt, t);
      return;
    }
    const turbo = this.turboTime > 0;

    const fX = Math.sin(this.heading), fZ = Math.cos(this.heading), rX = Math.cos(this.heading), rZ = -Math.sin(this.heading);
    let fs = this.vx * fX + this.vz * fZ, ls = this.vx * rX + this.vz * rZ;
    // (gum: molten cheese round the axles, the truck crawls)
    const maxSp = this.maxSpeed * this.powerMul * (turbo ? 1.4 : 1) * (fx.slow > 0 || fx.burn > 0 ? 0.6 : 1) * (fx.ram > 0 ? 1.25 : 1) * (fx.blind > 0 ? 0.8 : 1) * (fx.gum > 0 ? 0.3 : 1);

    if (!this.airborne) {
      // longitudinal
      if (throttle > 0.05) { if (fs < maxSp) fs += this.accel * throttle * (turbo ? 1.8 : 1) * (this.powerMul > 1 ? 1.6 : 1) * dt; }
      else if (throttle < -0.05) { if (fs > 0.5) fs -= 24 * dt; else fs = Math.max(fs - 7 * dt, -maxSp * 0.35); }
      // drag
      fs *= Math.exp(-(0.25 + (throttle === 0 ? 0.6 : 0)) * dt);
      if (fs > maxSp) fs = damp(fs, maxSp, 3, dt);
      if (fx.slick > 0) fs *= Math.exp(-0.15 * dt);
      // drift logic
      const spd = Math.abs(fs);
      const wantDrift = !disabled && c.handbrake && Math.abs(steer) > 0.5 && spd > this.maxSpeed * 0.5;
      if (wantDrift && !this.drifting) { this.drifting = true; this.events.push({ type: 'driftStart' }); }
      if (this.drifting && (spd < this.maxSpeed * 0.3 || Math.abs(steer) < 0.15)) this.drifting = false;
      // steering
      // pressed against something, the wheels still scrub round so the driver can always turn away
      const steerSpd = this.touching ? Math.max(spd, Math.abs(throttle) * 4) : spd;
      const spFactor = (steerSpd > 0.4 ? clamp(steerSpd / 7, 0.35, 1) : 0) * (1 - 0.3 * clamp(spd / this.maxSpeed, 0, 1));
      let tr = this.turnRate * (this.drifting ? 1.6 : 1) * (fx.slick > 0 ? 0.35 : 1);
      const dir = fs > 0.5 ? 1 : fs < -0.5 ? -1 : (throttle < 0 ? -1 : 1);
      const targetAng = steer * tr * spFactor * dir;
      this.angVel = damp(this.angVel, targetAng, this.drifting ? 5 : 9, dt);
      if (fx.spin > 0) this.angVel = Math.sign(this.angVel || 1) * Math.max(Math.abs(this.angVel), 2 + fx.spin * 5);
      if (fx.ram > 0) this.angVel += 0; // visual spin handled on body
      // lateral grip
      let gripL = this.drifting ? 2.2 : 9;
      if (fx.slick > 0) gripL = 0.5;
      if (fx.spin > 0) gripL = 1.5;
      ls *= Math.exp(-gripL * dt);
      if (this.drifting) fs *= Math.exp(-0.25 * dt);
    } else {
      this.vy -= 26 * dt;
      this.angVel *= Math.exp(-1.5 * dt);
    }
    this.heading = wrapAngle(this.heading + this.angVel * dt);
    const nfX = Math.sin(this.heading), nfZ = Math.cos(this.heading), nrX = Math.cos(this.heading), nrZ = -Math.sin(this.heading);
    if (!this.airborne) { this.vx = nfX * fs + nrX * ls; this.vz = nfZ * fs + nrZ * ls; }
    this.x += this.vx * dt; this.z += this.vz * dt;

    // jump ramps are solid from the sides and the high end: push the truck's footprint out of them
    if (world.ramps.length) this.rampContacts(world, nfX, nfZ, nrX, nrZ);
    // elevation
    const el = world.elevation(this.x, this.z);
    if (el.ramp && el.h - this.y > 0.7) { el.h = Math.max(world.padHeight(this.x, this.z), this.y); el.ramp = false; } // still overlapping: stay level until pushed clear
    if (el.pad && !this.airborne && Math.abs(el.h - (this.groundH ?? 0)) > 0.05) this.groundStep = el.h - this.groundH; // kerb: jolt the springs
    this.groundH = el.h; this.onOverpass = !!el.op && el.h > 0.05;
    if (this.onOverpass) {
      const op = el.op, lim = op.halfWidth - 1.2;
      if (Math.abs(el.lat) > lim) {
        const over = Math.abs(el.lat) - lim, s = Math.sign(el.lat);
        // lateral direction vector of the overpass is (-uz, ux)
        this.x -= -op.uz * over * s; this.z -= op.ux * over * s;
        const vl = -this.vx * op.uz + this.vz * op.ux; if (vl * s > 0) { this.vx += op.uz * vl * 1.3; this.vz -= op.ux * vl * 1.3; this.events.push({ type: 'wall', strength: Math.abs(vl) / 10 }); }
      }
      const h2 = world.overpassHeightAlong(op, el.along + 1);
      this.slope = Math.atan2(h2 - el.h, 1) * (this.vx * op.ux + this.vz * op.uz >= 0 ? 1 : -1);
    } else this.slope = el.ramp ? Math.atan((this.vyGround || 0) / Math.max(4, Math.abs(this.fwdSpeed))) : 0;
    // vertical speed the ground imparts (ramps): used as launch speed when the ground drops away
    // (on the step the ground drops away the previous, rising value is kept, so it becomes the launch speed)
    // (kerbs and plaza edges are small steps, not ramps: they never launch a truck)
    if (el.pad) this.vyGround = 0;
    else if (!this.airborne && this.groundH > (this.prevGroundH ?? this.groundH) - 0.01) this.vyGround = (this.groundH - (this.prevGroundH ?? this.groundH)) / dt;
    this.prevGroundH = this.groundH;
    if (this.airborne) {
      this.y += this.vy * dt;
      if (this.y <= this.groundH) { this.y = this.groundH; this.vy = 0; this.airborne = false; this.bounce = 0.35; this.events.push({ type: 'land' }); }
    } else {
      this.y = el.ramp ? this.groundH : damp(this.y, this.groundH, 14, dt);
      if (this.groundH - this.y > 0.8) this.y = this.groundH;
      if (this.y - this.groundH > 1.2 || (this.y - this.groundH > 0.4 && (this.vyGround || 0) > 2)) { this.airborne = true; this.vy = Math.max(0, (this.vyGround || 0) * (this.turboTime > 0 ? 1.3 : 1.08)); this.events.push({ type: 'launch', vy: this.vy }); }
    }

    // static collisions: two circles vs world boxes
    this.lastImpact = 0; this.dbgContacts = 0;
    const wasTouching = this.touching; this.touching = false;
    for (const off of [CIRC_OFF, -CIRC_OFF]) {
      const cx = this.x + nfX * off, cz = this.z + nfZ * off;
      const contacts = world.circleContacts(cx, cz, CIRC_R, this._contacts);
      for (const ct of contacts) {
        if (this.y > (ct.box.height || 10) + 0.5) continue;
        this.dbgContacts++; this.touching = true;
        this.x += ct.nx * ct.depth; this.z += ct.nz * ct.depth;
        const vn = this.vx * ct.nx + this.vz * ct.nz;
        if (vn < 0) {
          const strength = -vn;
          // resting contact (pushing into a wall) just cancels the normal velocity; real impacts bounce
          const e = strength > 4 ? 0.35 : 0;
          this.vx -= ct.nx * vn * (1 + e); this.vz -= ct.nz * vn * (1 + e);
          const tangentKeep = strength > 4 ? 0.9 : 0.985;
          this.vx *= tangentKeep; this.vz *= tangentKeep;
          // a glancing impact twists the truck once; constant pushing must not build up spin
          if (strength > 6 && !wasTouching) this.angVel += clamp((off > 0 ? 1 : -1) * (ct.nx * nrX + ct.nz * nrZ) * strength * 0.08, -2, 2);
          if (strength > 3 && !wasTouching) { this.lastImpact = Math.max(this.lastImpact, strength); this.events.push({ type: 'wall', strength: strength / 10, x: cx, z: cz }); this.kick(ct.nx, ct.nz, strength); }
        }
      }
    }
    // bounds
    const b = world.bounds;
    if (this.x < b.minX + 1) { this.x = b.minX + 1; this.vx = Math.abs(this.vx) * 0.3; }
    if (this.x > b.maxX - 1) { this.x = b.maxX - 1; this.vx = -Math.abs(this.vx) * 0.3; }
    if (this.z < b.minZ + 1) { this.z = b.minZ + 1; this.vz = Math.abs(this.vz) * 0.3; }
    if (this.z > b.maxZ - 1) { this.z = b.maxZ - 1; this.vz = -Math.abs(this.vz) * 0.3; }

    this.fwdSpeed = this.vx * nfX + this.vz * nfZ;
    this.speed = Math.hypot(this.vx, this.vz);
    // stuck detector
    if (Math.abs(throttle) > 0.3 && this.speed < 2.5 && !disabled) this.stuckTime += dt; else this.stuckTime = Math.max(0, this.stuckTime - dt * 2);
    this.syncMesh(dt, t);
  }

  collideProps(props, onHit) {
    const list = props.nearby(this.x, this.z, 4.5);
    const fX = this.fwdX, fZ = this.fwdZ;
    for (const it of list) {
      if (!it.alive) continue;
      if (it.def.h !== undefined && this.y > it.def.h - 0.5) continue;
      // test against two circles
      let hit = false, nx = 0, nz = 0, depth = 0;
      for (const off of [CIRC_OFF, -CIRC_OFF, 0]) {
        const cx = this.x + fX * off, cz = this.z + fZ * off;
        const dx = cx - it.x, dz = cz - it.z, d = Math.hypot(dx, dz), rr = CIRC_R + it.r;
        if (d < rr) { hit = true; if (d > 1e-4) { nx = dx / d; nz = dz / d; } else { nx = fX; nz = fZ; } depth = rr - d; break; }
      }
      if (!hit) continue;
      if (it.fixed) {
        this.dbgContacts++;
        this.x += nx * depth; this.z += nz * depth;
        const vn = this.vx * nx + this.vz * nz;
        if (vn < 0) {
          const strength = -vn;
          const e = strength > 4 ? 0.5 : 0;
          this.vx -= nx * vn * (1 + e); this.vz -= nz * vn * (1 + e);
          if (strength > 13 && this.fx.stun <= 0 && this.fx.ram <= 0) { this.applyEffect('stun', 1.6); this.vx *= 0.25; this.vz *= 0.25; this.angVel = (Math.random() - 0.5) * 6; onHit?.(it, 'totaled', strength); }
          else onHit?.(it, 'bump', strength);
        }
      } else {
        const strength = this.speed / 10 + (this.fx.ram > 0 ? 1 : 0);
        props.knock(it, this.vx, this.vz, strength);
        const slow = clamp(0.3 * (it.def.mass || 0.5) / this.mass, 0, 0.3);
        this.vx *= 1 - slow; this.vz *= 1 - slow;
        onHit?.(it, 'smash', strength);
      }
    }
  }

  /** Cartwheel the body: a full roll (lands back on its wheels) or, for a knockout, half a roll onto its roof. */
  tumble(dir = 1, ko = false) {
    if (this.tumbleT !== undefined && this.tumbleT < this.tumbleDur) return;
    this.tumbleT = 0; this.tumbleDur = ko ? 0.9 : 1.15; this.tumbleKO = ko; this.tumbleDir = dir >= 0 ? 1 : -1;
    this.flipBase = this.flipped ? Math.PI : 0;
  }
  /** Place the mesh between the previous and current physics states (alpha in [0, 1]). */
  applyRender(alpha) {
    if (this.px === undefined) return;
    const a = alpha, b = 1 - alpha;
    this.rx = this.px * b + this.x * a; this.ry = this.py * b + this.y * a; this.rz = this.pz * b + this.z * a;
    this.rh = this.ph + wrapAngle(this.heading - this.ph) * a;
    const m = this.mesh;
    m.position.x = this.rx; m.position.z = this.rz; m.position.y += this.ry - this.y;
    m.rotation.y = this.rh;
  }
  /** Knock the suspension: a hit along world normal (nx, nz) with the given strength pitches and rolls the body. */
  kick(nx, nz, strength) {
    const f = nx * Math.sin(this.heading) + nz * Math.cos(this.heading), l = nx * Math.cos(this.heading) - nz * Math.sin(this.heading), k = Math.min(strength, 25);
    // (local +x is the truck's left) hit from the front: nose dives; shoved sideways: the body lags and leans away
    this.susp.pv -= f * k * 0.05; this.susp.rv += l * k * 0.06; this.susp.hv -= k * 0.02;
    if (this.rigFx) this.rigFx.kick = Math.max(this.rigFx.kick, k);
  }
  syncMesh(dt, t = 0) {
    const m = this.mesh, ud = m.userData, S = this.susp;
    m.position.set(this.x, this.y, this.z);
    m.rotation.set(0, this.heading, 0);
    if (dt > 0) {
      // drive the springs: squat under acceleration, dive under braking, lean out of corners, compress on landings
      const acc = (this.fwdSpeed - S.lastFwd) / dt; S.lastFwd = this.fwdSpeed;
      S.acc = damp(S.acc, clamp(acc, -45, 35), 10, dt);
      if (this.bounce > 0) { S.hv -= this.bounce * 7; S.pv += (Math.random() - 0.5) * this.bounce * 3; this.bounce = 0; }
      if (this.groundStep) { S.hv -= this.groundStep * 9; this.groundStep = 0; }
      const ground = !this.airborne, latAcc = this.angVel * this.fwdSpeed;
      const tp = ground ? clamp(-S.acc * 0.0042, -0.085, 0.1) : -0.03;
      const tr = (ground ? clamp(-latAcc * 0.0085, -0.12, 0.12) : 0) + (this.fx.drunk > 0 ? Math.sin(t * 6) * 0.1 : 0);
      const th = ground ? -0.035 * clamp(this.speed / 30, 0, 1) : 0.09;
      if (ground && this.speed > 6) S.hv += (Math.random() - 0.5) * this.speed * 0.012; // road texture
      const K = 150, C = 10.5, step = (x, v, target) => { v += (K * (target - x) - C * v) * dt; return [x + v * dt, v]; };
      [S.h, S.hv] = step(S.h, S.hv, th); [S.p, S.pv] = step(S.p, S.pv, tp); [S.r, S.rv] = step(S.r, S.rv, tr);
      S.h = clamp(S.h, -0.14, 0.2); S.p = clamp(S.p, -0.16, 0.16); S.r = clamp(S.r, -0.18, 0.18);
    }
    let flip = this.flipped ? Math.PI : 0;
    if (this.tumbleT !== undefined && this.tumbleT < this.tumbleDur) {
      this.tumbleT += dt; const k = Math.min(1, this.tumbleT / this.tumbleDur), e = 1 - Math.pow(1 - k, 3);
      flip = this.tumbleDir * e * (this.tumbleKO ? Math.PI : Math.PI * 2);
      if (k >= 1 && this.tumbleKO) this.flipped = true;
    }
    // chassis: follows the ramp slope; tumbles roll it (wheels and all) about the body's centre, 1.8 m up
    this.slopeVis = damp(this.slopeVis, -this.slope, 10, dt);
    const P = 1.8, ch = ud.chassis || ud.body;
    ch.position.set(P * Math.sin(flip), P * (1 - Math.cos(flip)), 0);
    ch.rotation.set(this.slopeVis, this.fx.ram > 0 ? (t * 14) % (Math.PI * 2) : 0, flip);
    if (ud.chassis) { ud.body.position.set(0, S.h, 0); ud.body.rotation.set(S.p, 0, S.r); }
    // wheels: roll at road speed for their own radius; the front pair steers
    this.wheelDist += this.fwdSpeed * dt;
    this.steerVis = damp(this.steerVis, this.control.steer * 0.5 * (1 - clamp(this.speed / 60, 0, 0.5)), 10, dt);
    for (const w of ud.wheels) { w.pivot.rotation.y = w.front ? this.steerVis : 0; w.spin.rotation.x = this.wheelDist / w.r; }
    ud.ice.visible = this.fx.freeze > 0; ud.net.visible = this.fx.snare > 0; ud.shield.visible = this.fx.ram > 0;
    if (ud.net.visible) ud.net.scale.setScalar(1 + Math.sin(t * 9) * 0.02);
    // molten cheese round the axles while gummed up
    if (this.fx.gum > 0 && !ud.goo) { ud.goo = cheeseGoo(ud.wheels.map((w) => w.pivot.position)); ud.chassis?.add(ud.goo); }
    if (ud.goo) { ud.goo.visible = this.fx.gum > 0; if (ud.goo.visible) ud.goo.children.forEach((g, i) => g.scale.set(1, 1 + Math.sin(t * 6 + i) * 0.12, 1)); }
  }
}

/** Resolve collision between two trucks. Returns impact info or null. */
export function collideTrucks(a, b) {
  if (Math.abs(a.y - b.y) > 2.2) return null;
  const dx = b.x - a.x, dz = b.z - a.z;
  if (dx * dx + dz * dz > 40) return null;
  const r = obbVsObb(a.obb, b.obb);
  if (!r) return null;
  const ma = a.mass * (a.fx.ram > 0 ? 5 : 1), mb = b.mass * (b.fx.ram > 0 ? 5 : 1);
  const tot = ma + mb;
  a.x += r.nx * r.depth * (mb / tot); a.z += r.nz * r.depth * (mb / tot);
  b.x -= r.nx * r.depth * (ma / tot); b.z -= r.nz * r.depth * (ma / tot);
  const rvx = a.vx - b.vx, rvz = a.vz - b.vz;
  const vn = rvx * r.nx + rvz * r.nz; // positive = approaching (a moving toward b along -n)... n points from b to a
  if (vn >= 0) return { strength: 0, nx: r.nx, nz: r.nz };
  const e = vn < -3 ? 0.45 : 0;
  const j = -(1 + e) * vn / (1 / ma + 1 / mb);
  a.vx += (j / ma) * r.nx; a.vz += (j / ma) * r.nz;
  b.vx -= (j / mb) * r.nx; b.vz -= (j / mb) * r.nz;
  // some spin
  const strength = -vn;
  if (strength > 5) { a.angVel += (Math.random() - 0.5) * strength * 0.06; b.angVel += (Math.random() - 0.5) * strength * 0.06; }
  if (strength > 2) { a.kick(r.nx, r.nz, strength * mb / tot * 2); b.kick(-r.nx, -r.nz, strength * ma / tot * 2); }
  return { strength, nx: r.nx, nz: r.nz, j };
}
