// Special moves runtime. Every truck has a light and a heavy move (moves.js); this system runs them as tasks, owns
// the projectiles and hazards they create, and routes every effect on a victim through one place, hit(), which asks
// the mode first (Rumble decides whether a hit may knock a truck out, so a special can never eliminate a truck the
// rolled result says survives).
import * as THREE from 'three';
import { Particles } from '../../fx/particles.js';
import { Sfx } from '../../core/sfx.js';
import { angleDiff, clamp } from '../../core/math.js';
import { MOVES } from './moves.js';

const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
// the sound each kind of hit makes on its victim (explosions, lasers and fire bring their own)
const HIT_SFX = {
  grease: 'splat', oil: 'sizzle', glizzy: 'smack', cheese: 'splat', whiz: 'splat', cactus: 'crunch', roll: 'smack', net: 'wrap',
  soup: 'splash', churro: 'smack', frost: 'freeze', tzatziki: 'splat', butter: 'splat', egg: 'crack', tortilla: 'thwap', wram: 'smack',
  dragon: 'ignite', burnt: 'thwap', beer: 'splash', bottle: 'glass', smash: 'thwap', smoke: null, missile: 'smack', grenade: 'smack', drone: 'smack',
};

export class SpecialSystem {
  constructor(game) {
    this.game = game; this.scene = game.scene; this.fx = game.fx; this.audio = game.audio; this.world = game.world;
    this.glow = new Particles(game.scene, { additive: true, max: 900 });
    this.soft = new Particles(game.scene, { soft: true, max: 1200 }); // clouds: smoke, frost, sugar, dust
    this.flame = new Particles(game.scene, { soft: true, unlit: true, max: 600 }); // fireball bodies
    this.fire = new Particles(game.scene, { flame: true, max: 700 }); // tongues of flame (burning trucks, the dragon's plume)
    this.smoke = new Particles(game.scene, { soft: true, texture: 'billow', max: 360 }); // big rolling smoke
    this.group = new THREE.Group(); game.scene.add(this.group);
    this.tasks = []; this.projectiles = []; this.hazards = []; this.burns = []; this.time = 0;
    this.sfx = new Sfx(game.audio); this.loops = [];
  }
  get billboards() { return [this.soft, this.flame, this.fire, this.smoke]; }
  /** turn the billboards to face this frame's camera (after it has moved) */
  face(camera) { for (const ps of this.billboards) ps.update(0, camera); }
  dispose() { this.scene.remove(this.group); for (const l of this.loops) l.h.stop(); this.loops = []; }

  // ------------------------------------------------------------------ sound
  /** loudness and stereo position of a sound at (x, z) for the current camera */
  hear(x, z, vol = 1) {
    const c = this.game.camera, dx = x - c.position.x, dz = z - c.position.z, d = Math.hypot(dx, dz);
    const k = Math.max(0, 1 - Math.max(0, d - 12) / 85);
    _v.setFromMatrixColumn(c.matrixWorld, 0);
    return [vol * k * k, d > 1 ? (dx * _v.x + dz * _v.z) / d * 0.75 : 0];
  }
  /** play a one-shot sound effect at a spot in the world */
  snd(name, x, z, vol = 1) { if (this.game.audio?.ctx) { const [v, pan] = this.hear(x, z, vol); this.sfx.play(name, v, pan); } }
  /** a sustained sound that follows src() ({x, z}) until stop() */
  sndLoop(name, src, vol = 1) {
    const p = src(), [v, pan] = this.hear(p.x, p.z, vol), h = this.sfx.loop(name, v, pan), l = { h, src, vol };
    this.loops.push(l);
    return { stop: () => { h.stop(); const i = this.loops.indexOf(l); if (i >= 0) this.loops.splice(i, 1); } };
  }

