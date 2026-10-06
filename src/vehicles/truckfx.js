// Per-truck character: moving parts split out of the models (see rig.js) and little effects tied to how the truck is
// driven. All positions are in model space (forward +z, the truck's left is +x, ground at y 0).
//
//  ramenator   steaming noodle bowl, lanterns that swing with the driving
//  tsonami     swinging lanterns, the dragon breathes fire while boosting
//  fryclone    every fry jiggles in its bucket as the truck drives
//  wraptor     the dinosaur jaw snaps shut now and then
//  beef        the bull skull snorts steam
//  cream       the megaphone blares (pulses)
//  barmaggeddon  regulars on the bar stools chat and drink, and freak out when the truck gets hit
//  + exhaust stacks puff steam when a truck brakes or pulls away
import * as THREE from 'three';
import { GeoBuilder } from '../world/builder.js';
import { person } from '../world/setpieces.js';
import { RNG } from '../core/rng.js';

const LANTERN = (x, pivotX, z, y0, y1, py) => ({ box: [Math.min(x[0], x[1]), y0, z[0], Math.max(x[0], x[1]), y1, z[1]], pivot: [pivotX, py, (z[0] + z[1]) / 2] });

/**
 * Parts split out of each model (see rig.js): name -> { box (model-space AABB), pivot, mode }. 'islands' parts are
 * whole separate pieces of the model (a sausage in its bun); 'each' makes one part per piece (every fry).
 */
export const TRUCK_PARTS = {
  tsonami: {
    lanternL: LANTERN([0.45, 1.2], 0.82, [-2.9, -2.25], 0.95, 1.76, 1.78),
    lanternR: LANTERN([-1.2, -0.45], -0.67, [-2.9, -2.25], 0.95, 1.76, 1.78),
  },
  ramenator: {
    lanternL: LANTERN([0.7, 1.35], 1.03, [-2.8, -2.15], 1.0, 1.95, 1.98),
    lanternR: LANTERN([-1.35, -0.7], -0.97, [-2.8, -2.15], 1.0, 1.95, 1.98),
    bowl: { mode: 'islands', box: [-1.2, 2.25, -1.4, 1.2, 4.7, 1.3], pivot: [0, 2.3, -0.05] },
  },
  bratzilla: { sausage: { mode: 'islands', box: [-0.45, 2.55, -2.45, 0.45, 3.7, 2.45] } },
  fryclone: { fry: { mode: 'each', box: [-0.95, 1.7, -2.0, 0.95, 4.6, 1.1], minSize: [0, 1.0, 0], maxSize: [0.75, 9, 1.4] } },
  macattack: { mac: { mode: 'islands', box: [-0.95, 2.25, -2.0, 0.95, 3.9, 1.7] } },
  burrito: { burrito: { mode: 'islands', box: [-0.85, 1.85, -2.0, 0.9, 3.15, 1.7], minSize: [0.6, 0, 0], pivot: [0, 2.55, -0.15] } },
  churricane: { churros: { mode: 'islands', box: [-0.65, 2.2, -2.6, 0.65, 3.25, 2.2], pivot: [0, 2.45, -2.45] } },
  hoagie: { sandwich: { mode: 'islands', box: [-0.9, 2.15, -2.35, 0.9, 3.6, 1.75], pivot: [0, 2.2, -0.3] } },
  gyro: { gyro: { mode: 'islands', box: [-0.85, 2.05, -1.9, 0.85, 3.5, 1.4] } },
  wraptor: {
    jaw: { box: [-0.7, 2.0, 1.25, 0.7, 2.42, 2.4], pivot: [0, 2.32, 1.27] },
    head: { box: [-0.95, 2.45, 0.95, 0.95, 3.55, 2.65], pivot: [0, 2.45, 1.0] },
  },
  cream: {
    megaphone: { mode: 'islands', box: [-0.5, 2.2, 1.6, 0.5, 3.2, 2.6], pivot: [0, 2.72, 1.95] },
    cone: { mode: 'islands', box: [-0.6, 2.0, -2.9, 0.65, 3.4, -0.15], pivot: [0.05, 2.85, -0.3] },
    scoops: { mode: 'islands', box: [-0.85, 2.0, -1.1, 0.9, 3.95, 1.55], pivot: [0, 2.3, 0] },
  },
};

