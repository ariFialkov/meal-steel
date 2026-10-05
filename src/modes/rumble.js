// Rumble: 5-12 trucks, a ring, a clock. Points for hits, ring-outs, serving customers, pickups and specials.
// Every truck has HP: big hits, aerial smashes, crashes and leaving the ring hurt; HP slowly comes back (up to 15% of
// the total per recovery). At 0 HP a truck is knocked out and disqualified however many points it has.
//
// The director decides before the match how many trucks get knocked out and in which order (always the worst-ranked
// first), keeps every other truck above a hidden HP floor, and makes the slated trucks fair game (and hunted) only
// once their time comes, so the final standings match the pre-rolled placement.
import * as THREE from 'three';
import { Mode } from './base.js';
import { scatterOpenProps } from '../world/city.js';
import { BotDriver } from '../ai/bot.js';
import { servingSpot, ringMarker, coinMesh, couponMesh, jumpRamp } from '../world/setpieces.js';
import { ServeQueue } from './serving.js';
import { clamp, fmtTime, ordinal, noise1, angleDiff } from '../core/math.js';

const MAX_HP = 100, REGEN_DELAY = 2.5, REGEN_RATE = 4, REGEN_CAP = 15, OUT_OF_RING_DPS = 6;

export class RumbleMode extends Mode {
  setup() {
    const g = this.game, plan = g.plan, rng = this.rng;
    this.ring = plan.ring; this.timeLeft = g.params.time; this.total = g.params.time;
    // jump ramps around the inner ring, pointing roughly at the middle of the action
    this.ramps = [];
    const nR = 3, a0 = rng.range(0, Math.PI * 2);
    for (let k = 0; k < nR; k++) {
      const a = a0 + (k / nR) * Math.PI * 2, rad = this.ring.r * rng.range(0.42, 0.52);
      const cx = this.ring.x + Math.cos(a) * rad, cz = this.ring.z + Math.sin(a) * rad;
      const yaw = Math.atan2(this.ring.x - cx, this.ring.z - cz) + rng.range(-0.5, 0.5);
      const r = g.world.addRamp(cx, cz, yaw, 10, 6, 3.2);
      this.ramps.push(r); g.scene.add(jumpRamp(r));
    }
    scatterOpenProps(g.props, plan, rng, 44, this.ramps.map((r) => ({ x: r.cx, z: r.cz, r: 9 })).concat([{ x: this.ring.x, z: this.ring.z, r: 8 }]));
    g.scene.add(ringMarker(this.ring.x, this.ring.z, this.ring.r));
    // trucks in a ring facing centre
    const n = this.trucks.length, order = rng.shuffle(this.trucks);
    order.forEach((tr, i) => {
      const a = (i / n) * Math.PI * 2;
      tr.place(this.ring.x + Math.cos(a) * 34, this.ring.z + Math.sin(a) * 34, Math.atan2(-Math.cos(a), -Math.sin(a)));
      Object.assign(tr, { score: 0, outOfRing: false, outTime: 0, hp: MAX_HP, ko: false, lastDmg: -99, regenLeft: 0 });
    });
    // director: score ranks
    const place = g.outcome.place;
    const bots = rng.shuffle(this.bots);
    this.drivers = new Map();
    bots.forEach((b, i) => {
      b.targetRank = i + 1 < place ? i + 1 : i + 2;
      b.state = 'cruise'; b.stateT = rng.range(0, 2); b.target = null; b.noiseSeed = rng.range(0, 1000);
      b.hunger = 1; b.boostMul = 1;
      this.drivers.set(b.id, new BotDriver(b, rng));
    });
    this.player.targetRank = place;
    // director: knockouts. Never more than the unpaid places; fewer in short matches.
    const paid = g.params.winners.length, cap = Math.floor(n * (this.total <= 30 ? 0.3 : 0.5));
    const K = clamp(rng.int(Math.round(n * 0.15), Math.min(n - paid, cap)), 0, n - paid);
    const slated = this.trucks.filter((tr) => tr.targetRank > n - K).sort((a, b) => b.targetRank - a.targetRank); // worst first
    slated.forEach((tr, i) => { tr.koAt = this.total * (0.3 + 0.6 * (i + 1) / (K + 1)) + rng.range(-2, 2); });
    for (const tr of this.trucks) { tr.slatedKO = tr.koAt !== undefined; tr.floorHp = tr.isPlayer ? 6 : rng.range(4, 18); }
    this.knockouts = K;
    // spots & items
    this.spots = []; this.items = []; this.spotGroup = new THREE.Group(); g.scene.add(this.spotGroup);
    this.spotTimer = 0; this.itemTimer = 0;
    for (let i = 0; i < 3; i++) this.spawnSpot();
    for (let i = 0; i < 4; i++) this.spawnItem();
    this.buildHpBars();
    this.playerKoAt = null;
  }