  // ------------------------------------------------------------------ queries
  get trucks() { return this.game.trucks; }
  enemies(tr) { return this.trucks.filter((v) => v !== tr && v.alive && !v.ko && !(v.team && v.team === tr.team)); }
  dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
  /** nearest enemy within range, optionally only those the filter accepts */
  nearest(tr, range = 1e9, filter = null) {
    let best = null, bd = range;
    for (const v of this.enemies(tr)) { const d = this.dist(tr, v); if (d < bd && (!filter || filter(v))) { bd = d; best = v; } }
    return best;
  }
  inFront(tr, v, range, half) { const dx = v.x - tr.x, dz = v.z - tr.z, d = Math.hypot(dx, dz); return d < range && d > 0.1 && Math.abs(angleDiff(tr.heading, Math.atan2(dx, dz))) < half; }
  behind(tr, v, range) { const dx = v.x - tr.x, dz = v.z - tr.z, d = Math.hypot(dx, dz); return d < range && Math.abs(angleDiff(tr.heading, Math.atan2(dx, dz))) > Math.PI * 0.6; }
  /** local direction of a world point relative to a truck: 'front' | 'back' | 'left' (+x side) | 'right' */
  sideOf(tr, x, z) {
    const a = angleDiff(tr.heading, Math.atan2(x - tr.x, z - tr.z));
    return Math.abs(a) < Math.PI / 4 ? 'front' : Math.abs(a) > Math.PI * 0.75 ? 'back' : a > 0 ? 'left' : 'right';
  }
  /** a model-space point on a truck's (sprung) body, in world space */
  worldPoint(tr, p, out = new THREE.Vector3()) { const body = tr.mesh.userData.body; body.updateWorldMatrix(true, false); return body.localToWorld(out.set(p[0], p[1], p[2])); }
  worldDir(tr, d, out = new THREE.Vector3()) { const body = tr.mesh.userData.body; body.updateWorldMatrix(true, false); return out.set(d[0], d[1], d[2]).transformDirection(body.matrixWorld); }
  groundY(x, z) { return this.world.padHeight ? this.world.padHeight(x, z) : 0; }
  near(x, z, r = 110) { const c = this.game.camera.position; return Math.hypot(x - c.x, z - c.z) < r; }
  shake(x, z, amount) { const p = this.game.player; const d = Math.hypot(x - p.x, z - p.z); if (d < 25) this.game.shake(amount * (1 - d / 25)); }
  part(tr, name) { return tr.mesh.userData.parts?.[name] || null; }

  // ------------------------------------------------------------------ moving parts off and back onto a truck
  /** take a part off the truck into the world, keeping where it is on screen */
  detach(obj) {
    obj.updateWorldMatrix(true, false); _m.copy(obj.matrixWorld); _m.decompose(_v, _q, _s);
    obj.userData.home = obj.parent; obj.removeFromParent();
    obj.position.copy(_v); obj.quaternion.copy(_q); obj.scale.copy(_s); this.group.add(obj);
    return obj;
  }
  /** put a part back on its truck at rest and grow it back in */
  regrow(tr, obj, delay = 0, dur = 0.6) {
    const rest = obj.userData.rest || [0, 0, 0];
    const home = obj.userData.home || tr.mesh.userData.body;
    let t = -delay;
    this.task(() => {
      return (dt) => {
        t += dt;
        if (t < 0) { obj.visible = false; return true; }
        if (obj.parent !== home) { obj.removeFromParent(); home.add(obj); obj.position.set(rest[0], rest[1], rest[2]); obj.rotation.set(0, 0, 0); }
        obj.visible = true;
        const k = Math.min(1, t / dur), e = 1 + Math.sin(k * Math.PI) * 0.15 - (1 - k) * (1 - k);
        obj.scale.setScalar(Math.max(0.01, k < 1 ? e * k + (1 - k) * 0.01 : 1));
        return k < 1;
      };
    });
  }

  // ------------------------------------------------------------------ tasks, projectiles, hazards
  /** run a step function every frame until it returns false; factory gets nothing and returns step(dt, t) */
  task(factory, end = null) { const step = factory(); this.tasks.push({ step, end, age: 0 }); return step; }
  after(sec, fn) { let t = 0; this.tasks.push({ step: (dt) => { t += dt; if (t >= sec) { fn(); return false; } return true; } }); }