/** Effect anchors (model space). */
const ANCHORS = {
  ramenator: { bowl: [0, 3.25, -0.1] },
  tsonami: { mouth: [0, 2.74, 2.5] },
  beef: { nostrils: [[0.1, 1.86, 2.52], [-0.1, 1.86, 2.52]] },
  barmaggeddon: { stools: [[1.18, 0.88], [1.18, 0.19], [1.18, -0.5], [1.18, -1.19]], seatY: 0.96 },
};
const STACKS = {
  bratzilla: [[0.85, 2.3, -2.3], [-0.75, 2.3, -2.55]],
  fryclone: [[0.74, 2.3, -2.25], [-0.6, 2.3, -2.25]],
  churricane: [[0.87, 1.75, -2.36], [-0.7, 1.75, -2.36]],
  gyro: [[0.87, 1.8, -2.57], [-0.72, 1.8, -2.57]],
  macattack: [[0.79, 2.25, -2.22], [-0.67, 2.25, -2.22]],
};

const _v = new THREE.Vector3(), _d = new THREE.Vector3();

/** A swinging lantern: two damped pendulum angles driven by the truck's acceleration in its own frame. */
class Pendulum {
  constructor(obj, len = 0.55) { this.obj = obj; this.len = len; this.ax = 0; this.vx = 0; this.az = 0; this.vz = 0; }
  update(dt, accF, accL, bump) {
    const w2 = 9.8 / this.len, c = 1.6;
    // speeding up swings the lantern back (positive x rotation), a left turn (+x accel) swings it out to the right
    this.vx += (-w2 * Math.sin(this.ax) - c * this.vx + accF / this.len + bump) * dt; this.ax += this.vx * dt;
    this.vz += (-w2 * Math.sin(this.az) - c * this.vz - accL / this.len) * dt; this.az += this.vz * dt;
    this.ax = Math.max(-1.1, Math.min(1.1, this.ax)); this.az = Math.max(-1.1, Math.min(1.1, this.az));
    this.obj.rotation.set(this.ax, 0, this.az);
  }
}

/** Barmaggeddon regulars: one seated person per stool, chatting, drinking, and jumping when the truck is hit. */
class BarCrowd {
  constructor(body, rng) {
    const A = ANCHORS.barmaggeddon, mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
    this.people = A.stools.map(([x, z], i) => {
      const scale = rng.range(0.92, 1.05), b = new GeoBuilder(), look = person(b, 0, 0, 0, rng, scale, null, 'sit');
      const b2 = new GeoBuilder(); person(b2, 0, 0, 0, rng, scale, look, 'sitPanic');
      const g = new THREE.Group(); g.position.set(x, A.seatY - 0.86 * scale, z); g.rotation.y = -Math.PI / 2; // facing the bar
      const calm = new THREE.Mesh(b.build(), mat), panic = new THREE.Mesh(b2.build(), mat); panic.visible = false;
      for (const m of [calm, panic]) { m.castShadow = true; g.add(m); }
      // a pint of beer in the hand nearest the bar
      const mug = new THREE.Group();
      mug.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.2, 10), new THREE.MeshStandardMaterial({ color: 0xffb21f, roughness: 0.3, metalness: 0.1 })));
      const foam = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.05, 10), new THREE.MeshStandardMaterial({ color: 0xfff8e6, roughness: 0.9 })); foam.position.y = 0.11; mug.add(foam);
      mug.position.set(0.3 * scale, 0.95 * scale, 0.22 * scale); g.add(mug);
      body.add(g);
      return { g, calm, panic, mug, scale, base: g.position.y, phase: rng.range(0, 10), drinkAt: rng.range(1, 6), drinkT: -1, freak: 0, freakMax: 1, talkTo: i % 2 ? -1 : 1 };
    });
  }
  hit(strength) { for (const p of this.people) { const k = Math.min(1, strength / 18); p.freak = Math.max(p.freak, 0.35 + k * 0.9); p.freakMax = p.freak; p.jump = 0.1 + k * 0.45; } }
  update(dt, t) {
    for (const p of this.people) {
      const s = p.scale;
      if (p.freak > 0) {
        // freak-out: arms up, bounce off the stool, shake
        p.freak -= dt; const k = Math.max(0, p.freak / p.freakMax);
        p.calm.visible = false; p.panic.visible = true; p.mug.visible = false;
        p.g.position.y = p.base + Math.abs(Math.sin((1 - k) * Math.PI * 3)) * p.jump * k;
        p.g.rotation.z = Math.sin(t * 40 + p.phase) * 0.08 * k; p.g.rotation.y = -Math.PI / 2 + Math.sin(t * 23 + p.phase) * 0.25 * k;
        if (p.freak <= 0) { p.calm.visible = true; p.panic.visible = false; p.mug.visible = true; p.g.rotation.z = 0; p.g.position.y = p.base; }
        continue;
      }
      // chatting: turn toward the neighbour and back, a little nod
      p.g.rotation.y = -Math.PI / 2 + Math.sin(t * 0.7 + p.phase) * 0.35 * p.talkTo;
      p.g.position.y = p.base + Math.max(0, Math.sin(t * 5.5 + p.phase)) * 0.025;
      // drinking: lift the pint to the mouth and tip it
      p.drinkAt -= dt;
      if (p.drinkAt <= 0 && p.drinkT < 0) p.drinkT = 0;
      if (p.drinkT >= 0) {
        p.drinkT += dt; const k = Math.sin(Math.min(1, p.drinkT / 1.6) * Math.PI);
        p.mug.position.set((0.3 - 0.22 * k) * s, (0.95 + 0.68 * k) * s, (0.22 + 0.02 * k) * s); p.mug.rotation.x = -1.1 * k;
        p.g.rotation.x = -0.12 * k;
        if (p.drinkT > 1.6) { p.drinkT = -1; p.drinkAt = 3 + Math.random() * 6; p.g.rotation.x = 0; }
      }
    }
  }
}

