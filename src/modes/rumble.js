// Rumble: 12 trucks, a ring, a clock. Points for hits, knockouts, parking/serving, pickups and specials.
import * as THREE from 'three';
import { Mode } from './base.js';
import { scatterOpenProps } from '../world/city.js';
import { BotDriver } from '../ai/bot.js';
import { clamp, fmtTime, ordinal, noise1 } from '../core/math.js';

export class RumbleMode extends Mode {
  setup() {
    const g = this.game, plan = g.plan, rng = this.rng;
    this.ring = plan.ring; this.timeLeft = g.params.time; this.total = g.params.time;
    scatterOpenProps(g.props, plan, rng, 44);
    // ring marker on the ground
    const ringMesh = new THREE.Mesh(new THREE.RingGeometry(this.ring.r - 0.6, this.ring.r + 0.6, 64), new THREE.MeshBasicMaterial({ color: 0xffb02a, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ringMesh.rotation.x = -Math.PI / 2; ringMesh.position.set(this.ring.x, 0.25, this.ring.z); g.scene.add(ringMesh);
    // trucks in a ring facing centre
    const n = this.trucks.length, order = rng.shuffle(this.trucks);
    order.forEach((tr, i) => { const a = (i / n) * Math.PI * 2; tr.place(this.ring.x + Math.cos(a) * 34, this.ring.z + Math.sin(a) * 34, Math.atan2(-Math.cos(a), -Math.sin(a))); tr.score = 0; tr.outOfRing = false; tr.outTime = 0; });
    // director: ranks
    const place = g.outcome.place;
    const bots = rng.shuffle(this.bots);
    this.drivers = new Map();
    bots.forEach((b, i) => {
      b.targetRank = i + 1 < place ? i + 1 : i + 2;
      b.state = 'cruise'; b.stateT = rng.range(0, 2); b.target = null; b.noiseSeed = rng.range(0, 1000);
      b.hunger = 1; b.boostMul = 1;
      this.drivers.set(b.id, new BotDriver(b, rng));
    });
    // spots & items
    this.spots = []; this.items = []; this.spotGroup = new THREE.Group(); g.scene.add(this.spotGroup);
    this.spotTimer = 0; this.itemTimer = 0;
    for (let i = 0; i < 3; i++) this.spawnSpot();
    for (let i = 0; i < 4; i++) this.spawnItem();
    this.serveToastT = 0; this.tallied = false;
  }

  spawnSpot() {
    const rng = this.rng, R = this.ring;
    let a, x, z, tries = 0;
    do { a = rng.range(0, Math.PI * 2); x = R.x + Math.cos(a) * (R.r - 7); z = R.z + Math.sin(a) * (R.r - 7); tries++; }
    while (tries < 20 && this.spots.some((s) => Math.hypot(s.x - x, s.z - z) < 25));
    const grp = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 8), new THREE.MeshLambertMaterial({ color: 0x3aa9ff })); pad.position.y = 0.2; grp.add(pad);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 0.2), new THREE.MeshLambertMaterial({ color: 0xffb02a })); sign.position.set(0, 3.2, -4.3); grp.add(sign);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3, 6), new THREE.MeshLambertMaterial({ color: 0x888888 })); pole.position.set(0, 1.5, -4.3); grp.add(pole);
    for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.8), new THREE.MeshLambertMaterial({ color: [0xff7eb6, 0x3ad17c, 0xffd166, 0x9b4dca][k] })); c.position.set(-3.5 + (k % 2) * 7, 0.8, -2 + Math.floor(k / 2) * 4); grp.add(c); }
    grp.position.set(x, 0, z); grp.rotation.y = a + Math.PI / 2; grp.scale.setScalar(0.01);
    this.spotGroup.add(grp);
    this.spots.push({ x, z, mesh: grp, life: this.rng.range(18, 26), age: 0, occupant: null, occupiedT: 0, served: 0, pad });
  }
  spawnItem() {
    const rng = this.rng, R = this.ring, a = rng.range(0, Math.PI * 2), r = rng.range(8, R.r - 10);
    const coupon = rng.chance(0.3);
    const mesh = coupon ? new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.1), new THREE.MeshLambertMaterial({ color: 0x3ad17c })) : new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.2, 12), new THREE.MeshLambertMaterial({ color: 0xffd166 }));
    if (!coupon) mesh.rotation.x = Math.PI / 2;
    mesh.position.set(R.x + Math.cos(a) * r, 1.4, R.z + Math.sin(a) * r);
    this.game.scene.add(mesh);
    this.items.push({ x: mesh.position.x, z: mesh.position.z, mesh, coupon, value: coupon ? 30 : 15 });
  }

  award(tr, pts, label, cls = 'good') {
    if (pts <= 0) return;
    let mult = 1;
    if (!tr.isPlayer) mult = tr.hunger;
    const v = Math.round(pts * mult);
    if (v <= 0) return;
    tr.score += v;
    if (tr.isPlayer) this.game.hud.toast(`+${v} ${label}`, cls);
  }
  inRing(tr) { return Math.hypot(tr.x - this.ring.x, tr.z - this.ring.z) < this.ring.r; }

  onTruckHit(att, vic, info) {
    if (this.finished) return;
    const s = info.strength;
    if (s < 3) return;
    const big = s > 11;
    this.award(att, big ? 25 : Math.round(5 + s), big ? 'BIG HIT' : 'HIT', big ? 'gold' : 'good');
    if (big && (att.isPlayer || vic.isPlayer)) this.game.hud.toast(big && !att.isPlayer ? 'DENTED!' : '', 'bad');
  }
  onSpecialHit(att, vic, kind, strength) { if (!this.finished) this.award(att, 20, 'SPECIAL HIT', 'gold'); }
  onPropHit(tr, prop, how, strength) {
    if (this.finished) return;
    if (how === 'smash' && this.inRing(tr)) this.award(tr, 3, 'SMASH');
    if (how === 'totaled' && tr.lastHitBy && this.elapsed - tr.lastHitTime < 2.5) this.award(tr.lastHitBy, 30, 'CRASH!', 'gold');
  }

  update(dt, t) {
    super.update(dt, t);
    const g = this.game;
    if (this.finished) { for (const b of this.bots) this.drivers.get(b.id).stop(dt); return; }
    this.timeLeft -= dt;
    // knockouts
    for (const tr of this.trucks) {
      const inside = this.inRing(tr);
      if (!inside && !tr.outOfRing) {
        tr.outOfRing = true; tr.outTime = this.elapsed;
        if (tr.lastHitBy && this.elapsed - tr.lastHitTime < 3) { this.award(tr.lastHitBy, 40, 'KNOCKOUT!', 'gold'); if (tr.isPlayer) g.hud.toast('KNOCKED OUT OF THE RING!', 'bad'); g.fx.ring(tr.x, 1, tr.z, 0xffb02a, 6); }
        else if (tr.isPlayer) g.hud.toast('RETURN TO THE RING', 'bad');
      } else if (inside && tr.outOfRing) tr.outOfRing = false;
    }
    // spots
    this.spotTimer += dt;
    for (let i = this.spots.length - 1; i >= 0; i--) {
      const s = this.spots[i]; s.age += dt;
      const sc = s.age < 0.6 ? s.age / 0.6 : s.age > s.life - 0.6 ? Math.max(0.01, (s.life - s.age) / 0.6) : 1;
      s.mesh.scale.setScalar(sc);
      // occupant: a truck within 3.2m moving slowly
      let occ = null, bd = 1e9;
      for (const tr of this.trucks) { const d = Math.hypot(tr.x - s.x, tr.z - s.z); if (d < 3.4 && tr.speed < 5 && d < bd) { bd = d; occ = tr; } }
      if (occ !== s.occupant) { s.occupant = occ; s.occupiedT = 0; s.pad.material.color.set(occ ? occ.def.body : 0x3aa9ff); }
      if (occ) {
        s.occupiedT += dt;
        if (s.occupiedT > 0.8) { s.served += dt * 1.5; if (s.served >= 1) { s.served -= 1; this.award(occ, 12, 'SERVED!'); g.fx.emit(3, (p) => { p.x = s.x + (Math.random() - 0.5) * 4; p.y = 2.5; p.z = s.z + (Math.random() - 0.5) * 4; p.vy = 4; p.g = 2; p.size = 0.4; p.life = 0.7; p.color = 0xffd166; }); if (occ.isPlayer) g.audio.coin(); } }
      }
      if (s.age >= s.life) { this.spotGroup.remove(s.mesh); this.spots.splice(i, 1); this.spawnSpot(); }
    }
    // items
    this.itemTimer += dt;
    if (this.itemTimer > 4 && this.items.length < 6) { this.itemTimer = 0; this.spawnItem(); }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]; it.mesh.rotation.z += dt * 2; it.mesh.position.y = 1.4 + Math.sin(t * 3 + i) * 0.3;
      for (const tr of this.trucks) {
        if (Math.hypot(tr.x - it.x, tr.z - it.z) < 2.8) { this.award(tr, it.value, it.coupon ? 'COUPON' : 'COIN'); if (tr.isPlayer) g.audio.coin(); g.fx.sparks(it.x, 1.5, it.z, 10, it.coupon ? 0x3ad17c : 0xffd166); g.scene.remove(it.mesh); this.items.splice(i, 1); break; }
      }
    }
    this.directBots(dt, t);
    if (this.timeLeft <= 0) this.endMatch();
  }

  directBots(dt, t) {
    const g = this.game, p = this.player, place = g.outcome.place, prog = 1 - this.timeLeft / this.total;
    for (const b of this.bots) {
      // desired score relative to the player
      const k = b.targetRank < place ? place - b.targetRank : b.targetRank - place;
      const wander = noise1(t * 0.1 + b.noiseSeed) * 40 * (1 - prog);
      let desired;
      if (b.targetRank < place) desired = p.score + 30 + k * 30 + wander;
      else desired = Math.max(0, p.score * Math.max(0.1, 1 - k * 0.09) - 15 - k * 6 + wander * 0.4);
      // pace: scale by elapsed so scores grow over the match instead of jumping early
      desired *= (0.25 + 0.75 * prog);
      const need = desired - b.score;
      b.hunger = clamp(1 + need / 60, b.targetRank < place ? 0.6 : 0, 3.2);
      // closing surge: bots slated above the player visibly climb over the final stretch instead of jumping at the buzzer
      if (b.targetRank < place && this.timeLeft < 25 && this.timeLeft > 0.5) {
        const finalNeed = (p.score + 12 + (place - b.targetRank) * 14) - b.score;
        if (finalNeed > 0) { b._surge = (b._surge || 0) + finalNeed * dt / this.timeLeft; if (b._surge >= 1) { const add = Math.floor(b._surge); b._surge -= add; b.score += add; } }
      }
      if (b.targetRank > place && b.score >= desired + 10) b.hunger = 0;
      const drv = this.drivers.get(b.id);
      b.stateT -= dt;
      const inside = this.inRing(b);
      if (!inside) { drv.drive(this.ring.x, this.ring.z, 1.0, dt, t, { world: g.world, avoidTrucks: this.trucks }); continue; }
      if (b.stateT <= 0 || (b.target && b.target.alive === false)) this.pickState(b, need);
      let tx = this.ring.x, tz = this.ring.z, sf = 0.8, aggressive = false;
      if (b.state === 'hunt' && b.target) {
        const v = b.target; const lead = Math.min(1.2, Math.hypot(v.x - b.x, v.z - b.z) / 25);
        tx = v.x + v.vx * lead; tz = v.z + v.vz * lead; sf = 1.3; aggressive = true;
        if (Math.hypot(v.x - b.x, v.z - b.z) < 6 && b.speed > 10 && b.turboCd <= 0) b.control.turbo = true;
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
      drv.drive(tx, tz, sf, dt, t, { world: g.world, avoidTrucks: aggressive ? null : this.trucks, aggressive, turbo: aggressive });
      if (g.specials.botWants(b, this.trucks, dt, b.hunger > 1 ? 1.5 : 0.4)) b.control.special = true;
    }
  }
  autopilot(dt, t) {
    const p = this.player, g = this.game;
    if (!this.inRing(p)) { this.playerDriver().drive(this.ring.x, this.ring.z, 1, dt, t, { world: g.world }); return; }
    if (!p._apT || p._apT < t) { p._apT = t + 4; p._apTarget = this.rng.chance(0.5) ? this.rng.pick(this.bots) : (this.spots[0] || this.bots[0]); }
    const tg = p._apTarget; const spotMode = !tg.def; const d = Math.hypot(tg.x - p.x, tg.z - p.z);
    this.playerDriver().drive(tg.x, tg.z, spotMode && d < 6 ? 0.05 : 1.2, dt, t, { world: g.world, aggressive: true, turbo: true });
    if (g.specials.botWants(p, this.trucks, dt, 1)) g.specials.use(p, this.trucks, (a, v, k, s) => this.onSpecialHit(a, v, k, s));
  }
  pickState(b, need) {
    const rng = this.rng;
    const hungry = need > 0;
    const r = rng.next();
    if (hungry) {
      if (r < 0.5) { // hunt nearest (prefer the player when the player is ahead on points)
        let best = null, bd = 1e9;
        for (const v of this.trucks) { if (v === b) continue; let d = Math.hypot(v.x - b.x, v.z - b.z); if (v.isPlayer && v.score > b.score) d *= 0.6; if (d < bd) { bd = d; best = v; } }
        b.state = 'hunt'; b.target = best; b.stateT = rng.range(3, 6);
      } else if (r < 0.8 && this.spots.length) { b.state = 'park'; b.target = rng.pick(this.spots); b.stateT = rng.range(6, 10); }
      else if (this.items.length) { b.state = 'collect'; b.target = rng.pick(this.items); b.stateT = rng.range(3, 5); }
      else { b.state = 'cruise'; b.stateT = rng.range(2, 4); }
    } else {
      if (r < 0.75) { b.state = 'cruise'; b.stateT = rng.range(3, 5); }
      else { let best = null, bd = 1e9; for (const v of this.bots) { if (v === b) continue; const d = Math.hypot(v.x - b.x, v.z - b.z); if (d < bd) { bd = d; best = v; } } b.state = 'hunt'; b.target = best; b.stateT = rng.range(2, 4); }
    }
  }

  endMatch() {
    const g = this.game, p = this.player, place = g.outcome.place;
    // final tally: enforce the predetermined order with visible "tips" bonuses
    const ahead = this.bots.filter((b) => b.targetRank < place).sort((a, b) => b.targetRank - a.targetRank); // closest-above first
    let floor = p.score;
    for (const b of ahead) { const needed = floor + 5 + Math.round(this.rng.range(3, 20)); if (b.score < needed) b.score = needed; floor = b.score; }
    const behind = this.bots.filter((b) => b.targetRank > place).sort((a, b) => a.targetRank - b.targetRank);
    let ceil = p.score;
    for (const b of behind) { const cap = Math.max(0, ceil - 1 - Math.round(this.rng.range(0, 12))); if (b.score > cap) b.score = cap; ceil = b.score; }
    const ranking = this.trucks.slice().sort((a, b) => (b.score - a.score) || ((a.isPlayer ? place : a.targetRank) - (b.isPlayer ? place : b.targetRank)));
    ranking.forEach((r, i) => { r.place = i + 1; });
    g.hud.announce('TIME!');
    g.hud.toast('FINAL TALLY · TIPS COUNTED', 'gold');
    if (place === 1) { g.audio.fanfare(); g.fx.confetti(p.x, 6, p.z, 160, 10); } else g.audio.sad();
    this.finish(place, ranking.map((r) => ({ truck: r, place: r.place, score: r.score + ' pts' })), 4);
  }
  hud() {
    const sorted = this.trucks.slice().sort((a, b) => b.score - a.score);
    const rows = sorted.map((tr, i) => ({ name: tr.name, color: this.colorOf(tr), you: tr.isPlayer, score: tr.score, pos: i + 1 }));
    const myPos = sorted.indexOf(this.player) + 1;
    return { rows: rows.slice(0, 8).concat(myPos > 8 ? [rows[myPos - 1]] : []), timer: fmtTime(this.timeLeft), sub: `${ordinal(myPos)} · ${this.player.score} pts${this.player.outOfRing ? ' · OUT OF RING' : ''}` };
  }
  drawMinimap(ctx, size) {
    const m = this.mapper(this.ring.x, this.ring.z, this.ring.r + 30, size);
    const [cx, cy] = m(this.ring.x, this.ring.z);
    ctx.beginPath(); ctx.arc(cx, cy, (this.ring.r / (this.ring.r + 30)) * size / 2, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,176,42,0.8)'; ctx.lineWidth = 2; ctx.stroke();
    for (const s of this.spots) { const [px, py] = m(s.x, s.z); ctx.fillStyle = '#3aa9ff'; ctx.fillRect(px - 4, py - 4, 8, 8); }
    for (const it of this.items) { const [px, py] = m(it.x, it.z); this.dot(ctx, px, py, it.coupon ? '#3ad17c' : '#ffd166', 2.5); }
    for (const tr of this.trucks) { if (tr.isPlayer) continue; const [px, py] = m(tr.x, tr.z); this.dot(ctx, px, py, this.colorOf(tr), 3.5); }
    const [px, py] = m(this.player.x, this.player.z); this.dot(ctx, px, py, '#ffb02a', 5, true);
  }
}