  /**
   * p: { obj, x, y, z, vx, vy, vz, g, drag, life, r, owner, onHit(v, p), onGround(p), onWall(p), onEnd(p),
   *      face (orient along velocity), spin [x, y, z], trail(p, dt), home: { target, turn, speed }, pierce, ground }
   */
  addProjectile(p) {
    Object.assign(p, { age: 0, hits: new Set() }); p.g ??= 0; p.drag ??= 0; p.life ??= 3; p.r ??= 0.8;
    if (p.obj) { if (!p.obj.parent) this.group.add(p.obj); p.obj.position.set(p.x, p.y, p.z); }
    this.projectiles.push(p); return p;
  }
  /** h: { obj, x, z, r, life, owner, solid, every, grace, onEnter(v, h), update(dt, t, h), onEnd(h) } */
  addHazard(h) {
    Object.assign(h, { age: 0, last: new Map() }); h.every ??= 1.0; h.grace ??= 1.2;
    if (h.obj && !h.obj.parent) this.group.add(h.obj);
    this.hazards.push(h); return h;
  }

  // ------------------------------------------------------------------ effects on victims
  /**
   * Apply a special's effects to a victim. o: { kind, dmg, push [x, z, y] (m/s), spin, freeze, slick, drunk, gum,
   * snare, slow, blind: { kind, secs, amount }, burn (secs), knock (true | 'side'), award, label }.
   */
  hit(att, vic, o = {}) {
    if (!vic || !vic.alive || vic.ko) return;
    const g = this.game, mode = g.mode;
    // a shielded truck (a mode keeping its result on track) is only nudged
    if (o.push) { const k = vic.shielded ? 0.25 : 1; vic.impulse(o.push[0] * vic.mass * k, o.push[1] * vic.mass * k, (o.push[2] || 0) * vic.mass * k); }
    for (const k of ['spin', 'freeze', 'slick', 'drunk', 'gum', 'snare', 'slow', 'stun']) if (o[k]) vic.applyEffect(k, o[k]);
    if (o.freeze) { vic.vx *= 0.1; vic.vz *= 0.1; }
    if (o.snare) { vic.vx *= 0.25; vic.vz *= 0.25; }
    if (o.blind) { vic.applyEffect('blind', o.blind.secs); if (vic.isPlayer) g.hud.splat?.(o.blind.kind, o.blind.amount ?? 1, o.blind.secs); }
    if (o.burn) { const b = this.burns.find((x) => x.vic === vic); if (b) { b.until = this.time + o.burn; b.att = att; } else this.burns.push({ att, vic, until: this.time + o.burn, tick: 0.5 }); }
    let knock = !!o.knock;
    if (o.knock === 'side' && o.push) {
      // only a blow that lands on the flank can roll a truck
      const a = Math.atan2(o.push[0], o.push[1]); knock = Math.abs(Math.sin(angleDiff(vic.heading, a))) > 0.55;
    }
    if (vic.shielded) knock = false;
    if (o.push) { const d = Math.hypot(o.push[0], o.push[1]) || 1; vic.kick(o.push[0] / d, o.push[1] / d, Math.min(25, d)); }
    const sfx = HIT_SFX[o.kind]; if (sfx) this.snd(sfx, vic.x, vic.z, vic.isPlayer ? 1 : 0.85);
    vic.lastHitBy = att; vic.lastHitTime = mode.elapsed ?? g.time;
    mode.onSpecialHit(att, vic, o.kind || 'special', (o.dmg || 0) / 10, { dmg: o.dmg || 0, knock, award: o.award, label: o.label, dir: o.push });
  }

  // ------------------------------------------------------------------ use / bots
  canUse(tr, which) { return tr.alive && !tr.ko && tr.cd[which] <= 0 && !tr.disabled() && !!MOVES[tr.def.id]?.[which] && !(tr._busy?.[which]); }
  use(tr, which) {
    if (!this.canUse(tr, which)) return false;
    const mv = MOVES[tr.def.id][which];
    // a move that needs a part another running move is using waits (e.g. both of Supergyro's open the gyro)
    tr._parts = tr._parts || new Set();
    if (mv.parts && mv.parts.some((p) => tr._parts.has(p))) return false;
    tr.cd[which] = tr.cdMax[which];
    tr._busy = tr._busy || {}; tr._busy[which] = true;
    for (const p of mv.parts || []) tr._parts.add(p);
    const done = () => { tr._busy[which] = false; for (const p of mv.parts || []) tr._parts.delete(p); };
    try { mv.start(this, tr, done); } catch (err) { console.warn('special failed', tr.def.id, which, err); done(); }
    if (tr.isPlayer || this.near(tr.x, tr.z, 60)) this.audio.special();
    tr.events.push({ type: 'special', which });
    if (tr.isPlayer) this.game.hud.toast((which === 'heavy' ? tr.def.heavy : tr.def.light).name.toUpperCase() + '!', 'gold');
    return true;
  }
  /** Should a bot fire a move now? Returns 'light', 'heavy' or null. */
  botWants(tr, dt, aggression = 1) {
    if (tr.disabled() || tr.speed < 3) return null;
    for (const which of ['heavy', 'light']) {
      if (!this.canUse(tr, which)) continue;
      const mv = MOVES[tr.def.id][which];
      if (!(mv.bot ? mv.bot(this, tr) : !!this.nearest(tr, 14))) continue;
      if (Math.random() < (which === 'heavy' ? 0.7 : 1.3) * aggression * dt) return which;
    }
    return null;
  }