export class TruckFx {
  constructor(truck, mesh, id) {
    this.truck = truck; this.id = id; this.mesh = mesh;
    const ud = mesh.userData; this.body = ud.body; this.parts = ud.parts || {};
    this.rng = new RNG((id.length * 7919 + (truck?.id ?? 0) * 104729) >>> 0);
    this.pend = ['lanternL', 'lanternR'].filter((n) => this.parts[n]).map((n) => new Pendulum(this.parts[n]));
    // fries: one little spring per fry, each a bit different
    this.fries = Object.keys(this.parts).filter((n) => /^fry\d+$/.test(n)).map((n, i) => ({ p: this.parts[n], ax: 0, vx: 0, az: 0, vz: 0, k: 70 + (i * 37) % 50, ph: i * 1.7 }));
    this.stacks = STACKS[id] || null;
    this.crowd = id === 'barmaggeddon' ? new BarCrowd(this.body, this.rng) : null;
    this.jawT = 3; this.jawPhase = -1; this.snortT = 3; this.snort = 0; this.steamT = 0; this.puff = 0; this.wasBraking = false; this.wasStopped = true;
    this.kick = 0;
  }
  /** world position of a model-space point on the (sprung) body */
  world(p) { return this.body.localToWorld(_v.set(p[0], p[1], p[2])); }
  /** fx: the game's particles; soft (optional): translucent billboard puffs for steam and smoke */
  update(dt, t, fx, near, soft = null) {
    const puffs = soft || fx;
    const tr = this.truck || {}, c = tr.control || {}, S = tr.susp || { acc: 0, hv: 0 };
    const speed = tr.speed || 0, fwd = tr.fwdSpeed || 0;
    if (near && fx) this.body.updateWorldMatrix(true, false);
    // swinging lanterns
    const accL = (tr.angVel || 0) * fwd;
    for (const p of this.pend) p.update(dt, S.acc || 0, accL, (S.hv || 0) * 2);
    // fries jiggle in the bucket (only those sitting in it: not one flying off as a missile or growing back)
    if (this.fries.length && dt > 0) {
      const aF = S.acc || 0, bump = (S.hv || 0) * 3 + (speed > 4 ? Math.sin(t * 23) * speed * 0.004 : 0);
      for (const f of this.fries) {
        if (f.p.parent !== this.body || f.p.scale.x < 0.99) continue;
        f.vx += (-f.k * f.ax - 5 * f.vx + aF * 0.035 + bump * Math.cos(f.ph)) * dt; f.ax += f.vx * dt;
        f.vz += (-f.k * f.az - 5 * f.vz - accL * 0.03 + bump * Math.sin(f.ph)) * dt; f.az += f.vz * dt;
        // a few centimetres at the rim at most: never through the bucket walls
        f.ax = Math.max(-0.04, Math.min(0.04, f.ax)); f.az = Math.max(-0.04, Math.min(0.04, f.az));
        f.p.rotation.set(f.ax, 0, f.az);
      }
    }
    // dinosaur jaw: snap shut, hold, ease open
    if (this.parts.jaw) {
      this.jawT -= dt;
      if (this.jawT <= 0 && this.jawPhase < 0) this.jawPhase = 0;
      if (this.jawPhase >= 0) {
        this.jawPhase += dt; const ph = this.jawPhase;
        const a = ph < 0.07 ? ph / 0.07 : ph < 0.22 ? 1 : Math.max(0, 1 - (ph - 0.22) / 0.35);
        this.parts.jaw.rotation.x = -0.42 * a;
        if (ph > 0.6) { this.jawPhase = -1; this.jawT = this.rng.range(2.5, 6.5); if (near && fx && this.rng.chance(0.5)) { const w = this.world([0, 2.3, 2.2]); fx.sparks(w.x, w.y, w.z, 4, 0xffffff); } }
      }
    }
    // megaphone blares: three quick pulses, then a pause
    if (this.parts.megaphone) {
      const ph = t % 2.6, k = ph < 1.05 ? Math.max(0, Math.sin((ph % 0.35) / 0.35 * Math.PI)) : 0;
      this.parts.megaphone.scale.setScalar(1 - 0.16 * k);
    }
    // seated regulars
    if (this.crowd) {
      if (this.kick > 0) { this.crowd.hit(this.kick); this.kick = 0; }
      this.crowd.update(dt, t);
    } else this.kick = 0;
    if (!near || !fx) return;
    // ramen bowl steam
    if (this.id === 'ramenator') {
      this.steamT -= dt;
      if (this.steamT <= 0) {
        this.steamT = 0.07;
        const a = Math.random() * Math.PI * 2, r = Math.random() * 0.75, A = ANCHORS.ramenator.bowl, w = this.world([A[0] + Math.cos(a) * r, A[1], A[2] + Math.sin(a) * r]);
        puffs.emit(1, (q) => { q.alpha = 0.6; q.x = w.x; q.y = w.y; q.z = w.z; q.vx = tr.vx * 0.6 || 0; q.vz = tr.vz * 0.6 || 0; q.vy = 1.0 + Math.random() * 0.8; q.g = -0.6; q.drag = 1.5; q.size = 0.1; q.grow = 0.55; q.life = 1.0; q.color = 0xffffff; q.spin = 1; });
      }
    }
    // dragon fire while boosting
    if (this.id === 'tsonami' && (tr.turboTime || 0) > 0) {
      const m = this.world(ANCHORS.tsonami.mouth), f = _d.set(0, -0.12, 1).transformDirection(this.body.matrixWorld);
      fx.emit(5, (q) => {
        q.x = m.x; q.y = m.y; q.z = m.z; const sp = 12 + Math.random() * 7;
        q.vx = f.x * sp + (tr.vx || 0) + (Math.random() - 0.5) * 2.5; q.vy = f.y * sp + (Math.random() - 0.2) * 2; q.vz = f.z * sp + (tr.vz || 0) + (Math.random() - 0.5) * 2.5;
        q.g = -3; q.drag = 2.4; q.size = 0.16; q.grow = 1.9; q.life = 0.26 + Math.random() * 0.14; q.spin = 6;
        q.color = [0xff3d1f, 0xff8a1f, 0xffc23a, 0xfff1a0][Math.floor(Math.random() * 4)];
      });
    }
    // bull skull snorts
    if (this.id === 'beef') {
      this.snortT -= dt;
      if (this.snortT <= 0 && this.snort <= 0) { this.snort = 0.35; this.snortT = this.rng.range(2.5, 6); }
      if (this.snort > 0) {
        this.snort -= dt;
        const f = _d.set(0, -0.35, 1).normalize().transformDirection(this.body.matrixWorld);
        for (const n of ANCHORS.beef.nostrils) {
          const w = this.world(n);
          puffs.emit(1, (q) => { q.alpha = 0.7; q.x = w.x; q.y = w.y; q.z = w.z; q.vx = f.x * 4 + (tr.vx || 0) * 0.8; q.vy = f.y * 4 + 0.6; q.vz = f.z * 4 + (tr.vz || 0) * 0.8; q.g = -0.5; q.drag = 3; q.size = 0.14; q.grow = 0.9; q.life = 0.55; q.color = 0xf6f6f6; q.spin = 2; });
        }
      }
    }
    // exhaust stacks: a burst of steam when the truck brakes hard or pulls away from a stop
    if (this.stacks) {
      const braking = (c.throttle || 0) < -0.3 && fwd > 6, stopped = speed < 2.5;
      if (braking && !this.wasBraking) this.puff = 0.45;
      if (!stopped && this.wasStopped && (c.throttle || 0) > 0.3) this.puff = 0.6;
      this.wasBraking = braking; this.wasStopped = stopped || (this.wasStopped && speed < 5);
      if (this.puff > 0) {
        this.puff -= dt;
        for (const sPos of this.stacks) {
          if (Math.random() < 0.55) continue;
          const w = this.world(sPos);
          puffs.emit(1, (q) => { q.alpha = 0.7; q.x = w.x; q.y = w.y + 0.1; q.z = w.z; q.vx = (tr.vx || 0) * 0.5 + (Math.random() - 0.5); q.vz = (tr.vz || 0) * 0.5 + (Math.random() - 0.5); q.vy = 3 + Math.random() * 2; q.g = -0.4; q.drag = 2; q.size = 0.22; q.grow = 1.4; q.life = 0.9; q.color = 0xeeeeee; q.spin = 1.5; });
        }
      }
    }
  }
}

/** Effects controller for a truck mesh, or null when the truck has nothing special. */
export function createTruckFx(truck, mesh, id) {
  if (!mesh.userData.body) return null;
  const has = TRUCK_PARTS[id] || ANCHORS[id] || STACKS[id];
  return has ? new TruckFx(truck, mesh, id) : null;
}
