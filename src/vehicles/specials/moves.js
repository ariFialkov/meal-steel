// The 28 special moves, a light and a heavy one per truck. Each move is { parts, bot(sys, tr), start(sys, tr, done) }:
// start sets up its animation as tasks on the SpecialSystem and calls done() when the truck's parts are free again.
// All effects on other trucks go through sys.hit (see system.js). Model-space positions: forward +z, left +x.
import * as THREE from 'three';
import * as A from './assets.js';
import { RNG } from '../../core/rng.js';

const rng = new RNG(90210);
const smooth = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const FIRE = [0xff3d1f, 0xff7a1f, 0xffb02a, 0xffe08a];
const FLAME = [0xb8220c, 0xd9360f, 0xe0521a, 0xc9420e]; // deep reds: an additive plume of many puffs adds up to orange, not white

// ------------------------------------------------------------------ effect helpers
/** soft billowing smoke (translucent billboards) */
function softSmoke(sys, x, y, z, n, color, size = 0.8, rise = 2.5) {
  sys.soft.emit(n, (q) => { q.x = x + (Math.random() - 0.5) * size; q.y = y + (Math.random() - 0.5) * size * 0.5; q.z = z + (Math.random() - 0.5) * size; q.vx = (Math.random() - 0.5) * 2.5; q.vz = (Math.random() - 0.5) * 2.5; q.vy = rise * (0.6 + Math.random() * 0.8); q.drag = 1.2; q.size = size * (0.8 + Math.random() * 0.5); q.grow = size * 1.6; q.life = 0.9 + Math.random() * 0.7; q.g = 0; q.color = color; q.spin = (Math.random() - 0.5) * 2; });
}
/** a ground-hugging dust shockwave */
function softRing(sys, x, y, z, color, radius = 6, n = 28) {
  sys.soft.emit(n, (q, k) => { const a = (k / n) * 6.28 + Math.random() * 0.2; q.x = x + Math.cos(a) * 1.2; q.y = y + 0.2; q.z = z + Math.sin(a) * 1.2; q.vx = Math.cos(a) * radius * 2; q.vz = Math.sin(a) * radius * 2; q.vy = 0.8; q.g = 0; q.drag = 2.6; q.size = 0.7; q.grow = 1.6; q.life = 0.75 + Math.random() * 0.25; q.color = color; q.alpha = 0.7; q.spin = 1; });
}
function fireball(sys, x, y, z, scale = 1) {
  if (!sys.near(x, z)) return;
  sys.glow.emit(Math.round(26 * scale), (q) => { const a = Math.random() * 6.28, e = Math.random() * 1.2, s = (4 + Math.random() * 8) * scale; q.x = x; q.y = y; q.z = z; q.vx = Math.cos(a) * Math.cos(e) * s; q.vz = Math.sin(a) * Math.cos(e) * s; q.vy = Math.sin(e) * s + 2; q.g = 2; q.drag = 3; q.size = 0.5 * scale; q.grow = 2.2 * scale; q.life = 0.45 + Math.random() * 0.25; q.color = pick(FIRE); });
  softSmoke(sys, x, y + 0.5, z, Math.round(12 * scale), 0x3a3633, 1.2 * scale, 3);
  sys.fx.debris(x, y, z, Math.round(10 * scale), 0x4a3b30);
  softRing(sys, x, Math.max(0.3, y - 1), z, 0x8a7a68, 5 * scale, Math.round(22 * Math.min(1.5, scale)));
}
function splashAt(sys, x, y, z, color, n = 16, up = 6, size = 0.28) {
  if (!sys.near(x, z)) return;
  sys.fx.emit(n, (q) => { const a = Math.random() * 6.28, s = 2 + Math.random() * 6; q.x = x; q.y = y; q.z = z; q.vx = Math.cos(a) * s; q.vz = Math.sin(a) * s; q.vy = up * (0.5 + Math.random()); q.size = size * (0.6 + Math.random() * 0.8); q.life = 0.6 + Math.random() * 0.4; q.color = color; q.spin = 3; });
}
function sparkle(sys, x, y, z) {
  if (!sys.near(x, z)) return;
  const cols = [0xff3b3b, 0xffd23f, 0x3aff8a, 0x3aa9ff, 0xff5fa2, 0xffffff];
  sys.glow.emit(34, (q) => { const a = Math.random() * 6.28, e = Math.random() * 1.4 - 0.2, s = 6 + Math.random() * 10; q.x = x; q.y = y; q.z = z; q.vx = Math.cos(a) * Math.cos(e) * s; q.vz = Math.sin(a) * Math.cos(e) * s; q.vy = Math.sin(e) * s; q.g = 9; q.drag = 2; q.size = 0.12; q.life = 0.5 + Math.random() * 0.4; q.color = pick(cols); });
  for (let k = 0; k < 4; k++) sys.after(0.06 + k * 0.09, () => sys.glow.emit(1, (q) => { q.x = x + (Math.random() - 0.5) * 1.6; q.y = y + Math.random(); q.z = z + (Math.random() - 0.5) * 1.6; q.size = 0.6; q.grow = 3; q.life = 0.12; q.g = 0; q.color = 0xfff1c0; }));
  softSmoke(sys, x, y, z, 4, 0x8a8a8a, 0.5, 1.5);
}
function emitStream(sys, from, dir, speed, color, n, size = 0.22, spread = 0.12, g = 14, base = null) {
  sys.fx.emit(n, (q) => {
    q.x = from.x; q.y = from.y; q.z = from.z;
    q.vx = (dir.x + (Math.random() - 0.5) * spread) * speed + (base?.vx || 0); q.vy = (dir.y + (Math.random() - 0.5) * spread) * speed; q.vz = (dir.z + (Math.random() - 0.5) * spread) * speed + (base?.vz || 0);
    q.g = g; q.size = size * (0.7 + Math.random() * 0.6); q.life = 0.7 + Math.random() * 0.3; q.color = Array.isArray(color) ? pick(color) : color; q.spin = 2;
  });
}
/** launch velocity to land on (tx, ty, tz) after time T from (x, y, z) under gravity g */
function lob(x, y, z, tx, ty, tz, T, g) { return [(tx - x) / T, (ty - y) / T + 0.5 * g * T, (tz - z) / T]; }
/** where a truck will be in `dt` seconds */
const lead = (v, dt) => [v.x + v.vx * dt, v.z + v.vz * dt];
const fwdOf = (tr) => [Math.sin(tr.heading), Math.cos(tr.heading)];

// ------------------------------------------------------------------ cooks at a door or window
// openings on the truck: back door, left (+x) and right (-x) serving windows
const OPENINGS = { back: { p: [0, 0.55, -2.85], yaw: Math.PI }, left: { p: [1.32, 0.85, -0.45], yaw: Math.PI / 2 }, right: { p: [-1.32, 0.85, -0.45], yaw: -Math.PI / 2 } };
function crew(sys, tr, opening, liquid = null, count = 2) {
  const o = OPENINGS[opening], g = new THREE.Group();
  g.position.set(o.p[0], o.p[1], o.p[2]); g.rotation.y = o.yaw; g.scale.set(1, 0.01, 1);
  const cooks = [];
  for (let k = 0; k < count; k++) { const c = A.cook(rng); c.scale.setScalar(0.82); c.position.set(count === 1 ? 0 : (k ? 0.5 : -0.5), -0.15, -0.35); g.add(c); cooks.push(c); }
  let vat = null; if (liquid !== null) { vat = A.vat(liquid); vat.position.set(0, 0.75, 0.05); g.add(vat); }
  tr.mesh.userData.body.add(g);
  return { g, cooks, vat, out: o };
}
const armsUp = (c, up) => { c.userData.calm.visible = !up; c.userData.up.visible = up; };

/**
 * Two cooks pop up at a door / window with a vat, tip it out and pour (onPour(worldLip, outwardDir) once, pour colour
 * streams for 0.7 s), then duck back in.
 */
function vatDump(sys, tr, opening, liquid, onPour, done) {
  const c = crew(sys, tr, opening, liquid);
  let fired = false;
  sys.task(() => (dt, t, age) => {
    const k = age;
    c.g.scale.y = smooth(k / 0.25) * (1 - smooth((k - 1.55) / 0.25)) + 0.01;
    const tip = smooth((k - 0.3) / 0.3) * (1 - smooth((k - 1.25) / 0.3));
    c.vat.rotation.x = tip * 1.9; c.vat.position.set(0, 0.75 + tip * 0.45, 0.05 + tip * 0.35);
    for (const ck of c.cooks) armsUp(ck, tip > 0.2);
    if (tip > 0.6) {
      const lip = sys.worldPoint(tr, [c.out.p[0] + Math.sin(c.out.yaw) * 0.9, c.out.p[1] + 1.4, c.out.p[2] + Math.cos(c.out.yaw) * 0.9], _a);
      const out = sys.worldDir(tr, [Math.sin(c.out.yaw), -0.2, Math.cos(c.out.yaw)], _b).normalize();
      if (sys.near(lip.x, lip.z)) emitStream(sys, lip, out, 4, [liquid, liquid, 0xffffff], 2, 0.2, 0.3, 16, tr);
      if (!fired) { fired = true; onPour(lip.clone(), out.clone()); }
    }
    if (k > 1.85) { c.g.removeFromParent(); done(); return false; }
    return true;
  });
}

/** a liquid puddle hazard that spreads in over half a second */
function puddleHazard(sys, x, z, color, r, life, owner, onEnter) {
  const obj = A.puddle(color, 0.01, Math.floor(Math.random() * 6) + 1);
  obj.position.set(x, sys.groundY(x, z) + 0.03, z);
  return sys.addHazard({ obj, x, z, r, life, owner, every: 0.8, onEnter, update: (dt, t, h) => { const k = Math.min(1, h.age / 0.5), fade = h.life - h.age < 1 ? (h.life - h.age) : 1; obj.scale.setScalar(Math.max(0.01, r * (0.3 + 0.7 * k) * fade)); } });
}