  // ------------------------------------------------------------------ hooks from the game
  onTruckHit(a, b, info) { for (const tr of [a, b]) tr._onRam?.(tr === a ? b : a, info); }
  onWall(tr, strength) { tr._onWall?.(strength); }

  update(dt, t) {
    this.time += dt;
    // tasks
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      const k = this.tasks[i]; k.age += dt;
      let alive = false; try { alive = k.step(dt, t, k.age); } catch (err) { console.warn('special task failed', err); }
      if (!alive) { this.tasks.splice(i, 1); k.end?.(); }
    }
    // burning trucks: a lick of damage every half second and flames licking off the roof
    for (let i = this.burns.length - 1; i >= 0; i--) {
      const b = this.burns[i], v = b.vic;
      if (!v.alive || v.ko || this.time > b.until) { this.burns.splice(i, 1); continue; }
      b.tick -= dt; if (b.tick <= 0) { b.tick = 0.5; this.game.mode.onSpecialHit(b.att, v, 'burn', 0.25, { dmg: 2.5, award: 0 }); this.snd('crackle', v.x, v.z, 0.7); }
      if (this.near(v.x, v.z)) {
        // licking tongues of flame off the roof and flanks, embers, and a column of sooty smoke
        const c = Math.cos(v.heading), sn = Math.sin(v.heading);
        this.fire.emit(3, (q) => {
          const lx = (Math.random() - 0.5) * 2.0, lz = (Math.random() - 0.5) * 4.4, top = Math.random() < 0.65;
          q.x = v.x + lx * c + lz * sn; q.z = v.z - lx * sn + lz * c; q.y = v.y + (top ? 2.7 + Math.random() * 0.4 : 1.0 + Math.random() * 1.4);
          q.vx = v.vx * 0.85 + (Math.random() - 0.5) * 1.2; q.vz = v.vz * 0.85 + (Math.random() - 0.5) * 1.2; q.vy = 2.5 + Math.random() * 2.5;
          q.g = -5; q.drag = 0.6; q.size = top ? 0.75 + Math.random() * 0.4 : 0.5 + Math.random() * 0.25; q.grow = -0.4; q.stretch = 1.0 + Math.random() * 0.5; q.life = 0.45 + Math.random() * 0.3; q.alpha = 0.95;
        });
        if (Math.random() < 0.5) this.glow.emit(1, (q) => { q.x = v.x + (Math.random() - 0.5) * 2; q.y = v.y + 2.8; q.z = v.z + (Math.random() - 0.5) * 3.5; q.vx = v.vx * 0.8 + (Math.random() - 0.5) * 2; q.vz = v.vz * 0.8 + (Math.random() - 0.5) * 2; q.vy = 4 + Math.random() * 3; q.g = 1; q.size = 0.06; q.life = 0.8; q.color = 0xffb02a; });
        if (Math.random() < 0.18) this.smoke.emit(1, (q) => { q.x = v.x + (Math.random() - 0.5); q.y = v.y + 4.2; q.z = v.z + (Math.random() - 0.5); q.vx = v.vx * 0.5; q.vz = v.vz * 0.5; q.vy = 2.5; q.g = 0; q.drag = 0.8; q.size = 0.8; q.grow = 1.1; q.life = 1.4; q.alpha = 0.35; q.color = 0x4a4541; });
      }
    }
    // projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]; p.age += dt;
      if (p.home?.target) {
        const tg = p.home.target;
        if (!tg.alive || tg.ko) p.home.target = this.nearest(p.owner, 80) || null;
        else {
          const want = new THREE.Vector3(tg.x - p.x, (tg.y + (p.home.alt?.(p) ?? 1.5)) - p.y, tg.z - p.z).normalize().multiplyScalar(p.home.speed);
          const k = Math.min(1, p.home.turn * dt); p.vx += (want.x - p.vx) * k; p.vy += (want.y - p.vy) * k; p.vz += (want.z - p.vz) * k;
        }
      }
      p.vy -= p.g * dt;
      if (p.drag) { const d = Math.exp(-p.drag * dt); p.vx *= d; p.vz *= d; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.obj) {
        p.obj.position.set(p.x, p.y, p.z);
        if (p.face) p.obj.lookAt(p.x + p.vx, p.y + p.vy, p.z + p.vz);
        if (p.spin) { p.obj.rotation.x += p.spin[0] * dt; p.obj.rotation.y += p.spin[1] * dt; p.obj.rotation.z += p.spin[2] * dt; }
      }
      p.trail?.(p, dt);
      let dead = p.age >= p.life;
      const gy = this.groundY(p.x, p.z);
      if (!dead && p.y <= gy + (p.groundR ?? 0.15)) { if (p.onGround) dead = p.onGround(p) !== false; else dead = true; if (!dead) { p.y = gy + (p.groundR ?? 0.15); } }
      if (!dead && p.walls !== false && p.y < 6) { const c = this.world.circleContacts(p.x, p.z, 0.35, []); if (c.some((ct) => p.y < (ct.box.height || 10))) { dead = true; p.onWall?.(p); } }
      if (!dead) for (const v of this.trucks) {
        if (v === p.owner || !v.alive || v.ko || p.hits.has(v) || (v.team && p.owner?.team === v.team)) continue;
        // point vs the truck's box (local frame), height up to the roof
        const dx = p.x - v.x, dz = p.z - v.z, c = Math.cos(v.heading), s = Math.sin(v.heading);
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        if (Math.abs(lx) > v.hw + p.r || Math.abs(lz) > v.hl + p.r || p.y < v.y - p.r || p.y > v.y + 3.4 + p.r) continue;
        p.hits.add(v);
        const consumed = p.onHit ? p.onHit(v, p) !== false : true;
        if (consumed && !p.pierce) { dead = true; break; }
      }
      if (dead) { p.onEnd?.(p); if (p.obj && !p.keep) p.obj.removeFromParent(); this.projectiles.splice(i, 1); }
    }
    // hazards
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i]; h.age += dt;
      h.update?.(dt, t, h);
      if (!h.dead) for (const v of this.trucks) {
        if (!v.alive || v.ko) continue;
        if (v === h.owner && (h.age < h.grace || h.ownerSafe)) continue;
        if (h.ground !== false && v.airborne && v.y - this.groundY(v.x, v.z) > 1) continue;
        const dx = v.x - h.x, dz = v.z - h.z, d = Math.hypot(dx, dz), reach = h.r + (h.solid ? 1.4 : 1.0);
        if (d > reach) continue;
        if (h.solid && d > 0.01) {
          // a solid obstacle: push the truck back out and kill its speed into it
          const nx = dx / d, nz = dz / d, over = reach - d; v.x += nx * over; v.z += nz * over;
          const vn = v.vx * nx + v.vz * nz; if (vn < 0) { v.vx -= nx * vn * 1.3; v.vz -= nz * vn * 1.3; }
        }
        const last = h.last.get(v) ?? -99; if (h.age - last < h.every) continue;
        h.last.set(v, h.age);
        h.onEnter?.(v, h);
        if (h.dead) break;
      }
      if (h.dead || h.age >= h.life) { h.onEnd?.(h); if (h.obj && !h.keep) h.obj.removeFromParent(); this.hazards.splice(i, 1); }
    }
    this.glow.update(dt);
    for (const ps of this.billboards) ps.update(dt, this.game.camera);
    for (const l of this.loops) { const p = l.src(); const [v, pan] = this.hear(p.x, p.z, l.vol); l.h.set(v, pan); }
  }
}