  // ------------------------------------------------------------------ HP
  buildHpBars() {
    const back = new THREE.SpriteMaterial({ color: 0x22304a, depthWrite: false });
    for (const tr of this.trucks) {
      const W = 3.2, bg = new THREE.Sprite(back), fill = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x3fd46f, depthWrite: false }));
      bg.scale.set(W + 0.25, 0.42, 1); fill.scale.set(W, 0.26, 1); fill.renderOrder = 2; bg.renderOrder = 1;
      this.game.scene.add(bg, fill); tr.hpBar = { bg, fill, W };
    }
  }
  updateHpBars() {
    for (const tr of this.trucks) {
      const { bg, fill, W } = tr.hpBar, x = tr.rx ?? tr.x, z = tr.rz ?? tr.z, y = (tr.ry ?? tr.y) + (tr.flipped ? 3.2 : 5.3);
      const k = clamp(tr.hp / MAX_HP, 0, 1), w = Math.max(0.001, W * k);
      bg.visible = fill.visible = !tr.ko; if (tr.ko) continue;
      bg.position.set(x, y, z); fill.position.set(x, y, z);
      fill.scale.x = w; fill.center.x = W / (2 * w);
      fill.material.color.setHex(k > 0.55 ? 0x3fd46f : k > 0.25 ? 0xffd626 : 0xff4d57);
    }
  }
  /** Can this truck be knocked out right now? Only trucks slated for it, and only once their time has come. */
  vulnerable(tr) { return tr.slatedKO && this.elapsed >= tr.koAt; }
  damage(tr, amount, src, how = '') {
    if (tr.ko || this.finished || amount <= 0) return;
    const hunted = tr.slatedKO && this.elapsed > tr.koAt - 6;
    amount *= hunted ? 1.7 : 1;
    const floor = this.vulnerable(tr) ? 0 : tr.slatedKO ? 12 : tr.floorHp;
    tr.hp = Math.max(floor, tr.hp - amount);
    tr.lastDmg = this.elapsed; tr.regenLeft = REGEN_CAP;
    if (tr.hp <= 0) this.knockout(tr, src, how);
  }
  knockout(tr, src, how) {
    const g = this.game;
    tr.ko = true; tr.hp = 0; tr.koTime = this.elapsed;
    tr.applyEffect('stun', 1e6); tr.control.throttle = 0; tr.control.steer = 0;
    g.fx.smoke(tr.x, tr.y + 2, tr.z, 22, 0x333333, 1.4); g.fx.sparks(tr.x, tr.y + 1.5, tr.z, 24, 0xff7a1a); g.fx.ring(tr.x, 1, tr.z, 0xff4d57, 7);
    if (how === 'flip') tr.tumble(Math.random() < 0.5 ? -1 : 1, true);
    if (src && !src.ko) this.award(src, how === 'flip' ? 80 : 50, how === 'flip' ? 'PILEDRIVER!' : 'KNOCKOUT!', 'gold');
    if (tr.isPlayer) { g.hud.announce('KNOCKED OUT!'); g.audio.crash(); this.playerKoAt = this.elapsed; }
    else { g.hud.toast(`${tr.name} KNOCKED OUT`, src?.isPlayer ? 'gold' : ''); if (g.near(tr)) g.audio.crash(); }
  }
  updateHp(dt) {
    const g = this.game;
    for (const tr of this.trucks) {
      if (tr.ko) { if (Math.random() < 0.35) g.fx.smoke(tr.x, tr.y + (tr.flipped ? 1 : 2.4), tr.z, 1, 0x3a3a3a, 1.1); continue; }
      if (!this.inRing(tr)) this.damage(tr, OUT_OF_RING_DPS * dt, null);
      else if (this.elapsed - tr.lastDmg > REGEN_DELAY && tr.regenLeft > 0 && tr.hp < MAX_HP) {
        const h = Math.min(REGEN_RATE * dt, tr.regenLeft, MAX_HP - tr.hp); tr.hp += h; tr.regenLeft -= h;
      }
      // deadline: a slated truck that has dodged everything for too long blows its engine
      if (tr.slatedKO && (this.elapsed > tr.koAt + 14 || this.timeLeft < 2.5)) {
        g.hud.toast(tr.isPlayer ? 'ENGINE BLOWN!' : `${tr.name}: ENGINE BLOWN!`, 'bad');
        tr.hp = 0; this.knockout(tr, tr.lastHitBy && this.elapsed - tr.lastHitTime < 4 ? tr.lastHitBy : null, 'engine');
      }
    }
  }

  // ------------------------------------------------------------------ spots and items
  spawnSpot() {
    const rng = this.rng, R = this.ring;
    let a, x, z, tries = 0;
    do { a = rng.range(0, Math.PI * 2); x = R.x + Math.cos(a) * (R.r - 7); z = R.z + Math.sin(a) * (R.r - 7); tries++; }
    while (tries < 20 && this.spots.some((s) => Math.hypot(s.x - x, s.z - z) < 25));
    const { group: grp, pad } = servingSpot(rng);
    grp.position.set(x, 0, z); grp.rotation.y = a + Math.PI / 2; grp.scale.setScalar(0.01);
    this.spotGroup.add(grp);
    const queue = new ServeQueue(grp, rng); queue.onPuff = (wx, wy, wz) => this.game.fx.smoke(wx, wy, wz, 1, 0x8a8a8a, 0.16);
    this.spots.push({ x, z, mesh: grp, life: this.rng.range(20, 28), age: 0, occupant: null, occupiedT: 0, pad, queue });
  }
  spawnItem() {
    const rng = this.rng, R = this.ring;
    let x, z, tries = 0;
    do { const a = rng.range(0, Math.PI * 2), r = rng.range(8, R.r - 10); x = R.x + Math.cos(a) * r; z = R.z + Math.sin(a) * r; tries++; }
    while (tries < 12 && this.ramps.some((q) => Math.hypot(q.cx - x, q.cz - z) < 8));
    const coupon = rng.chance(0.3);
    const mesh = coupon ? couponMesh() : coinMesh();
    mesh.position.set(x, 1.4, z);
    this.game.scene.add(mesh);
    this.items.push({ x, z, mesh, coupon, value: coupon ? 30 : 15 });
  }

  award(tr, pts, label, cls = 'good') {
    if (pts <= 0 || tr.ko) return;
    const v = Math.round(pts * (tr.isPlayer ? 1 : tr.hunger));
    if (v <= 0) return;
    tr.score += v;
    if (tr.isPlayer) this.game.hud.toast(`+${v} ${label}`, cls);
  }
  inRing(tr) { return Math.hypot(tr.x - this.ring.x, tr.z - this.ring.z) < this.ring.r; }

  // ------------------------------------------------------------------ hits
  onTruckHit(att, vic, info) {
    if (this.finished) return;
    // whoever comes down from the air is the attacker
    const air = (a, b) => a.airborne && a.y - b.y > 0.5;
    if (air(vic, att)) [att, vic] = [vic, att];
    const aerial = air(att, vic), s = info.strength;
    if (s < 3 || att.ko && vic.ko) return;
    const base = s * 1.5 * Math.sqrt(att.mass / vic.mass) * (aerial ? 2.4 : 1);
    if (aerial && s > 13 && this.vulnerable(vic) && vic.hp - base <= 0) {
      this.damage(vic, base, att, 'flip');
      if (!vic.ko) { vic.hp = 0; this.knockout(vic, att, 'flip'); }
    } else {
      this.damage(vic, base, att);
      if (aerial && s > 11 && !vic.ko) { vic.tumble(Math.random() < 0.5 ? -1 : 1, false); vic.impulse(0, 0, 6 * vic.mass); }
    }
    if (!aerial) this.damage(att, base * 0.15, null);
    if (aerial) { this.award(att, 40, 'AERIAL SMASH!', 'gold'); if (att.isPlayer || vic.isPlayer) this.game.shake(1.2); }
    else { const big = s > 11; this.award(att, big ? 25 : Math.round(5 + s), big ? 'BIG HIT' : 'HIT', big ? 'gold' : 'good'); }
    if (vic.isPlayer && base > 14) this.game.hud.toast(`-${Math.round(base)} HP`, 'bad');
  }
  onSpecialHit(att, vic, kind, strength) { if (this.finished) return; this.damage(vic, 10 * strength, att); this.award(att, 20, 'SPECIAL HIT', 'gold'); }
  onWallHit(tr, strength) { this.damage(tr, Math.max(0, strength - 0.8) * 9, tr.lastHitBy && this.elapsed - tr.lastHitTime < 2 ? tr.lastHitBy : null); }
  onPropHit(tr, prop, how, strength) {
    if (this.finished) return;
    if (how === 'smash' && this.inRing(tr)) this.award(tr, 3, 'SMASH');
    if (how === 'totaled') {
      const by = tr.lastHitBy && this.elapsed - tr.lastHitTime < 2.5 ? tr.lastHitBy : null;
      this.damage(tr, 18, by);
      if (by) this.award(by, 30, 'CRASH!', 'gold');
    }
  }

  // ------------------------------------------------------------------ loop
  update(dt, t) {
    super.update(dt, t);
    const g = this.game;
    this.updateHpBars();
    if (this.finished) { for (const s of this.spots) s.queue.update(dt, t, false, () => {}); for (const b of this.bots) this.drivers.get(b.id).stop(dt); return; }
    this.timeLeft -= dt;
    // ring-outs
    for (const tr of this.trucks) {
      if (tr.ko) continue;
      const inside = this.inRing(tr);
      if (!inside && !tr.outOfRing) {
        tr.outOfRing = true; tr.outTime = this.elapsed;
        if (tr.lastHitBy && this.elapsed - tr.lastHitTime < 3) { this.award(tr.lastHitBy, 40, 'RING OUT!', 'gold'); if (tr.isPlayer) g.hud.toast('KNOCKED OUT OF THE RING!', 'bad'); g.fx.ring(tr.x, 1, tr.z, 0xffb02a, 6); }
        else if (tr.isPlayer) g.hud.toast('BACK IN THE RING! LOSING HP', 'bad');
      } else if (inside && tr.outOfRing) tr.outOfRing = false;
    }
    this.updateHp(dt);
    // spots
    for (let i = this.spots.length - 1; i >= 0; i--) {
      const s = this.spots[i]; s.age += dt;
      const sc = s.age < 0.6 ? s.age / 0.6 : s.age > s.life - 0.6 ? Math.max(0.01, (s.life - s.age) / 0.6) : 1;
      s.mesh.scale.setScalar(sc);
      let occ = null, bd = 1e9;
      for (const tr of this.trucks) { if (tr.ko) continue; const d = Math.hypot(tr.x - s.x, tr.z - s.z); if (d < 3.4 && tr.speed < 5 && d < bd) { bd = d; occ = tr; } }
      if (occ !== s.occupant) {
        // the truck that was serving got smashed off the spot: the customers run for their lives
        const prev = s.occupant;
        if (prev && s.occupiedT > 0.8 && prev.lastHitBy && prev.lastHitBy !== prev && this.elapsed - prev.lastHitTime < 1.5) {
          s.queue.panic(); g.audio.hit?.(0.5);
          if (prev.isPlayer) g.hud.toast('CUSTOMERS SCATTERED!', 'bad'); else if (prev.lastHitBy.isPlayer) g.hud.toast('LUNCH RUSH RUINED!', 'gold');
        }
        s.occupant = occ; s.occupiedT = 0; s.pad.material.color.set(occ ? occ.def.body : 0x3aa9ff);
      }
      if (occ) s.occupiedT += dt;
      // points come from each customer served: the queue calls back when food is handed over
      s.queue.update(dt, t, !!occ && s.occupiedT > 0.8, () => {
        this.award(occ, 22, 'SERVED!');
        g.fx.emit(4, (q) => { q.x = s.x + (Math.random() - 0.5) * 3; q.y = 2.5; q.z = s.z + (Math.random() - 0.5) * 3; q.vy = 4; q.g = 2; q.size = 0.4; q.life = 0.7; q.color = 0xffd166; });
        if (occ.isPlayer) g.audio.coin();
      });
      if (s.age >= s.life) { s.queue.dispose(); this.spotGroup.remove(s.mesh); this.spots.splice(i, 1); this.spawnSpot(); }
    }
    // items
    this.itemTimer += dt;
    if (this.itemTimer > 4 && this.items.length < 6) { this.itemTimer = 0; this.spawnItem(); }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]; it.mesh.rotation.y += dt * 2.4; it.mesh.position.y = 1.4 + Math.sin(t * 3 + i) * 0.3;
      for (const tr of this.trucks) {
        if (tr.ko) continue;
        if (Math.hypot(tr.x - it.x, tr.z - it.z) < 2.8) { this.award(tr, it.value, it.coupon ? 'COUPON' : 'COIN'); if (tr.isPlayer) g.audio.coin(); g.fx.sparks(it.x, 1.5, it.z, 10, it.coupon ? 0x3ad17c : 0xffd166); g.scene.remove(it.mesh); this.items.splice(i, 1); break; }
      }
    }
    this.directBots(dt, t);
    if (this.timeLeft <= 0 || (this.playerKoAt !== null && this.elapsed - this.playerKoAt > 3.5)) this.endMatch();
  }

  directBots(dt, t) {
    const g = this.game, p = this.player, place = g.outcome.place, prog = 1 - this.timeLeft / this.total;
    for (const b of this.bots) {
      const drv = this.drivers.get(b.id);
      if (b.ko) { drv.stop(dt); continue; }
      // desired score relative to the player
      const k = b.targetRank < place ? place - b.targetRank : b.targetRank - place;
      const wander = noise1(t * 0.1 + b.noiseSeed) * 40 * (1 - prog);
      let desired;
      if (b.targetRank < place) desired = p.score + 30 + k * 30 + wander;
      else desired = Math.max(0, p.score * Math.max(0.1, 1 - k * 0.09) - 15 - k * 6 + wander * 0.4);
      desired *= (0.25 + 0.75 * prog);
      const need = desired - b.score;
      b.hunger = clamp(1 + need / 60, b.targetRank < place ? 0.6 : 0, 3.2);
      if (b.targetRank < place && this.timeLeft < 25 && this.timeLeft > 0.5 && !p.ko) {
        const finalNeed = (p.score + 12 + (place - b.targetRank) * 14) - b.score;
        if (finalNeed > 0) { b._surge = (b._surge || 0) + finalNeed * dt / this.timeLeft; if (b._surge >= 1) { const add = Math.floor(b._surge); b._surge -= add; b.score += add; } }
      }
      if (b.targetRank > place && b.score >= desired + 10) b.hunger = 0;
      b.stateT -= dt;
      const inside = this.inRing(b);
      if (!inside) { drv.drive(this.ring.x, this.ring.z, 1.0, dt, t, { world: g.world, avoidTrucks: this.trucks }); continue; }
      if (b.stateT <= 0 || (b.target && (b.target.ko || b.target.alive === false))) this.pickState(b, need);
      let tx = this.ring.x, tz = this.ring.z, sf = 0.8, aggressive = false, turbo = false;
      if (b.state === 'hunt' && b.target) {
        const v = b.target; const lead = Math.min(1.2, Math.hypot(v.x - b.x, v.z - b.z) / 25);
        tx = v.x + v.vx * lead; tz = v.z + v.vz * lead; sf = 1.3; aggressive = true; turbo = true;
        if (Math.hypot(v.x - b.x, v.z - b.z) < 6 && b.speed > 10 && b.turboCd <= 0) b.control.turbo = true;
      } else if (b.state === 'jump' && b.target) {
        // line up behind a ramp, then floor it off the lip
        const r = b.target, sx = r.cx - r.ux * (r.len / 2), sz = r.cz - r.uz * (r.len / 2);
        if (b.jumpPhase !== 'run') {
          const ex = sx - r.ux * 16, ez = sz - r.uz * 16; tx = ex; tz = ez; sf = 0.9;
          if (Math.hypot(ex - b.x, ez - b.z) < 5) b.jumpPhase = 'run';
        } else {
          tx = r.cx + r.ux * 30; tz = r.cz + r.uz * 30; sf = 1.4; aggressive = true; turbo = true;
          if (Math.abs(angleDiff(b.heading, Math.atan2(r.ux, r.uz))) < 0.3 && b.turboCd <= 0 && Math.hypot(sx - b.x, sz - b.z) < 12) b.control.turbo = true;
          if (b.airborne) b.wasAir = true;
          if (b.wasAir && !b.airborne) { b.stateT = 0; b.wasAir = false; }
        }
      } else if (b.state === 'park' && b.target) {
        tx = b.target.x; tz = b.target.z; const d = Math.hypot(tx - b.x, tz - b.z);
        sf = d < 6 ? 0.05 : 0.9;
        if (b.target.occupant && b.target.occupant !== b && d < 12) { aggressive = true; sf = 1.2; tx = b.target.occupant.x; tz = b.target.occupant.z; }
        if (!this.spots.includes(b.target)) b.stateT = 0;
      } else if (b.state === 'collect' && b.target) {
        tx = b.target.x; tz = b.target.z; sf = 1.1; if (!this.items.includes(b.target)) b.stateT = 0;
      } else {
        const a = t * 0.25 + b.noiseSeed, r = this.ring.r * 0.55;
        tx = this.ring.x + Math.cos(a) * r; tz = this.ring.z + Math.sin(a) * r; sf = 0.7;
      }
      drv.drive(tx, tz, sf, dt, t, { world: g.world, avoidTrucks: aggressive ? null : this.trucks, aggressive, turbo });
      if (g.specials.botWants(b, this.trucks.filter((v) => !v.ko), dt, b.hunger > 1 ? 1.5 : 0.4)) b.control.special = true;
    }
  }
  autopilot(dt, t) {
    const p = this.player, g = this.game;
    if (p.ko) return;
    if (!this.inRing(p)) { this.playerDriver().drive(this.ring.x, this.ring.z, 1, dt, t, { world: g.world }); return; }
    if (!p._apT || p._apT < t || (p._apTarget && p._apTarget.ko)) { p._apT = t + 4; p._apTarget = this.rng.chance(0.5) ? this.rng.pick(this.bots.filter((b) => !b.ko).concat([this.bots[0]])) : (this.spots[0] || this.bots[0]); }
    const tg = p._apTarget; const spotMode = !tg.def; const d = Math.hypot(tg.x - p.x, tg.z - p.z);
    this.playerDriver().drive(tg.x, tg.z, spotMode && d < 6 ? 0.05 : 1.2, dt, t, { world: g.world, aggressive: true, turbo: true });
    if (g.specials.botWants(p, this.trucks, dt, 1)) g.specials.use(p, this.trucks, (a, v, k, s) => this.onSpecialHit(a, v, k, s));
  }
  pickState(b, need) {
    const rng = this.rng, alive = this.trucks.filter((v) => v !== b && !v.ko);
    b.jumpPhase = null; b.wasAir = false;
    // trucks whose time has come are hunted first
    const prey = alive.filter((v) => v.slatedKO && this.elapsed > v.koAt - 8);
    if (prey.length && rng.chance(0.65)) {
      let best = null, bd = 1e9; for (const v of prey) { const d = Math.hypot(v.x - b.x, v.z - b.z); if (d < bd) { bd = d; best = v; } }
      b.state = 'hunt'; b.target = best; b.stateT = rng.range(4, 7); return;
    }
    const hungry = need > 0, r = rng.next();
    if (hungry) {
      if (r < 0.15 && this.ramps.length) { b.state = 'jump'; b.target = rng.pick(this.ramps); b.stateT = rng.range(7, 10); }
      else if (r < 0.55) {
        let best = null, bd = 1e9;
        for (const v of alive) { let d = Math.hypot(v.x - b.x, v.z - b.z); if (v.isPlayer && v.score > b.score) d *= 0.6; if (d < bd) { bd = d; best = v; } }
        b.state = 'hunt'; b.target = best; b.stateT = rng.range(3, 6);
      } else if (r < 0.82 && this.spots.length) { b.state = 'park'; b.target = rng.pick(this.spots); b.stateT = rng.range(6, 10); }
      else if (this.items.length) { b.state = 'collect'; b.target = rng.pick(this.items); b.stateT = rng.range(3, 5); }
      else { b.state = 'cruise'; b.stateT = rng.range(2, 4); }
    } else {
      if (r < 0.7) { b.state = 'cruise'; b.stateT = rng.range(3, 5); }
      else if (r < 0.8 && this.ramps.length) { b.state = 'jump'; b.target = rng.pick(this.ramps); b.stateT = rng.range(7, 10); }
      else { let best = null, bd = 1e9; for (const v of alive) { if (v.isPlayer) continue; const d = Math.hypot(v.x - b.x, v.z - b.z); if (d < bd) { bd = d; best = v; } } b.state = 'hunt'; b.target = best; b.stateT = rng.range(2, 4); }
    }
  }

  endMatch() {
    const g = this.game, p = this.player, place = g.outcome.place;
    // any truck slated for a knockout that is somehow still running is out at the buzzer
    for (const tr of this.trucks) if (tr.slatedKO && !tr.ko) { tr.hp = 0; this.knockout(tr, null, 'engine'); }
    const rank = (tr) => (tr.isPlayer ? place : tr.targetRank);
    // final tally among survivors: scores follow the rolled order, with visible "tips" bonuses
    const survivors = this.trucks.filter((tr) => !tr.ko).sort((a, b) => rank(a) - rank(b));
    const anchor = survivors.includes(p) ? survivors.indexOf(p) : 0;
    for (let i = anchor - 1; i >= 0; i--) { const need = survivors[i + 1].score + 5 + Math.round(this.rng.range(3, 20)); if (survivors[i].score < need) survivors[i].score = need; }
    for (let i = anchor + 1; i < survivors.length; i++) { const cap = Math.max(0, survivors[i - 1].score - 1 - Math.round(this.rng.range(0, 12))); if (survivors[i].score > cap) survivors[i].score = cap; }
    const kod = this.trucks.filter((tr) => tr.ko).sort((a, b) => rank(a) - rank(b));
    const ranking = [...survivors, ...kod];
    ranking.forEach((r, i) => { r.finishPlace = i + 1; });
    if (p.finishPlace !== place) console.warn('rumble ranking mismatch', p.finishPlace, place);
    g.hud.announce(p.ko ? 'DISQUALIFIED' : 'TIME!');
    if (!p.ko) g.hud.toast('FINAL TALLY · TIPS COUNTED', 'gold');
    if (place === 1) { g.audio.fanfare(); g.fx.confetti(p.x, 6, p.z, 160, 10); } else g.audio.sad();
    this.finish(place, ranking.map((r) => ({ truck: r, place: r.finishPlace, score: r.ko ? `KO · ${r.score} pts` : r.score + ' pts' })), 4);
  }
  hud() {
    const sorted = this.trucks.slice().sort((a, b) => (a.ko - b.ko) || (b.score - a.score));
    const rows = sorted.map((tr, i) => ({ name: tr.name, color: this.colorOf(tr), you: tr.isPlayer, score: tr.ko ? 'KO' : tr.score, pos: i + 1, out: tr.ko, hp: tr.ko ? null : tr.hp / MAX_HP }));
    const myPos = sorted.indexOf(this.player) + 1, p = this.player;
    return {
      rows: rows.slice(0, 8).concat(myPos > 8 ? [rows[myPos - 1]] : []), timer: fmtTime(this.timeLeft), hp: p.ko ? 0 : p.hp / MAX_HP,
      sub: p.ko ? 'KNOCKED OUT · DISQUALIFIED' : `${ordinal(myPos)} · ${p.score} pts${p.outOfRing ? ' · OUT OF RING' : ''}`,
    };
  }
  drawMinimap(ctx, size) {
    const m = this.mapper(this.ring.x, this.ring.z, this.ring.r + 30, size);
    const [cx, cy] = m(this.ring.x, this.ring.z);
    ctx.beginPath(); ctx.arc(cx, cy, (this.ring.r / (this.ring.r + 30)) * size / 2, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,176,42,0.8)'; ctx.lineWidth = 2; ctx.stroke();
    for (const r of this.ramps) { const [px, py] = m(r.cx, r.cz); ctx.save(); ctx.translate(px, py); ctx.rotate(-Math.atan2(r.ux, r.uz) + Math.PI); ctx.fillStyle = '#ff4d57'; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(5, 5); ctx.lineTo(-5, 5); ctx.fill(); ctx.restore(); }
    for (const s of this.spots) { const [px, py] = m(s.x, s.z); ctx.fillStyle = '#3aa9ff'; ctx.fillRect(px - 4, py - 4, 8, 8); }
    for (const it of this.items) { const [px, py] = m(it.x, it.z); this.dot(ctx, px, py, it.coupon ? '#3ad17c' : '#ffd166', 2.5); }
    for (const tr of this.trucks) { if (tr.isPlayer) continue; const [px, py] = m(tr.x, tr.z); this.dot(ctx, px, py, tr.ko ? '#555' : this.colorOf(tr), 3.5); }
    const [px, py] = m(this.player.x, this.player.z); this.dot(ctx, px, py, '#ffb02a', 5, true);
  }
}