// ------------------------------------------------------------------ the moves
const nearOrFront = (range, half = 0.6) => (sys, tr) => sys.enemies(tr).some((v) => sys.inFront(tr, v, range, half));
const anyNear = (range) => (sys, tr) => !!sys.nearest(tr, range);
const anyBehind = (range) => (sys, tr) => sys.enemies(tr).some((v) => sys.behind(tr, v, range));

export const MOVES = {
  // ================================================================ BRATZILLA
  bratzilla: {
    light: { // Grease Dump: cooks tip hot dog grease out the back (or the side toward the nearest truck): slick patch
      bot: anyBehind(16),
      start(sys, tr, done) {
        const v = sys.nearest(tr, 14), side = v ? sys.sideOf(tr, v.x, v.z) : 'back';
        vatDump(sys, tr, side === 'left' || side === 'right' ? side : 'back', 0xc98a1a, (lip, out) => {
          const x = lip.x + out.x * 3, z = lip.z + out.z * 3;
          puddleHazard(sys, x, z, 0xb7791f, 3.4, 9, tr, (vic) => { sys.hit(tr, vic, { kind: 'grease', slick: 2.4, spin: 0.6, dmg: 4, award: 10 }); });
        }, done);
      },
    },
    heavy: { // Glizzy Gun: the sausage fires out of the bun and slams the truck ahead (side-on and high: rolls it)
      parts: ['sausage'], bot: nearOrFront(40, 0.35),
      start(sys, tr, done) {
        const s = sys.part(tr, 'sausage');
        if (!s) { done(); return; }
        const rest = s.position.clone();
        sys.task(() => (dt, t, age) => {
          // wind up: the sausage draws back in the bun and quivers
          if (age < 0.45) { s.position.set(rest.x + Math.sin(age * 80) * 0.03, rest.y + 0.05, rest.z - smooth(age / 0.45) * 0.5); return true; }
          s.position.copy(rest);
          const obj = sys.detach(s), [fx, fz] = fwdOf(tr), sp = 58;
          fireball(sys, obj.position.x + fx * 2.5, obj.position.y, obj.position.z + fz * 2.5, 0.35);
          sys.addProjectile({ obj, x: obj.position.x + fx * 1.0, y: obj.position.y, z: obj.position.z + fz * 1.0, vx: fx * sp + tr.vx, vy: 1.2, vz: fz * sp + tr.vz, g: 4, life: 1.6, r: 0.8, owner: tr, keep: true,
            trail: (p) => { if (sys.near(p.x, p.z)) sys.soft.emit(1, (q) => { q.x = p.x; q.y = p.y; q.z = p.z; q.size = 0.25; q.grow = 0.8; q.life = 0.4; q.g = -1; q.color = 0xd9b48a; }); },
            onHit: (v, p) => { const d = Math.hypot(p.vx, p.vz); sys.hit(tr, v, { kind: 'glizzy', dmg: 32, push: [p.vx / d * 26, p.vz / d * 26, 5], knock: p.y > v.y + 1.6 ? 'side' : false, award: 30, label: 'GLIZZY GUN!' }); splashAt(sys, p.x, p.y, p.z, 0xc8452c, 18); sys.shake(p.x, p.z, 0.8); },
            onEnd: (p) => { splashAt(sys, p.x, p.y, p.z, 0xe9b96e, 10); sys.regrow(tr, s, 1.6); } });
          done(); return false;
        });
      },
    },
  },

  // ================================================================ FRYCLONE
  fryclone: {
    light: { // Oil Spill: cooks dump fry oil out of the door/window facing the nearest truck, onto it: blinded and burned
      bot: anyNear(10),
      start(sys, tr, done) {
        const v = sys.nearest(tr, 14), side = v ? sys.sideOf(tr, v.x, v.z) : 'back';
        const opening = side === 'left' || side === 'right' ? side : 'back';
        vatDump(sys, tr, opening, 0xd9a21a, (lip, out) => {
          // a heavy slosh arcs onto the target
          const tgt = v && sys.dist(tr, v) < 11 ? v : null, tx = tgt ? tgt.x : lip.x + out.x * 5, tz = tgt ? tgt.z : lip.z + out.z * 5;
          if (sys.near(lip.x, lip.z)) for (let k = 0; k < 26; k++) sys.fx.emit(1, (q) => { const T = 0.45 + Math.random() * 0.2; const [vx, vy, vz] = lob(lip.x, lip.y, lip.z, tx + (Math.random() - 0.5) * 2, 2.5, tz + (Math.random() - 0.5) * 2, T, 18); q.x = lip.x; q.y = lip.y; q.z = lip.z; q.vx = vx; q.vy = vy; q.vz = vz; q.g = 18; q.size = 0.24; q.life = T + 0.2; q.color = pick([0xd9a21a, 0xb8860b, 0xffe08a]); });
          sys.after(0.45, () => {
            if (tgt && sys.dist(tr, tgt) < 13) sys.hit(tr, tgt, { kind: 'oil', dmg: 14, blind: { kind: 'oil', secs: 2.6 }, slick: 1.2, award: 20, label: 'OIL SPILL!' });
            puddleHazard(sys, tx, tz, 0xb8860b, 2.4, 6, tr, (vic) => sys.hit(tr, vic, { kind: 'oil', slick: 1.5, award: 0 }));
          });
        }, done);
      },
    },
    heavy: { // Shoestring Missiles: five fries blink red, then launch one by one on ballistic arcs at different trucks
      parts: ['fry'], bot: anyNear(45),
      start(sys, tr, done) {
        const parts = tr.mesh.userData.parts || {}, fries = Object.keys(parts).filter((n) => /^fry\d+$/.test(n)).map((n) => parts[n]);
        if (!fries.length) { done(); return; }
        const chosen = []; for (let k = 0; k < 5; k++) chosen.push(fries[Math.floor(((k + 0.5) / 5) * fries.length)]);
        // each fry gets its own material so it can blink
        const mats = chosen.map((f) => { const m = f.children[0].material; const c = m.clone(); c.emissive = new THREE.Color(0xff1a1a); f.children[0].material = c; f.userData.origMat = m; return c; });
        const targets = sys.enemies(tr).sort((a, b) => sys.dist(tr, a) - sys.dist(tr, b)).filter((v) => sys.dist(tr, v) < 60).slice(0, 5);
        let launched = 0;
        sys.task(() => (dt, t, age) => {
          for (let k = launched; k < chosen.length; k++) mats[k].emissiveIntensity = (Math.sin(age * 18) > 0 ? 0.9 : 0.05) * Math.min(1, age * 2);
          const due = age < 1.1 ? 0 : Math.min(chosen.length, 1 + Math.floor((age - 1.1) / 0.32));
          while (launched < due) {
            const f = chosen[launched], m = mats[launched], tgt = targets.length ? targets[launched % targets.length] : null; launched++;
            m.emissiveIntensity = 0.6;
            const obj = sys.detach(f), p0 = obj.position.clone();
            f.children[0].rotation.x = Math.PI / 2; // nose first: the fry's length along its flight
            const T = 1.3 + Math.random() * 0.3, [fx, fz] = fwdOf(tr);
            const [tx, tz] = tgt ? lead(tgt, T * 0.8) : [tr.x + fx * 30 + (Math.random() - 0.5) * 10, tr.z + fz * 30 + (Math.random() - 0.5) * 10];
            const [vx, vy, vz] = lob(p0.x, p0.y, p0.z, tx, sys.groundY(tx, tz) + 1.2, tz, T, 16);
            sys.addProjectile({ obj, x: p0.x, y: p0.y, z: p0.z, vx, vy, vz, g: 16, life: T + 0.6, r: 0.9, owner: tr, keep: true, face: true,
              trail: (p) => { if (!sys.near(p.x, p.z)) return; sys.glow.emit(2, (q) => { q.x = p.x - p.vx * 0.02; q.y = p.y - p.vy * 0.02; q.z = p.z - p.vz * 0.02; q.size = 0.22; q.grow = 0.8; q.life = 0.18; q.g = 0; q.color = pick(FIRE); }); sys.soft.emit(1, (q) => { q.x = p.x; q.y = p.y; q.z = p.z; q.size = 0.2; q.grow = 1.4; q.life = 0.7; q.g = -1; q.color = 0x9a9a9a; }); },
              onHit: (v, p) => { sys.hit(tr, v, { kind: 'missile', dmg: 26, push: [p.vx * 0.35, p.vz * 0.35, 6], knock: 'side', award: 25, label: 'DIRECT HIT!' }); },
              onEnd: (p) => {
                fireball(sys, p.x, p.y, p.z, 0.8); sys.shake(p.x, p.z, 0.6); sys.audio.thud?.();
                for (const v of sys.enemies(tr)) { const d = Math.hypot(v.x - p.x, v.z - p.z); if (d < 4.5 && !p.hits.has(v)) sys.hit(tr, v, { kind: 'blast', dmg: 9 * (1 - d / 4.5) + 3, push: [(v.x - p.x) / (d || 1) * 10, (v.z - p.z) / (d || 1) * 10, 4], award: 8 }); }
                f.children[0].material = f.userData.origMat; f.children[0].rotation.x = 0; sys.regrow(tr, f, 2.5 + Math.random());
              } });
          }
          if (launched >= chosen.length) { done(); return false; }
          return true;
        });
      },
    },
  },

  // ================================================================ MAC ATTACK
  macattack: {
    light: { // Cheese Slick: a vat of molten cheese out the back; trucks through it gum up for 6 s
      bot: anyBehind(16),
      start(sys, tr, done) {
        vatDump(sys, tr, 'back', 0xffa51f, (lip, out) => {
          puddleHazard(sys, lip.x + out.x * 3, lip.z + out.z * 3, 0xffa51f, 3.6, 10, tr, (vic) => sys.hit(tr, vic, { kind: 'cheese', gum: 6, dmg: 3, award: 12, label: 'GUMMED UP!' }));
        }, done);
      },
    },
    heavy: { // Howhizzer: the mac sinks, a .50 cal cheese-whiz cannon rises, takes aim and fires ten rounds
      parts: ['mac'], bot: nearOrFront(38, 0.6),
      start(sys, tr, done) {
        const mac = sys.part(tr, 'mac'), body = tr.mesh.userData.body;
        const gun = A.cheeseCannon(); gun.position.set(0, 1.55, -0.1); gun.scale.setScalar(1.1); body.add(gun);
        const macRest = mac ? mac.position.clone() : null;
        let shots = 0, target = null;
        sys.task(() => (dt, t, age) => {
          const up = smooth(age / 0.7) * (1 - smooth((age - 3.4) / 0.6));
          if (mac) { mac.position.set(macRest.x, macRest.y - up * 1.15, macRest.z); mac.scale.set(1, 1 - up * 0.6, 1); }
          gun.position.y = 1.55 + up * 0.85;
          // aim: the nearest truck in front, else straight ahead
          if (age > 0.6) {
            target = sys.nearest(tr, 45, (v) => sys.inFront(tr, v, 45, 1.0));
            let yaw = 0, pitch = 0;
            if (target) { const a = Math.atan2(target.x - tr.x, target.z - tr.z); yaw = Math.max(-1, Math.min(1, ((a - tr.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI)); pitch = -Math.atan2(1.2, sys.dist(tr, target)); }
            gun.userData.yoke.rotation.y += (yaw - gun.userData.yoke.rotation.y) * Math.min(1, dt * 8);
            gun.userData.yoke.rotation.x += (pitch - gun.userData.yoke.rotation.x) * Math.min(1, dt * 8);
          }
          const due = age < 1.0 ? 0 : Math.min(10, 1 + Math.floor((age - 1.0) / 0.2));
          while (shots < due) {
            shots++;
            gun.updateWorldMatrix(true, true);
            const muzzle = gun.userData.yoke.localToWorld(_a.copy(gun.userData.muzzle)), dir = _b.set(0, 0, 1).transformDirection(gun.userData.yoke.matrixWorld);
            sys.glow.emit(6, (q) => { q.x = muzzle.x; q.y = muzzle.y; q.z = muzzle.z; q.vx = dir.x * 8 + (Math.random() - 0.5) * 3; q.vy = dir.y * 8 + (Math.random() - 0.5) * 3; q.vz = dir.z * 8 + (Math.random() - 0.5) * 3; q.size = 0.3; q.grow = 1.5; q.life = 0.1; q.g = 0; q.color = pick([0xffe08a, 0xffb02a]); });
            gun.userData.yoke.position.z = -0.12; // recoil
            const obj = A.whizGlob(), sp = 70;
            sys.addProjectile({ obj, x: muzzle.x, y: muzzle.y, z: muzzle.z, vx: dir.x * sp + tr.vx, vy: dir.y * sp + 1, vz: dir.z * sp + tr.vz, g: 6, life: 1.0, r: 0.7, owner: tr, face: true,
              onHit: (v) => { v._whiz = (v._whiz || 0) + 1; sys.hit(tr, v, { kind: 'whiz', dmg: 5, push: [dir.x * 4, dir.z * 4, 0], blind: { kind: 'cheese', secs: 2.5, amount: 0.6 + Math.min(2.4, v._whiz * 0.3) }, award: 4 }); splashAt(sys, v.x, v.y + 2, v.z, 0xffa51f, 10, 4); sys.after(4, () => { v._whiz = Math.max(0, (v._whiz || 1) - 1); }); },
              onEnd: (p) => splashAt(sys, p.x, p.y, p.z, 0xffa51f, 6, 3) });
          }
          gun.userData.yoke.position.z *= Math.exp(-dt * 12);
          if (age > 4.05) { gun.removeFromParent(); if (mac) { mac.position.copy(macRest); mac.scale.set(1, 1, 1); } done(); return false; }
          return true;
        });
      },
    },
  },

  // ================================================================ BURRITO BANDITO
  burrito: {
    light: { // Resurractus: seven cacti rise out of the ground around the truck; crash into one and it hurts
      bot: anyNear(12),
      start(sys, tr, done) {
        const cx = tr.x, cz = tr.z;
        for (let k = 0; k < 7; k++) {
          const a = tr.heading + Math.PI + (k - 3) * 0.52, R = 7.5 + (k % 2) * 1.5, x = cx + Math.sin(a) * R, z = cz + Math.cos(a) * R, gy = sys.groundY(x, z);
          const obj = A.cactus(k); obj.rotation.y = Math.random() * 6.28; obj.position.set(x, gy - 3.4, z);
          sys.after(k * 0.08, () => {
            sys.fx.debris(x, gy + 0.3, z, 12, 0x8c6d45);
            sys.addHazard({ obj, x, z, r: 0.55, life: 12, owner: tr, solid: true, every: 9,
              update: (dt, t, h) => { const k2 = smooth(h.age / 0.8), out = h.life - h.age < 0.8 ? smooth((h.life - h.age) / 0.8) : 1; obj.position.y = gy - 3.4 + 3.4 * Math.min(k2, out) + Math.sin(h.age * 30) * 0.02 * (1 - k2); },
              onEnter: (v, h) => {
                if (v.speed < 3 || h.age < 0.6) { h.last.delete(v); return; }
                sys.hit(tr, v, { kind: 'cactus', dmg: 10, spin: 0.5, award: 8, label: 'CACTUS!' });
                sys.fx.debris(x, gy + 1.5, z, 18, 0x3f8f3a); splashAt(sys, x, gy + 1.5, z, 0x2c6e2a, 10); h.dead = true;
              } });
          });
        }
        done();
      },
    },
    heavy: { // Burrito Roll: the burrito swings sideways, springs off the roof and rolls forward through everything
      parts: ['burrito'], bot: nearOrFront(36, 0.45),
      start(sys, tr, done) {
        const b = sys.part(tr, 'burrito');
        if (!b) { done(); return; }
        sys.task(() => (dt, t, age) => {
          if (age < 0.4) { b.rotation.y = smooth(age / 0.4) * Math.PI / 2; return true; }
          if (age < 0.6) { b.position.y = (b.userData.rest?.[1] ?? 2.6) - 0.12 * smooth((age - 0.4) / 0.2); return true; } // spring loads
          b.rotation.y = Math.PI / 2;
          const obj = sys.detach(b), [fx, fz] = fwdOf(tr), ax = [Math.cos(tr.heading), -Math.sin(tr.heading)];
          softRing(sys, obj.position.x, obj.position.y - 0.4, obj.position.z, 0xf3e3c3, 3, 18);
          const roll = { a: 0 };
          sys.addProjectile({ obj, x: obj.position.x + fx * 2, y: obj.position.y + 0.3, z: obj.position.z + fz * 2, vx: fx * 30 + tr.vx, vy: 6, vz: fz * 30 + tr.vz, g: 24, drag: 0.25, life: 5.5, r: 1.6, owner: tr, keep: true, pierce: true, groundR: 0.5,
            onGround: (p) => { if (p.vy < -4) { sys.fx.debris(p.x, p.y, p.z, 8, 0x8c6d45); p.vy = -p.vy * 0.25; } else p.vy = 0; return Math.hypot(p.vx, p.vz) < 4; },
            trail: (p, dt2) => { const sp = Math.hypot(p.vx, p.vz); roll.a += sp * dt2 / 0.5; obj.rotation.set(0, Math.atan2(ax[0], ax[1]), 0); obj.rotateOnAxis(_c.set(0, 0, 1), -roll.a); if (sys.near(p.x, p.z) && Math.random() < 0.4) sys.soft.emit(1, (q) => { q.x = p.x; q.y = 0.3; q.z = p.z; q.size = 0.3; q.grow = 1; q.life = 0.5; q.g = -1; q.color = 0xb59a78; }); },
            onHit: (v, p) => { const sp = Math.hypot(p.vx, p.vz) || 1; sys.hit(tr, v, { kind: 'roll', dmg: 30, push: [p.vx / sp * 24, p.vz / sp * 24, 5], knock: 'side', award: 30, label: 'BURRITO ROLL!' }); splashAt(sys, v.x, v.y + 1.5, v.z, 0xf9e4b7, 14); p.vx *= 0.8; p.vz *= 0.8; sys.shake(v.x, v.z, 0.7); return false; },
            onEnd: (p) => { splashAt(sys, p.x, p.y, p.z, 0xc8452c, 18); splashAt(sys, p.x, p.y, p.z, 0xf9e4b7, 12); sys.regrow(tr, b, 1.2); } });
          done(); return false;
        });
      },
    },
  },

  // ================================================================ RAMENATOR
  ramenator: {
    light: { // Noodle Net: a woven noodle net flies out the front; the truck it hits is dragged to a halt and held
      bot: nearOrFront(32, 0.4),
      start(sys, tr, done) {
        const net = A.noodleNet(false), [fx, fz] = fwdOf(tr), p0 = sys.worldPoint(tr, [0, 1.6, 2.9]);
        net.scale.setScalar(0.25);
        sys.addProjectile({ obj: net, x: p0.x, y: p0.y, z: p0.z, vx: fx * 46 + tr.vx, vy: 0.5, vz: fz * 46 + tr.vz, g: 2, life: 1.3, r: 1.6, owner: tr,
          trail: (p) => { const k = Math.min(1, p.age / 0.3); net.scale.setScalar(0.25 + 0.75 * k); net.rotation.set(0, Math.atan2(p.vx, p.vz), Math.sin(p.age * 8) * 0.15); },
          onHit: (v) => { sys.hit(tr, v, { kind: 'net', snare: 2.6, dmg: 6, award: 15, label: 'NETTED!' }); } });
        done();
      },
    },
    heavy: { // Drop the Soup: the bowl tips toward the nearest truck and drenches it in broth
      parts: ['bowl'], bot: anyNear(13),
      start(sys, tr, done) {
        const bowl = sys.part(tr, 'bowl');
        const v = sys.nearest(tr, 18);
        const ang = v ? Math.atan2(v.x - tr.x, v.z - tr.z) - tr.heading : 0; // direction to pour, in truck space
        const dl = [Math.sin(ang), Math.cos(ang)];
        let poured = false;
        sys.task(() => (dt, t, age) => {
          const tip = smooth(age / 0.45) * (1 - smooth((age - 1.6) / 0.5));
          if (bowl) {
            // tip over the rim on the pouring side, so the bowl rolls up onto its edge instead of sinking into the roof
            const rest = bowl.userData.rest || [0, 2.3, -0.05], bb = bowl.userData.bbox, R = bb ? (bb[3] - bb[0]) * 0.32 : 0.75;
            bowl.rotation.set(dl[1] * tip * 1.15, 0, -dl[0] * tip * 1.15);
            const e = _c.set(dl[0] * R, 0, dl[1] * R), e2 = _a.copy(e).applyEuler(bowl.rotation);
            bowl.position.set(rest[0] + e.x - e2.x, rest[1] + e.y - e2.y + tip * 0.15, rest[2] + e.z - e2.z);
          }
          if (tip > 0.7 && age < 1.5) {
            const lip = sys.worldPoint(tr, [dl[0] * 1.3, 3.0, dl[1] * 1.3], _a), dir = sys.worldDir(tr, [dl[0], 0.25, dl[1]], _b).normalize();
            if (sys.near(lip.x, lip.z)) { emitStream(sys, lip, dir, 9, [0xe07a2a, 0xd9682a, 0xf6c66b], 5, 0.3, 0.5, 14, tr); emitStream(sys, lip, dir, 8, 0xf2c94c, 1, 0.12, 0.6, 14, tr); }
            if (!poured) {
              poured = true;
              const wd = Math.atan2(dir.x, dir.z);
              for (const o of sys.enemies(tr)) { const dx = o.x - lip.x, dz = o.z - lip.z, d = Math.hypot(dx, dz); if (d < 13 && Math.abs(((Math.atan2(dx, dz) - wd + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.75) sys.after(d / 14, () => { sys.hit(tr, o, { kind: 'soup', dmg: 30, blind: { kind: 'soup', secs: 2.6 }, push: [dir.x * 8, dir.z * 8, 2], burn: 2, award: 30, label: 'SOUP\'S ON!' }); if (sys.near(o.x, o.z)) sys.fx.smoke(o.x, o.y + 2, o.z, 6, 0xffffff, 0.8); }); }
            }
          }
          if (age > 2.2) { if (bowl) { bowl.rotation.set(0, 0, 0); bowl.position.fromArray(bowl.userData.rest || [0, 2.3, -0.05]); } done(); return false; }
          return true;
        });
      },
    },
  },

  // ================================================================ CHURRICANE
  churricane: {
    light: { // Churro Spinner: folds out under the chassis, spins for 10 s smacking anyone close, stops square and folds away
      bot: anyNear(9),
      start(sys, tr, done) {
        const sp = A.churroSpinner(), body = tr.mesh.userData.body; sp.position.set(0, 0.22, -0.1); sp.scale.set(1, 0.01, 1); body.add(sp);
        const rotor = sp.userData.rotor; let w = 0, stopping = false;
        sys.task(() => (dt, t, age) => {
          // the arm drops out of the chassis, then the churro telescopes out to full length (and back in at the end)
          const drop = smooth(age / 0.25) * (age > 10.75 ? 1 - smooth((age - 10.75) / 0.2) : 1), reach = smooth((age - 0.2) / 0.3) * (age > 10.45 ? 1 - smooth((age - 10.45) / 0.3) : 1);
          sp.scale.y = drop + 0.01; rotor.scale.x = 0.22 + 0.78 * reach;
          if (age < 10) w = Math.min(19, w + dt * 30);
          else {
            // wind down and come to rest square across the truck, as it started
            stopping = true;
            const want = Math.round(rotor.rotation.y / Math.PI) * Math.PI;
            w = Math.max(0, w - dt * 40); if (w < 3) { rotor.rotation.y += (want - rotor.rotation.y) * Math.min(1, dt * 8); w = 0; }
          }
          rotor.rotation.y += w * dt;
          if (w > 6 && !stopping) {
            if (sys.near(tr.x, tr.z) && Math.random() < 0.5) { const e = sys.worldPoint(tr, [Math.sin(rotor.rotation.y + Math.PI / 2) * 2.5, 0.3, Math.cos(rotor.rotation.y + Math.PI / 2) * 2.5], _a); sys.fx.emit(1, (q) => { q.x = e.x; q.y = e.y; q.z = e.z; q.size = 0.12; q.life = 0.5; q.color = 0xf6e7c8; q.vy = 2; q.vx = (Math.random() - 0.5) * 6; q.vz = (Math.random() - 0.5) * 6; }); }
            for (const v of sys.enemies(tr)) {
              const d = sys.dist(tr, v); if (d > 4.4) continue;
              if ((v._churroT || 0) > sys.time) continue; v._churroT = sys.time + 0.7;
              const nx = (v.x - tr.x) / (d || 1), nz = (v.z - tr.z) / (d || 1);
              sys.hit(tr, v, { kind: 'churro', dmg: 7, push: [nx * 20, nz * 20, 3], spin: 1.1, award: 8, label: 'SMACKED!' });
              if (sys.near(v.x, v.z)) splashAt(sys, v.x, 0.8, v.z, 0xf6e7c8, 10, 3, 0.15);
            }
          }
          if (age > 10.95) { sp.removeFromParent(); done(); return false; }
          return true;
        });
      },
    },
    heavy: { // Sugar Grenades: the churros tilt up and lob five grenades forward that burst into cinnamon sugar clouds
      parts: ['churros'], bot: (sys, tr) => sys.enemies(tr).some((v) => sys.inFront(tr, v, 40, 0.5) && sys.dist(tr, v) > 10),
      start(sys, tr, done) {
        const ch = sys.part(tr, 'churros');
        const muzzles = [[-0.36, 2.55, 2.1], [0.36, 2.55, 2.1], [0, 2.55, 2.1], [0.16, 2.95, 2.1], [-0.16, 2.95, 2.1]];
        let fired = 0;
        sys.task(() => (dt, t, age) => {
          const tilt = smooth(age / 0.4) * (1 - smooth((age - 2.0) / 0.4));
          if (ch) ch.rotation.x = -0.14 * tilt;
          const due = age < 0.5 ? 0 : Math.min(5, 1 + Math.floor((age - 0.5) / 0.25));
          while (fired < due) {
            const m = muzzles[fired]; fired++;
            const p0 = sys.worldPoint(tr, [m[0], m[1] + 0.3 * tilt, m[2] + 0.2], _a), [fx, fz] = fwdOf(tr), spread = (fired - 3) * 0.13;
            const sp = 24, dx = Math.sin(tr.heading + spread), dz = Math.cos(tr.heading + spread);
            sys.glow.emit(5, (q) => { q.x = p0.x; q.y = p0.y; q.z = p0.z; q.vx = fx * 6; q.vz = fz * 6; q.vy = 3; q.size = 0.25; q.grow = 1.2; q.life = 0.12; q.g = 0; q.color = 0xffd08a; });
            softSmoke(sys, p0.x, p0.y, p0.z, 4, 0xd9c2a0, 0.45, 1.5);
            const obj = A.grenade();
            sys.addProjectile({ obj, x: p0.x, y: p0.y, z: p0.z, vx: dx * sp + tr.vx, vy: 9, vz: dz * sp + tr.vz, g: 16, life: 4, r: 0.6, owner: tr, spin: [9, 2, 0],
              trail: (p) => { if (sys.near(p.x, p.z)) sys.glow.emit(1, (q) => { q.x = p.x; q.y = p.y + 0.2; q.z = p.z; q.size = 0.1; q.life = 0.15; q.g = 0; q.color = 0xffe08a; }); },
              onHit: (v, p) => { sys.hit(tr, v, { kind: 'grenade', dmg: 30, push: [p.vx * 0.4, p.vz * 0.4, 6], knock: 'side', award: 25, label: 'DIRECT HIT!' }); },
              onEnd: (p) => {
                fireball(sys, p.x, p.y + 0.4, p.z, 0.55);
                const x = p.x, z = p.z;
                // a lingering cloud of cinnamon sugar that keeps hurting
                sys.addHazard({ x, z, r: 4.6, life: 3.2, owner: tr, every: 0.5, ownerSafe: true,
                  update: (dt2, t2, h) => { if (sys.near(x, z) && Math.random() < 0.7) sys.soft.emit(2, (q) => { const a = Math.random() * 6.28, r = Math.random() * 4.4; q.x = x + Math.cos(a) * r; q.y = 0.6 + Math.random() * 2.5; q.z = z + Math.sin(a) * r; q.vx = (Math.random() - 0.5); q.vz = (Math.random() - 0.5); q.vy = 0.6; q.g = 0; q.drag = 1; q.size = 1.0; q.grow = 1.2; q.life = 1.4; q.alpha = 0.6; q.color = pick([0xc68a4e, 0xe9d4b0, 0xf6ead2, 0xa86a35]); }); if (sys.near(x, z) && Math.random() < 0.5) sys.glow.emit(1, (q) => { q.x = x + (Math.random() - 0.5) * 7; q.y = 0.5 + Math.random() * 2.6; q.z = z + (Math.random() - 0.5) * 7; q.vy = -0.4; q.g = 0; q.size = 0.06; q.life = 0.5; q.color = 0xfff1c0; }); },
                  onEnter: (v) => sys.hit(tr, v, { kind: 'sugar', dmg: 4, blind: { kind: 'sugar', secs: 0.8, amount: 0.5 }, award: 3 }) });
              } });
          }
          if (age > 2.5) { if (ch) ch.rotation.x = 0; done(); return false; }
          return true;
        });
      },
    },
  },

  // ================================================================ HULK HOAGIE
  hoagie: {
    light: { // Hoagie Smash: the truck bounces, then slams the ground: everyone nearby spins out
      bot: anyNear(10),
      start(sys, tr, done) {
        tr.impulse(0, 0, 8 * tr.mass); tr.bounce = 0.4;
        let slammed = false;
        sys.task(() => (dt, t, age) => {
          if (!slammed && age > 0.3 && !tr.airborne) {
            slammed = true; tr.bounce = 0.8;
            const R = 12; softRing(sys, tr.x, 0.3, tr.z, 0xb59a78, R * 0.75, 40); sys.fx.debris(tr.x, 0.4, tr.z, 24, 0x6d5a45);
            sys.glow.emit(20, (q) => { const a = Math.random() * 6.28; q.x = tr.x + Math.cos(a) * 3; q.y = 0.4; q.z = tr.z + Math.sin(a) * 3; q.vx = Math.cos(a) * 18; q.vz = Math.sin(a) * 18; q.vy = 0.5; q.g = 0; q.drag = 2; q.size = 0.35; q.life = 0.35; q.color = 0xd0a0ff; });
            sys.shake(tr.x, tr.z, 1.4); sys.audio.thud?.();
            for (const v of sys.enemies(tr)) { const d = sys.dist(tr, v); if (d < R) { const nx = (v.x - tr.x) / (d || 1), nz = (v.z - tr.z) / (d || 1); sys.hit(tr, v, { kind: 'smash', spin: 1.6, push: [nx * 9, nz * 9, 4], dmg: 6, award: 12, label: 'SPUN OUT!' }); } }
          }
          if (age > 1.2 || (slammed && age > 0.5)) { done(); return false; }
          return true;
        });
      },
    },
    heavy: { // BLT-9: wings, a tail and a jet sprout from the sandwich; it lifts off and hunts the nearest truck down
      parts: ['sandwich'], bot: anyNear(60),
      start(sys, tr, done) {
        const sw = sys.part(tr, 'sandwich');
        if (!sw) { done(); return; }
        const kit = A.droneKit(3.8); kit.position.set(0, 0.45, 0.2); sw.add(kit);
        for (const o of [...kit.userData.wings, kit.userData.fin, kit.userData.stab, kit.userData.eng]) o.scale.setScalar(0.01);
        let target = sys.nearest(tr, 90);
        sys.task(() => (dt, t, age) => {
          // transform: everything unfolds out of the bread
          const k = smooth(age / 0.9);
          kit.userData.wings.forEach((w, i) => w.scale.set(i % 2 === 0 ? (w.position.x < 0 ? -k : k) : k, Math.max(0.01, k), Math.max(0.01, k)));
          for (const o of [kit.userData.fin, kit.userData.stab, kit.userData.eng]) o.scale.setScalar(Math.max(0.01, k));
          if (age > 0.9) { kit.userData.flame.visible = true; kit.userData.flame.scale.set(1, 1, 0.6 + Math.random() * 0.5); }
          if (age < 1.6) { if (age > 0.9) sw.position.y = (sw.userData.rest?.[1] ?? 2.2) + smooth((age - 0.9) / 0.7) * 1.6; return true; }
          // lift off: the drone leaves the truck and hunts
          const obj = sys.detach(sw), sp = 30;
          const [fx, fz] = fwdOf(tr);
          sys.addProjectile({ obj, x: obj.position.x, y: obj.position.y, z: obj.position.z, vx: fx * 8 + tr.vx, vy: 6, vz: fz * 8 + tr.vz, life: 10, r: 1.4, owner: tr, keep: true, face: true, walls: false,
            home: { target, turn: 1.8, speed: sp, alt: (p) => { const tg = p.home.target; return tg && Math.hypot(tg.x - p.x, tg.z - p.z) > 16 ? 7 : 1.2; } },
            trail: (p) => { if (!p.home.target) p.home.target = sys.nearest(tr, 90); if (sys.near(p.x, p.z)) { const back = _a.set(-p.vx, -p.vy, -p.vz).normalize(); sys.glow.emit(3, (q) => { q.x = p.x + back.x * 2.3; q.y = p.y + 1.0 + back.y * 2.3; q.z = p.z + back.z * 2.3; q.vx = back.x * 10; q.vy = back.y * 10; q.vz = back.z * 10; q.size = 0.3; q.grow = 1.4; q.life = 0.18; q.g = 0; q.color = pick(FIRE); }); sys.soft.emit(1, (q) => { q.x = p.x + back.x * 2.6; q.y = p.y + 1; q.z = p.z + back.z * 2.6; q.size = 0.3; q.grow = 1.6; q.life = 0.8; q.g = -0.5; q.color = 0x8a8a8a; }); } },
            onGround: () => true,
            onHit: (v, p) => { sys.hit(tr, v, { kind: 'drone', dmg: 48, push: [p.vx * 0.5, p.vz * 0.5, 9], knock: true, award: 45, label: 'BLT-9 STRIKE!' }); },
            onEnd: (p) => {
              fireball(sys, p.x, p.y, p.z, 1.4); sys.shake(p.x, p.z, 1.6); sys.audio.crash?.();
              for (const v of sys.enemies(tr)) { const d = Math.hypot(v.x - p.x, v.z - p.z); if (d < 7 && !p.hits.has(v)) sys.hit(tr, v, { kind: 'blast', dmg: 14 * (1 - d / 7) + 4, push: [(v.x - p.x) / (d || 1) * 14, (v.z - p.z) / (d || 1) * 14, 6], award: 10 }); }
              kit.removeFromParent(); obj.rotation.set(0, 0, 0); sys.regrow(tr, sw, 2.5);
            } });
          done(); return false;
        });
      },
    },
  },

  // ================================================================ CREAM SUPREME
  cream: {
    light: { // Frostbite: a frost cloud billows out from under the truck; everything inside is frozen for 6 s
      bot: anyNear(10),
      start(sys, tr, done) {
        const R = 12, x0 = tr.x, z0 = tr.z;
        sys.task(() => (dt, t, age) => {
          const r = R * smooth(age / 1.0);
          if (sys.near(x0, z0)) {
            sys.soft.emit(6, (q) => { const a = Math.random() * 6.28, rr = r * (0.6 + Math.random() * 0.4); q.x = x0 + Math.cos(a) * rr; q.y = 0.3 + Math.random() * (0.5 + age * 2); q.z = z0 + Math.sin(a) * rr; q.vx = Math.cos(a) * 3; q.vz = Math.sin(a) * 3; q.vy = 1 + Math.random(); q.g = 0; q.drag = 1.5; q.size = 1.0; q.grow = 1.8; q.life = 1.3; q.alpha = 0.7; q.color = pick([0xffffff, 0xdff4ff, 0xbfe8ff]); });
            sys.glow.emit(3, (q) => { const a = Math.random() * 6.28, rr = Math.random() * r; q.x = x0 + Math.cos(a) * rr; q.y = 0.5 + Math.random() * 2.5; q.z = z0 + Math.sin(a) * rr; q.vy = 0.5; q.g = 0; q.size = 0.08; q.life = 0.8; q.color = 0xbfefff; });
          }
          for (const v of sys.enemies(tr)) { if ((v._frost || 0) > sys.time) continue; if (Math.hypot(v.x - x0, v.z - z0) < r) { v._frost = sys.time + 7; sys.hit(tr, v, { kind: 'frost', freeze: 6, dmg: 6, award: 15, label: 'FROZEN!' }); } }
          if (age > 1.4) { done(); return false; }
          return true;
        });
      },
    },
    heavy: { // Laser Cone: the cone swings round on its scoops and fires a 6 s laser along the truck's nose
      parts: ['cone', 'scoops'], bot: nearOrFront(40, 0.35),
      start(sys, tr, done) {
        const cone = sys.part(tr, 'cone'), scoops = sys.part(tr, 'scoops'), body = tr.mesh.userData.body;
        const rest = cone ? cone.position.clone() : new THREE.Vector3(0, 2.85, -0.3);
        const beam = A.laserBeam(); beam.visible = false; sys.group.add(beam);
        const gim = A.gimbal(0.95); gim.position.set(rest.x, rest.y - 0.05, rest.z); gim.scale.setScalar(0.01); body.add(gim);
        let tick = 0;
        sys.task(() => (dt, t, age) => {
          // swing: lift, turn half a circle about the scoops so the point faces forward, settle
          const swing = smooth(age / 0.9) * (1 - smooth((age - 7.0) / 0.9));
          if (cone) { cone.rotation.set(0, Math.PI * swing, 0); cone.position.set(rest.x, rest.y + Math.sin(swing * Math.PI) * 0.5 + swing * 0.15, rest.z + swing * 0.2); }
          // the gimbal rises out of the scoops with it: outer ring turns with the swing, inner ring nods as it settles
          const gs = Math.min(smooth(age / 0.3), 1 - smooth((age - 7.6) / 0.3));
          gim.scale.setScalar(Math.max(0.01, gs)); gim.position.y = rest.y - 0.05 + Math.sin(swing * Math.PI) * 0.5 + swing * 0.15; gim.position.z = rest.z + swing * 0.2;
          gim.userData.yaw.rotation.y = Math.PI * swing; gim.userData.pitch.rotation.x = Math.sin(swing * Math.PI) * 0.6 + (age > 0.95 && age < 6.95 ? Math.sin(age * 30) * 0.02 : 0);
          if (scoops) scoops.rotation.set(Math.sin(age * 9) * 0.03 * swing, Math.sin(age * 5) * 0.05 * swing, 0);
          const firing = age > 0.95 && age < 6.95;
          beam.visible = firing;
          if (firing) {
            const tip = sys.worldPoint(tr, [rest.x, rest.y + 0.15, rest.z + 0.2 + 2.6], _a), dir = sys.worldDir(tr, [0, -0.04, 1], _b).normalize();
            let len = Math.min(48, sys.world.rayDistance(tip.x, tip.z, dir.x, dir.z, 48)), victim = null;
            for (const v of sys.enemies(tr)) {
              const dx = v.x - tip.x, dz = v.z - tip.z, along = dx * dir.x + dz * dir.z; if (along < 0 || along > len) continue;
              const off = Math.abs(dx * dir.z - dz * dir.x); if (off < 1.9 && along < len) { len = along; victim = v; }
            }
            beam.position.copy(tip); beam.lookAt(tip.x + dir.x, tip.y + dir.y, tip.z + dir.z);
            beam.userData.beam.scale.set(1 + Math.sin(age * 40) * 0.12, 1 + Math.sin(age * 40) * 0.12, len);
            beam.userData.flare.scale.setScalar(0.8 + Math.random() * 0.3);
            const hx = tip.x + dir.x * len, hy = tip.y + dir.y * len, hz = tip.z + dir.z * len;
            if (sys.near(hx, hz)) sys.glow.emit(3, (q) => { q.x = hx; q.y = hy; q.z = hz; const a = Math.random() * 6.28; q.vx = Math.cos(a) * 6 - dir.x * 4; q.vz = Math.sin(a) * 6 - dir.z * 4; q.vy = Math.random() * 5; q.g = 10; q.size = 0.15; q.life = 0.3; q.color = pick([0xff9ad1, 0xffffff, 0x6fd8ff]); });
            if (victim) {
              victim.vx += dir.x * 34 * dt; victim.vz += dir.z * 34 * dt; // continuously shoved back
              tick -= dt; if (tick <= 0) { tick = 0.25; sys.hit(tr, victim, { kind: 'laser', dmg: 4, award: 3, label: 'LASERED!' }); if (victim.isPlayer) sys.game.hud.splat?.('laser', 0.5, 0.4); }
            }
          }
          if (age > 7.95) { beam.removeFromParent(); gim.removeFromParent(); if (cone) { cone.rotation.set(0, 0, 0); cone.position.copy(rest); } if (scoops) scoops.rotation.set(0, 0, 0); done(); return false; }
          return true;
        });
      },
    },
  },

  // ================================================================ SUPERGYRO
  gyro: {
    light: { // Tzatzooka: the gyro cracks open (hinged at the back), a squeeze bottle pokes out and fires a rope of tzatziki
      parts: ['gyro'], bot: nearOrFront(28, 0.35),
      start(sys, tr, done) {
        const gy = sys.part(tr, 'gyro'), body = tr.mesh.userData.body;
        const bb = gy?.userData.bbox || [-0.8, 2.1, -1.8, 0.8, 3.4, 1.3], rest = gy ? gy.position.clone() : null;
        const hinge = new THREE.Vector3(0, bb[1], bb[2]); // back bottom edge
        const bottle = A.squeezeBottle(); bottle.position.set(0, 2.5, (bb[2] + bb[5]) / 2 - 0.6); bottle.scale.setScalar(0.01); body.add(bottle);
        const target = sys.nearest(tr, 30, (v) => sys.inFront(tr, v, 30, 0.45));
        let squirted = false;
        sys.task(() => (dt, t, age) => {
          const open = smooth(age / 0.3) * (1 - smooth((age - 1.4) / 0.3)), ang = -0.32 * open;
          if (gy) { const r = _a.copy(rest).sub(hinge).applyAxisAngle(_b.set(1, 0, 0), ang); gy.position.copy(hinge).add(r); gy.rotation.x = ang; }
          bottle.scale.setScalar(Math.max(0.01, open)); bottle.position.z = (bb[2] + bb[5]) / 2 - 0.6 + open * 1.4; bottle.position.y = 2.5 + open * 0.25;
          if (age > 0.4 && age < 0.95) {
            const tip = sys.worldPoint(tr, [0, 2.75, (bb[2] + bb[5]) / 2 + 2.3], _a), dir = sys.worldDir(tr, [0, 0.05, 1], _b).normalize();
            if (target) { _c.set(target.x - tip.x, target.y + 2 - tip.y, target.z - tip.z).normalize(); dir.lerp(_c, 0.7).normalize(); }
            if (sys.near(tip.x, tip.z)) { emitStream(sys, tip, dir, 34, 0xf8f8f0, 5, 0.26, 0.04, 3, tr); emitStream(sys, tip, dir, 34, 0x5aa84c, 1, 0.08, 0.06, 3, tr); }
            if (!squirted && target) { squirted = true; sys.after(sys.dist(tr, target) / 34, () => sys.hit(tr, target, { kind: 'tzatziki', dmg: 7, blind: { kind: 'tzatziki', secs: 2.6 }, award: 15, label: 'TZATZIKI\'D!' })); }
          }
          if (age > 1.75) { if (gy) { gy.position.copy(rest); gy.rotation.x = 0; } bottle.removeFromParent(); done(); return false; }
          return true;
        });
      },
    },
    heavy: { // Trojan Gyro: hinged at the front, the gyro lifts and a wooden gyro statue slides out the back onto the road
      parts: ['gyro'], bot: anyBehind(26),
      start(sys, tr, done) {
        const gy = sys.part(tr, 'gyro'), body = tr.mesh.userData.body;
        const bb = gy?.userData.bbox || [-0.8, 2.1, -1.8, 0.8, 3.4, 1.3], rest = gy ? gy.position.clone() : null;
        const hinge = new THREE.Vector3(0, bb[1], bb[5]); // front bottom edge
        const statue = A.trojanGyro(); statue.scale.setScalar(0.55); statue.position.set(0, 2.3, -0.3); statue.visible = false; body.add(statue);
        let dropped = false;
        sys.task(() => (dt, t, age) => {
          const open = smooth(age / 0.35) * (1 - smooth((age - 1.5) / 0.35)), ang = 0.42 * open;
          if (gy) { const r = _a.copy(rest).sub(hinge).applyAxisAngle(_b.set(1, 0, 0), ang); gy.position.copy(hinge).add(r); gy.rotation.x = ang; }
          if (age > 0.35 && !dropped) {
            // slide out backwards, growing to full size as it leaves the roof
            statue.visible = true; const k = smooth((age - 0.35) / 0.6);
            statue.position.set(0, 2.3 + Math.sin(k * Math.PI) * 0.6 - k * 1.0, -0.3 - k * 3.4); statue.scale.setScalar(0.55 + 0.45 * k); statue.rotation.x = -k * 0.3;
            if (k >= 1) {
              dropped = true;
              const w = sys.detach(statue); w.rotation.set(0, tr.heading + Math.PI, 0); const x = w.position.x, z = w.position.z, gy0 = sys.groundY(x, z);
              let vy = 0;
              const h = sys.addHazard({ obj: w, x, z, r: 1.7, life: 22, owner: tr, solid: true, every: 0, ownerSafe: true,
                update: (dt2, t2, hz) => { if (w.position.y > gy0) { vy -= 30 * dt2; w.position.y = Math.max(gy0, w.position.y + vy * dt2); if (w.position.y === gy0) { sys.fx.debris(x, gy0 + 0.3, z, 10, 0x8c6d45); sys.audio.thud?.(); } } },
                onEnter: (v, hz) => {
                  if (hz.age < 0.8) return;
                  hz.dead = true; fireball(sys, x, gy0 + 1.5, z, 1.8); sys.fx.debris(x, gy0 + 2, z, 30, 0xa06b38); sys.shake(x, z, 2); sys.audio.crash?.();
                  for (const o of sys.trucks) {
                    if (!o.alive || o.ko || o === tr) continue; const d = Math.hypot(o.x - x, o.z - z); if (d > 10) continue;
                    const nx = (o.x - x) / (d || 1), nz = (o.z - z) / (d || 1), direct = o === v;
                    sys.hit(tr, o, { kind: 'trojan', dmg: direct ? 55 : 30 * (1 - d / 10) + 8, push: [nx * (direct ? 24 : 16), nz * (direct ? 24 : 16), direct ? 12 : 7], knock: direct || d < 4.5, award: direct ? 40 : 15, label: 'TROJAN GYRO!' });
                  }
                } });
              h.obj.position.y = w.position.y;
            }
          }
          if (age > 1.9 && dropped) { if (gy) { gy.position.copy(rest); gy.rotation.x = 0; } done(); return false; }
          return true;
        });
      },
    },
  },

  // ================================================================ EGGATRON
  eggatron: {
    light: { // Butter Trail: a giant stick of butter swings down off the back and greases the road for 3 s
      bot: anyBehind(18),
      start(sys, tr, done) {
        const kit = A.butterStick(), body = tr.mesh.userData.body; kit.position.set(0, 1.1, -2.6); body.add(kit);
        let lastX = null, lastZ = null;
        sys.task(() => (dt, t, age) => {
          const down = smooth(age / 0.4) * (1 - smooth((age - 3.4) / 0.4));
          kit.scale.setScalar(Math.max(0.01, Math.min(smooth(age / 0.2), 1 - smooth((age - 3.65) / 0.2))));
          kit.rotation.x = (1 - down) * 1.4 - down * 0.36; // stowed upright, then swung down so the stick drags on the road
          if (age > 0.4 && age < 3.4) {
            const end = sys.worldPoint(tr, [0, 0, -4.9], _a);
            if (sys.near(end.x, end.z) && Math.random() < 0.5) sys.fx.emit(1, (q) => { q.x = end.x + (Math.random() - 0.5) * 0.6; q.y = 0.15; q.z = end.z + (Math.random() - 0.5) * 0.6; q.vy = 1.5; q.g = 8; q.size = 0.14; q.life = 0.4; q.color = 0xffe27a; });
            if (lastX === null || Math.hypot(end.x - lastX, end.z - lastZ) > 1.6) {
              const x = end.x, z = end.z, len = lastX === null ? 1.6 : Math.hypot(x - lastX, z - lastZ);
              const strip = new THREE.Mesh(BUTTER_STRIP(), A.mat('liquid:ffe27a')); strip.position.set(x, sys.groundY(x, z) + 0.035, z); strip.rotation.y = tr.heading; strip.scale.set(1, 1, len);
              sys.addHazard({ obj: strip, x, z, r: 1.1, life: 9, owner: tr, every: 1.5,
                update: (dt2, t2, h) => { if (h.life - h.age < 1) strip.scale.x = Math.max(0.01, h.life - h.age); },
                onEnter: (v) => sys.hit(tr, v, { kind: 'butter', spin: 1.4, slick: 1.6, dmg: 3, award: 10, label: 'BUTTERED!' }) });
              lastX = x; lastZ = z;
            }
          }
          if (age > 3.85) { kit.removeFromParent(); done(); return false; }
          return true;
        });
      },
    },
    heavy: { // Egg Turret: pops out of the roof and fires 100 eggs in 6 s straight ahead
      bot: nearOrFront(34, 0.3),
      start(sys, tr, done) {
        const tur = A.eggTurret(), body = tr.mesh.userData.body; tur.position.set(0, 1.9, 1.35); tur.scale.set(1, 0.01, 1); body.add(tur);
        let fired = 0;
        sys.task(() => (dt, t, age) => {
          const up = smooth(age / 0.5) * (1 - smooth((age - 6.8) / 0.4));
          tur.scale.y = Math.max(0.01, up); tur.position.y = 1.9 + up * 0.55;
          const gun = tur.userData.gun; gun.rotation.y = Math.sin(age * 2.2) * 0.06;
          const due = age < 0.6 ? 0 : Math.min(100, Math.floor((age - 0.6) / 0.06));
          while (fired < due) {
            fired++;
            tur.updateWorldMatrix(true, true);
            const m = gun.localToWorld(_a.copy(tur.userData.muzzle)), dir = _b.set((Math.random() - 0.5) * 0.06, 0.02 + Math.random() * 0.03, 1).transformDirection(gun.matrixWorld);
            gun.position.z = -0.08;
            if (sys.near(m.x, m.z)) sys.glow.emit(1, (q) => { q.x = m.x; q.y = m.y; q.z = m.z; q.size = 0.25; q.grow = 1; q.life = 0.06; q.g = 0; q.color = 0xffe08a; });
            const sp = 60;
            sys.addProjectile({ obj: A.egg(), x: m.x, y: m.y, z: m.z, vx: dir.x * sp + tr.vx, vy: dir.y * sp, vz: dir.z * sp + tr.vz, g: 9, life: 1.2, r: 0.4, owner: tr, spin: [10, 0, 6],
              onHit: (v, p) => { v._eggs = (v._eggs || 0) + 1; sys.hit(tr, v, { kind: 'egg', dmg: 1.3, push: [dir.x * 1.5, dir.z * 1.5, 0], blind: v.isPlayer && v._eggs % 6 === 0 ? { kind: 'egg', secs: 1.5, amount: 0.6 } : null, award: v._eggs % 10 === 0 ? 5 : 0 }); sys.after(3, () => { v._eggs = Math.max(0, (v._eggs || 1) - 1); }); },
              onEnd: (p) => { if (!sys.near(p.x, p.z)) return; splashAt(sys, p.x, p.y, p.z, 0xffd23f, 4, 3, 0.16); splashAt(sys, p.x, p.y, p.z, 0xfffaf0, 4, 3, 0.18); } });
          }
          gun.position.z *= Math.exp(-dt * 20);
          if (age > 7.25) { tur.removeFromParent(); done(); return false; }
          return true;
        });
      },
    },
  },

  // ================================================================ WRAPTOR
  wraptor: {
    light: { // Tortilla Warfare: for 6 s cooks at both windows frisbee tortillas at anyone close
      bot: anyNear(14),
      start(sys, tr, done) { throwers(sys, tr, 6, 0.42, 17, () => A.tortilla(), { kind: 'tortilla', dmg: 3, blind: { kind: 'tortilla', secs: 1.8 }, award: 5, label: 'TORTILLA\'D!' }, (p) => { p.spin = [0, 22, 0]; p.flat = true; }, null, done); },
    },
    heavy: { // Wraptor Wram: the head drops into a stare, the truck glows red and supercharges until it rams something
      parts: ['head'], bot: nearOrFront(30, 0.25),
      start(sys, tr, done) {
        const head = sys.part(tr, 'head'), bodyMesh = tr.mesh.userData.body.children.find((c) => c.isMesh);
        const orig = bodyMesh?.material, tint = orig ? orig.clone() : null;
        if (tint) { tint.emissive = new THREE.Color(0xff1a00); bodyMesh.material = tint; }
        let over = false, age = 0;
        const finish = () => { if (over) return; over = true; tr.powerMul = 1; tr._onRam = null; tr._onWall = null; };
        tr.powerMul = 1.35;
        tr._onRam = (v, info) => {
          if (over || !v || v.ko || (v.team && v.team === tr.team)) return;
          const [fx, fz] = fwdOf(tr);
          sys.hit(tr, v, { kind: 'wram', dmg: 46, push: [fx * 30, fz * 30, 8], knock: 'side', award: 45, label: 'WRAPTOR WRAM!' });
          fireball(sys, v.x, v.y + 1.5, v.z, 0.9); sys.shake(v.x, v.z, 1.8); finish();
        };
        tr._onWall = (s) => { if (s > 0.6 && age > 0.4) { sys.fx.debris(tr.x, 1, tr.z, 10, 0x6d5a45); finish(); } };
        sys.task(() => (dt, t, a) => {
          age = a;
          const stare = smooth(a / 0.3) * (over ? 0 : 1);
          if (head) head.rotation.x = 0.22 * stare;
          if (tint) tint.emissiveIntensity = over ? Math.max(0, tint.emissiveIntensity - dt * 3) : 0.25 + 0.25 * Math.sin(a * 10);
          if (!over && sys.near(tr.x, tr.z) && Math.random() < 0.7) sys.glow.emit(1, (q) => { q.x = tr.x + (Math.random() - 0.5) * 2.5; q.y = tr.y + 0.5 + Math.random() * 2.5; q.z = tr.z + (Math.random() - 0.5) * 4; q.vx = -tr.vx * 0.2; q.vz = -tr.vz * 0.2; q.vy = 1; q.g = 0; q.size = 0.25; q.life = 0.35; q.color = 0xff2a1a; });
          if (a > 8) finish();
          if (over && (!tint || tint.emissiveIntensity <= 0)) { if (tint) { bodyMesh.material = orig; tint.dispose(); } if (head) head.rotation.x = 0; done(); return false; }
          return true;
        });
      },
    },
  },

  // ================================================================ GENERAL TSONAMI
  tsonami: {
    light: { // Take-out Frags: for 6 s the cooks hurl take-out boxes that burst like firecrackers
      bot: anyNear(14),
      start(sys, tr, done) { throwers(sys, tr, 6, 0.5, 17, () => A.takeoutBox(), { kind: 'frag', dmg: 4, award: 4 }, (p) => { p.spin = [4, 3, 6]; }, (p) => sparkle(sys, p.x, p.y, p.z), done); },
    },
    heavy: { // Flaming Dragon: a huge plume of fire from the dragon's mouth sets trucks ahead ablaze for 6 s
      bot: nearOrFront(22, 0.35),
      start(sys, tr, done) {
        const hitSet = new Set();
        sys.task(() => (dt, t, age) => {
          const mouth = sys.worldPoint(tr, [0, 2.74, 2.55], _a), dir = sys.worldDir(tr, [0, -0.1, 1], _b).normalize();
          if (sys.near(mouth.x, mouth.z)) sys.glow.emit(8, (q) => { const sp = 22 + Math.random() * 10; q.x = mouth.x; q.y = mouth.y; q.z = mouth.z; q.vx = dir.x * sp + (Math.random() - 0.5) * 7 + tr.vx; q.vy = dir.y * sp + (Math.random() - 0.4) * 5; q.vz = dir.z * sp + (Math.random() - 0.5) * 7 + tr.vz; q.g = -3; q.drag = 1.8; q.size = 0.3; q.grow = 3.2; q.life = 0.45 + Math.random() * 0.25; q.color = q.vy > 0 && Math.random() < 0.3 ? 0xffb02a : pick(FLAME); q.spin = 6; });
          if (sys.near(mouth.x, mouth.z) && Math.random() < 0.5) softSmoke(sys, mouth.x + dir.x * 14, mouth.y + 2, mouth.z + dir.z * 14, 1, 0x3a3633, 1.1, 3);
          for (const v of sys.enemies(tr)) {
            if (hitSet.has(v)) continue;
            const dx = v.x - mouth.x, dz = v.z - mouth.z, d = Math.hypot(dx, dz);
            if (d < 24 && Math.abs(((Math.atan2(dx, dz) - Math.atan2(dir.x, dir.z) + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.33 + 1.5 / Math.max(2, d)) { hitSet.add(v); sys.hit(tr, v, { kind: 'dragon', dmg: 20, burn: 6, push: [dir.x * 8, dir.z * 8, 1], award: 30, label: 'DRAGON FIRE!' }); }
          }
          if (age > 2.2) { done(); return false; }
          return true;
        });
      },
    },
  },

  // ================================================================ CHIEF BEEF
  beef: {
    light: { // Smoke Screen: hickory smoke belches out from underneath and spreads; inside, trucks drive half-blind
      bot: anyBehind(14),
      start(sys, tr, done) {
        const x = tr.x, z = tr.z, R = 13;
        sys.addHazard({ x, z, r: R, life: 6.5, owner: tr, every: 0.6, ownerSafe: true,
          update: (dt, t, h) => { const r = R * smooth(h.age / 1.2); h.r = Math.max(1, r); if (sys.near(x, z) && h.age < 5.5) sys.soft.emit(h.age < 1.2 ? 8 : 3, (q) => { const a = Math.random() * 6.28, rr = Math.random() * r; q.x = x + Math.cos(a) * rr; q.y = 0.4 + Math.random() * Math.min(4, 1 + h.age * 2); q.z = z + Math.sin(a) * rr; q.vx = Math.cos(a) * 1.5; q.vz = Math.sin(a) * 1.5; q.vy = 0.5; q.g = 0; q.drag = 1; q.size = 1.4; q.grow = 1.6; q.life = 2.0; q.alpha = 0.75; q.color = pick([0x4a4744, 0x5c5854, 0x6d6862, 0x7a6a5a]); }); },
          onEnter: (v) => sys.hit(tr, v, { kind: 'smoke', blind: { kind: 'smoke', secs: 1.3, amount: 0.8 }, slow: 1.2, award: 2 }) });
        done();
      },
    },
    heavy: { // Burnt Ends: a huge plume of smoke blasts from the skull's nose: blinding, shoving, rolling trucks side-on
      bot: nearOrFront(20, 0.35),
      start(sys, tr, done) {
        const hitSet = new Set();
        sys.task(() => (dt, t, age) => {
          const nose = sys.worldPoint(tr, [0, 1.86, 2.55], _a), dir = sys.worldDir(tr, [0, -0.05, 1], _b).normalize();
          if (sys.near(nose.x, nose.z)) {
            sys.soft.emit(9, (q) => { const sp = 20 + Math.random() * 8; q.x = nose.x; q.y = nose.y; q.z = nose.z; q.vx = dir.x * sp + (Math.random() - 0.5) * 6 + tr.vx; q.vy = (Math.random() - 0.3) * 4; q.vz = dir.z * sp + (Math.random() - 0.5) * 6 + tr.vz; q.g = -1; q.drag = 1.6; q.size = 0.5; q.grow = 2.4; q.life = 0.9; q.color = pick([0x2e2a27, 0x433d38, 0x5a524b]); q.spin = 2; });
            sys.glow.emit(2, (q) => { q.x = nose.x; q.y = nose.y; q.z = nose.z; q.vx = dir.x * 20 + (Math.random() - 0.5) * 8; q.vy = Math.random() * 4; q.vz = dir.z * 20 + (Math.random() - 0.5) * 8; q.g = 4; q.size = 0.08; q.life = 0.5; q.color = pick([0xff7a1f, 0xffb02a]); });
          }
          for (const v of sys.enemies(tr)) {
            if (hitSet.has(v)) continue;
            const dx = v.x - nose.x, dz = v.z - nose.z, d = Math.hypot(dx, dz);
            if (d < 19 && Math.abs(((Math.atan2(dx, dz) - Math.atan2(dir.x, dir.z) + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.3 + 1.6 / Math.max(2, d)) { hitSet.add(v); sys.hit(tr, v, { kind: 'burnt', dmg: 20, blind: { kind: 'smoke', secs: 2, amount: 1.2 }, push: [dir.x * 26, dir.z * 26, 5], knock: 'side', award: 30, label: 'BURNT ENDS!' }); }
          }
          if (age > 1.3) { done(); return false; }
          return true;
        });
      },
    },
  },

  // ================================================================ BARMAGGEDDON
  barmaggeddon: {
    light: { // Happy Hour: the keg tap arcs a fountain of beer onto the nearest truck; its steering goes wobbly
      bot: anyNear(16),
      start(sys, tr, done) {
        const body = tr.mesh.userData.body, tap = A.kegTap(); tap.position.set(0.62, 1.1, 2.55); body.add(tap);
        const target = sys.nearest(tr, 20);
        let hit = false;
        sys.task(() => (dt, t, age) => {
          tap.rotation.x = -0.2 - Math.sin(Math.min(1, age * 4) * Math.PI / 2) * 0.4;
          if (age > 0.2 && age < 1.6) {
            const m = sys.worldPoint(tr, [0.62, 1.2, 2.85], _a);
            const tx = target ? target.x : m.x + Math.sin(tr.heading) * 10, tz = target ? target.z : m.z + Math.cos(tr.heading) * 10;
            const T = Math.max(0.45, Math.hypot(tx - m.x, tz - m.z) / 16);
            if (sys.near(m.x, m.z)) {
              // a stream of fine droplets (each launched a hair later, so the arc reads as liquid, not beads) with a head of foam
              sys.fx.emit(9, (q) => { const T2 = T * (0.92 + Math.random() * 0.16), [vx, vy, vz] = lob(m.x, m.y, m.z, tx + (Math.random() - 0.5) * 1.8, 2.5, tz + (Math.random() - 0.5) * 1.8, T2, 16); const k = Math.random() * 0.016; q.x = m.x + vx * k; q.y = m.y + vy * k; q.z = m.z + vz * k; q.vx = vx; q.vy = vy; q.vz = vz; q.g = 16; q.size = 0.08 + Math.random() * 0.09; q.life = T2 + 0.15; q.color = pick([0xffa812, 0xffb21f, 0xffc94a, 0xffd36b]); });
              if (Math.random() < 0.35) sys.soft.emit(1, (q) => { const [vx, vy, vz] = lob(m.x, m.y, m.z, tx, 2.5, tz, T, 16); q.x = m.x; q.y = m.y; q.z = m.z; q.vx = vx; q.vy = vy; q.vz = vz; q.g = 16; q.size = 0.35; q.grow = 0.4; q.life = T; q.alpha = 0.8; q.color = 0xfff8e6; });
            }
            if (!hit && target && age > 0.2 + T) { hit = true; sys.hit(tr, target, { kind: 'beer', drunk: 4.5, dmg: 4, blind: { kind: 'beer', secs: 1.2, amount: 0.6 }, award: 12, label: 'HAPPY HOUR!' }); }
          }
          if (age > 1.9) { tap.removeFromParent(); done(); return false; }
          return true;
        });
      },
    },
    heavy: { // Bar Fight: the regulars on the stools hurl bottles and glasses at the nearest truck for 10 s
      bot: anyNear(20),
      start(sys, tr, done) {
        const crowd = tr.rigFx?.crowd;
        const people = crowd ? crowd.people : [];
        let next = people.map((_, i) => 0.2 + i * 0.25);
        sys.task(() => (dt, t, age) => {
          const target = sys.nearest(tr, 24);
          people.forEach((p, i) => {
            next[i] -= dt;
            if (p.throwT > 0) { p.throwT -= dt; if (p.throwT <= 0) { p.calm.visible = true; p.panic.visible = false; } }
            if (next[i] > 0 || !target || age > 10) return;
            next[i] = 0.8 + Math.random() * 0.5;
            p.calm.visible = false; p.panic.visible = true; p.throwT = 0.35; // wind up
            const hand = p.g.localToWorld(_a.set(0.25, 2.0, 0.1)), T = Math.max(0.45, Math.hypot(target.x - hand.x, target.z - hand.z) / 18);
            const [tx, tz] = lead(target, T);
            const [vx, vy, vz] = lob(hand.x, hand.y, hand.z, tx, target.y + 1.8, tz, T, 16);
            const kind = Math.random() < 0.6 ? Math.floor(Math.random() * 2) : 2;
            sys.addProjectile({ obj: A.bottle(kind), x: hand.x, y: hand.y, z: hand.z, vx, vy, vz, g: 16, life: T + 0.8, r: 0.6, owner: tr, spin: [12, 4, 8],
              onHit: (v) => sys.hit(tr, v, { kind: 'bottle', dmg: 3, award: 3, label: 'BAR FIGHT!' }),
              onEnd: (q) => { if (!sys.near(q.x, q.z)) return; sys.glow.emit(8, (e) => { const a = Math.random() * 6.28, s = 3 + Math.random() * 5; e.x = q.x; e.y = q.y; e.z = q.z; e.vx = Math.cos(a) * s; e.vz = Math.sin(a) * s; e.vy = 2 + Math.random() * 4; e.g = 14; e.size = 0.07; e.life = 0.5; e.color = pick([0xcff3ff, 0xffffff, 0x9fe0a8]); }); splashAt(sys, q.x, q.y, q.z, kind === 1 ? 0x8a1a2a : 0xffb21f, 8, 3, 0.2); } });
          });
          if (age > 10.4) { for (const p of people) { p.calm.visible = true; p.panic.visible = false; } done(); return false; }
          return true;
        });
      },
    },
  },
};

// one strip of butter on the road, length along z scaled per segment
let _strip = null;
function BUTTER_STRIP() { if (!_strip) { _strip = new THREE.PlaneGeometry(1.5, 1, 1, 1).rotateX(-Math.PI / 2); } return _strip; }

/**
 * Cooks at both side windows throw things at anyone within range for `secs`: make() builds the projectile mesh,
 * o is the hit, setup(p) tweaks the projectile, onBurst(p) runs where it lands.
 */
function throwers(sys, tr, secs, every, range, make, o, setup, onBurst, done) {
  const sides = ['left', 'right'].map((s) => ({ s, c: crew(sys, tr, s, null, 1), next: Math.random() * 0.3 }));
  sys.task(() => (dt, t, age) => {
    for (const side of sides) {
      const c = side.c; c.g.scale.y = smooth(age / 0.25) * (1 - smooth((age - secs) / 0.25)) + 0.01;
      side.next -= dt;
      if (side.throwT > 0) { side.throwT -= dt; if (side.throwT <= 0) armsUp(c.cooks[0], false); }
      if (age > secs || side.next > 0) continue;
      const target = sys.nearest(tr, range, (v) => sys.sideOf(tr, v.x, v.z) === side.s || sys.dist(tr, v) < 6);
      if (!target) continue;
      side.next = every * (0.8 + Math.random() * 0.4);
      armsUp(c.cooks[0], true); side.throwT = 0.25;
      const hand = sys.worldPoint(tr, [c.out.p[0] + Math.sign(c.out.p[0]) * 0.4, 2.4, c.out.p[2]], _a), T = Math.max(0.35, sys.dist(tr, target) / 22);
      const [tx, tz] = lead(target, T);
      const [vx, vy, vz] = lob(hand.x, hand.y, hand.z, tx, target.y + 2, tz, T, 10);
      const p = { obj: make(), x: hand.x, y: hand.y, z: hand.z, vx, vy, vz, g: 10, life: T + 0.8, r: 0.7, owner: tr,
        onHit: (v) => sys.hit(tr, v, o), onEnd: (q) => onBurst?.(q) };
      setup?.(p); sys.addProjectile(p);
    }
    if (age > secs + 0.3) { for (const side of sides) side.c.g.removeFromParent(); done(); return false; }
    return true;
  });
}
