// Musical Trucks: when the music stops, park and hold the spot for a second. Spots shrink each round.
import * as THREE from 'three';
import { Mode } from './base.js';
import { scatterOpenProps } from '../world/city.js';
import { BotDriver } from '../ai/bot.js';
import { parkingBay } from '../world/setpieces.js';
import { clamp, noise1, smoothstep, wrapAngle } from '../core/math.js';
import { icon } from '../ui/icons.js';

// Park-phase clock: at PARK_LIMIT every truck still due to survive is towed into a free spot so a round can never
// stall (spots blocked by other trucks, someone wedged against a prop); everyone left over is out.
const PARK_LIMIT = 15, HURRY_AT = 10, TOW_TIME = 1.5;

export class ChairsMode extends Mode {
  setup() {
    const g = this.game, plan = g.plan, rng = this.rng;
    this.ring = plan.ring; this.schedule = g.params.spotSchedule; this.round = 0;
    scatterOpenProps(g.props, plan, rng, 36);
    const n = this.trucks.length, order = rng.shuffle(this.trucks);
    order.forEach((tr, i) => { const a = (i / n) * Math.PI * 2; tr.place(this.ring.x + Math.cos(a) * 40, this.ring.z + Math.sin(a) * 40, a + Math.PI / 2 + Math.PI); tr.eliminatedRound = null; tr.progress = 0; tr.spot = null; tr.secured = false; });
    this.drivers = new Map();
    for (const b of this.bots) { this.drivers.set(b.id, new BotDriver(b, rng)); b.noiseSeed = rng.range(0, 1000); b.doomed = false; b.assigned = null; b.boost = 1; b.hesit = 0; }
    this.spotGroup = new THREE.Group(); g.scene.add(this.spotGroup);
    this.spots = [];
    this.playerElimRound = g.outcome.eliminatedRound; // null = winner
    this.phase = 'intro'; this.phaseT = 2.5; this.musicLen = 0;
    this.elimOrder = [];
    this.startRound();
  }
  layoutSpots(count) {
    for (const s of this.spots) this.spotGroup.remove(s.mesh);
    this.spots = [];
    const R = 30 + count * 0.6;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + this.round * 0.3;
      const x = this.ring.x + Math.cos(a) * R, z = this.ring.z + Math.sin(a) * R;
      const { group: grp, fill } = parkingBay();
      grp.position.set(x, 0, z); grp.rotation.y = a + Math.PI / 2;
      this.spotGroup.add(grp);
      this.spots.push({ x, z, mesh: grp, fill, securedBy: null, i });
    }
  }
  alive() { return this.trucks.filter((t) => t.alive); }
  startRound() {
    const g = this.game, rng = this.rng;
    const survivorsTarget = this.schedule[this.round];
    this.layoutSpots(survivorsTarget);
    for (const tr of this.trucks) { tr.progress = 0; tr.spot = null; tr.secured = false; }
    // choose doomed bots this round
    const aliveBots = this.bots.filter((b) => b.alive);
    const playerDoomed = this.playerElimRound === this.round;
    const botsToCut = this.alive().length - survivorsTarget - (playerDoomed ? 1 : 0);
    const cut = rng.shuffle(aliveBots).slice(0, Math.max(0, botsToCut));
    for (const b of aliveBots) { b.doomed = cut.includes(b); b.assigned = null; b.boost = 1; b.hesit = 0; b.bumper = false; }
    this.playerDoomed = playerDoomed;
    this.phase = 'music'; this.musicLen = rng.range(7, 13); this.phaseT = this.musicLen;
    g.hud.announce(`ROUND ${this.round + 1}`);
    g.audio.startMusic();
    this.musicOn = true; this.parkToast = false; this.hurried = false; this.towing = false;
  }
  stopMusic() {
    const g = this.game;
    g.audio.stopMusic(); this.musicOn = false;
    this.phase = 'park'; this.phaseT = 0;
    g.hud.announce('PARK!'); g.audio.whistle();
    this.assignSpots();
  }
  assignSpots() {
    // survivors (non-doomed bots) each get a distinct spot; leave one free for the player if the player survives
    const survivors = this.bots.filter((b) => b.alive && !b.doomed);
    const free = this.spots.slice();
    const playerSpot = this.playerDoomed ? null : this.nearestSpot(this.player, free);
    const pool = playerSpot ? free.filter((s) => s !== playerSpot) : free;
    // greedy: repeatedly pick the closest (bot, spot) pair
    const remaining = new Set(survivors), spotsLeft = pool.slice();
    while (remaining.size && spotsLeft.length) {
      let best = null, bd = 1e9;
      for (const b of remaining) for (const s of spotsLeft) { const d = Math.hypot(b.x - s.x, b.z - s.z); if (d < bd) { bd = d; best = [b, s]; } }
      best[0].assigned = best[1]; remaining.delete(best[0]); spotsLeft.splice(spotsLeft.indexOf(best[1]), 1);
    }
    for (const b of remaining) b.assigned = this.rng.pick(this.spots);
    if (this.playerDoomed) { const bumper = survivors.slice().sort((a, b) => Math.hypot(a.x - this.player.x, a.z - this.player.z) - Math.hypot(b.x - this.player.x, b.z - this.player.z))[0]; if (bumper) bumper.bumper = true; }
    for (const b of this.bots) if (b.alive && b.doomed) b.assigned = this.rng.pick(this.spots);
  }
  nearestSpot(tr, list) { let best = null, bd = 1e9; for (const s of list) { const d = Math.hypot(tr.x - s.x, tr.z - s.z); if (d < bd) { bd = d; best = s; } } return best; }
  spotOf(tr) { for (const s of this.spots) if (Math.hypot(tr.x - s.x, tr.z - s.z) < 3.2) return s; return null; }

  update(dt, t) {
    super.update(dt, t);
    const g = this.game, p = this.player;
    if (this.finished) { for (const b of this.bots) if (b.alive) this.drivers.get(b.id).stop(dt); return; }
    if (this.phase === 'music') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.stopMusic();
      this.driveAround(dt, t);
      return;
    }
    if (this.phase === 'between') { this.phaseT -= dt; this.driveAround(dt, t, 0.4); if (this.phaseT <= 0) this.startRound(); return; }
    // phase park
    this.phaseT += dt;
    if (this.phaseT > HURRY_AT && !this.hurried) { this.hurried = true; g.hud.toast(`HURRY! ${PARK_LIMIT - HURRY_AT} S LEFT`, 'bad'); g.audio.whistle?.(); }
    if (this.phaseT >= PARK_LIMIT && !this.towing) this.towIn();
    for (const tr of this.trucks) {
      if (!tr.alive || tr.secured || tr.tow) continue;
      const s = this.spotOf(tr);
      const inSpot = s && tr.speed < 5 && !s.securedBy;
      if (inSpot) {
        if (tr.spot !== s) { tr.spot = s; tr.progress = 0; }
        // contested: another unsecured truck is close and heading in
        let contested = false;
        for (const o of this.trucks) { if (o === tr || !o.alive || o.secured) continue; const d = Math.hypot(o.x - s.x, o.z - s.z); if (d < 7 && d > 2.6 && o.speed > 4) contested = true; }
        let rate = contested ? 0.35 : 1;
        if (!tr.isPlayer && tr.doomed) rate = 0; // the doomed never settle
        tr.progress = Math.min(tr.isPlayer && this.playerDoomed ? 0.93 : 1, tr.progress + rate * dt);
        if (tr.isPlayer && contested && !this.parkToast) { this.parkToast = true; g.hud.toast('CONTESTED!', 'bad'); }
        if (tr.progress >= 1) this.secure(tr, s);
        else s.fill.material.color.set(tr.def.body);
      } else {
        if (tr.spot && !tr.spot.securedBy) { tr.spot.fill.material.color.set(0x3aa9ff); if (tr.isPlayer && tr.progress > 0.3) g.hud.toast('BUMPED OUT!', 'bad'); }
        tr.spot = null; tr.progress = 0;
      }
    }
    this.driveToSpots(dt, t);
    const allSecured = this.spots.every((s) => s.securedBy);
    // last resort: whatever happens, the round closes shortly after the tow
    if (allSecured || this.phaseT > PARK_LIMIT + TOW_TIME + 2.5) this.endRound();
  }
  secure(tr, s) {
    const g = this.game;
    tr.secured = true; tr.spot = s; tr.progress = 1; s.securedBy = tr; tr.mass *= 6;
    s.fill.material.color.set(0x3ad17c); g.fx.sparks(s.x, 1, s.z, 12, 0x3ad17c);
    if (tr.isPlayer) { g.hud.toast('SPOT SECURED!', 'good'); g.audio.coin(); }
  }
  /** Time's up: tow every truck that is due to survive into a free spot (ghosted, eased), shove squatters out. */
  towIn() {
    const g = this.game, p = this.player;
    this.towing = true;
    const due = this.trucks.filter((tr) => tr.alive && !tr.secured && (tr.isPlayer ? !this.playerDoomed : !tr.doomed));
    const free = this.spots.filter((s) => !s.securedBy), claimed = new Set();
    // closest pairs first, so each truck is pulled the shortest way
    const pairs = [];
    for (const tr of due) for (const s of free) pairs.push([Math.hypot(tr.x - s.x, tr.z - s.z) - (tr.spot === s ? 100 : 0), tr, s]);
    pairs.sort((a, b) => a[0] - b[0]);
    const done = new Set();
    for (const [, tr, s] of pairs) {
      if (done.has(tr) || claimed.has(s)) continue;
      done.add(tr); claimed.add(s); this.startTow(tr, s);
    }
    g.hud.announce("TIME'S UP!"); g.audio.whistle();
    if (p.tow) g.hud.toast('TOWED IN!', 'gold');
    // trucks squatting on a claimed spot get bumped clear
    for (const tr of this.trucks) {
      if (!tr.alive || tr.secured || tr.tow) continue;
      for (const s of claimed) {
        const dx = tr.x - s.x, dz = tr.z - s.z, d = Math.hypot(dx, dz);
        if (d < 6) { const k = 9 / (d || 1); tr.vx = (dx || 1) * k; tr.vz = dz * k; tr.spot = null; tr.progress = 0; }
      }
    }
  }
  startTow(tr, s) {
    const g = this.game;
    // park along the bay, nose whichever way is closer to the truck's current heading
    const bay = s.mesh.rotation.y; let h1 = bay; if (Math.abs(wrapAngle(bay + Math.PI - tr.heading)) < Math.abs(wrapAngle(bay - tr.heading))) h1 = bay + Math.PI;
    const tow = { s, t: 0, x0: tr.x, z0: tr.z, h0: tr.heading, h1: tr.heading + wrapAngle(h1 - tr.heading) };
    tr.tow = tow; tr.ghost = true; tr.spot = s; tr.progress = 0;
    s.fill.material.color.set(tr.def.body);
    g.fx.ring(tr.x, 0.6, tr.z, 0xffd23f, 5);
    tr.kinematicStep = (dt) => {
      tow.t += dt;
      const k = smoothstep(0, 1, Math.min(1, tow.t / TOW_TIME)), ox = tr.x, oz = tr.z;
      tr.x = tow.x0 + (s.x - tow.x0) * k; tr.z = tow.z0 + (s.z - tow.z0) * k;
      tr.y = tr.groundH + Math.sin(k * Math.PI) * 0.6; // a little lift, like it's on a hook
      tr.heading = tow.h0 + (tow.h1 - tow.h0) * k;
      tr.vx = (tr.x - ox) / dt; tr.vz = (tr.z - oz) / dt;
      tr.progress = k;
      if (tow.t >= TOW_TIME) {
        tr.x = s.x; tr.z = s.z; tr.y = tr.groundH; tr.vx = tr.vz = 0; tr.angVel = 0;
        tr.kinematicStep = null; tr.tow = null; tr.ghost = false;
        this.secure(tr, s);
      }
    };
  }
  driveAround(dt, t, sf = 0.85) {
    const g = this.game;
    for (const b of this.bots) {
      if (!b.alive) continue;
      const a = t * 0.35 * (b.id % 2 ? 1 : -1) + b.noiseSeed, r = 18 + noise1(t * 0.3 + b.noiseSeed) * 14 + 14;
      const tx = this.ring.x + Math.cos(a) * r, tz = this.ring.z + Math.sin(a) * r;
      this.drivers.get(b.id).drive(tx, tz, sf, dt, t, { world: g.world, avoidTrucks: this.trucks });
    }
  }
  driveToSpots(dt, t) {
    const g = this.game, p = this.player;
    for (const b of this.bots) {
      if (!b.alive) continue;
      const drv = this.drivers.get(b.id);
      if (b.secured || b.tow) { if (b.secured) drv.stop(dt); continue; }
      let s = b.assigned;
      // survivors re-target if their spot got taken by someone else
      if (!b.doomed && s && s.securedBy && s.securedBy !== b) { const free = this.spots.filter((q) => !q.securedBy && !this.bots.some((o) => o !== b && o.alive && !o.doomed && o.assigned === q)); s = b.assigned = this.nearestSpot(b, free) || s; }
      // survivors avoid the player's spot unless the player is doomed
      if (!b.doomed && !this.playerDoomed && s && p.spot === s && !p.secured) { const free = this.spots.filter((q) => !q.securedBy && q !== s && !this.bots.some((o) => o !== b && o.alive && !o.doomed && o.assigned === q)); const alt = this.nearestSpot(b, free); if (alt) s = b.assigned = alt; }
      if (!s) { drv.stop(dt); continue; }
      let tx = s.x, tz = s.z, sf = 1.0, aggressive = false;
      const d = Math.hypot(tx - b.x, tz - b.z);
      if (b.bumper && this.playerDoomed && !p.secured && p.spot) {
        // ram the player out of whatever spot they are in
        tx = p.x + p.vx * 0.2; tz = p.z + p.vz * 0.2; sf = 1.5; aggressive = true;
        if (b._baseMax === undefined) b._baseMax = b.maxSpeed; b.maxSpeed = b._baseMax * 1.5;
        if (Math.hypot(p.x - b.x, p.z - b.z) < 14 && b.turboCd <= 0) b.control.turbo = true;
        b.assigned = p.spot;
      } else {
        if (b._baseMax !== undefined) b.maxSpeed = b._baseMax;
        if (b.doomed) { sf = 0.75; b.hesit += dt; if (d < 4 && b.hesit > 2.5) { b.hesit = 0; b.assigned = this.rng.pick(this.spots.filter((q) => q !== s)) || s; } if (s.securedBy) { sf = 0.5; const away = Math.atan2(b.x - s.x, b.z - s.z); tx = s.x + Math.sin(away) * 7; tz = s.z + Math.cos(away) * 7; } }
        else if (s.securedBy === null) { sf = d < 7 ? 0.08 : 1.05; if (d < 2.0) sf = 0; }
        // long stall in the park phase: re-pick the nearest free spot every few seconds
        if (!b.doomed && this.phaseT > 6 && Math.floor(this.phaseT) % 3 === 0 && !b._reassigned) { b._reassigned = true; const free = this.spots.filter((q) => !q.securedBy && !(this.player.spot === q && !this.playerDoomed) && !this.bots.some((o) => o !== b && o.alive && !o.doomed && o.assigned === q && Math.hypot(o.x - q.x, o.z - q.z) < 12)); const ns = this.nearestSpot(b, free); if (ns) s = b.assigned = ns; } else if (Math.floor(this.phaseT) % 3 !== 0) b._reassigned = false;
        // another bot sitting in my spot? (doomed ones) nudge them
        for (const o of this.trucks) { if (o === b || !o.alive || o.secured) continue; if (!b.doomed && Math.hypot(o.x - s.x, o.z - s.z) < 3 && d < 12 && d > 3) { tx = o.x; tz = o.z; sf = 1.2; aggressive = true; } }
      }
      drv.drive(tx, tz, sf, dt, t, { world: g.world, avoidTrucks: aggressive ? null : this.trucks, aggressive, turbo: aggressive });
    }
  }
  autopilot(dt, t) {
    const p = this.player, g = this.game;
    if (!p.alive) return;
    if (this.phase !== 'park') { const a = t * 0.3 + 1; this.playerDriver().drive(this.ring.x + Math.cos(a) * 26, this.ring.z + Math.sin(a) * 26, 0.8, dt, t, { world: g.world, avoidTrucks: this.trucks }); return; }
    if (p.secured || p.tow) { if (p.secured) this.playerDriver().stop(dt); return; }
    const free = this.spots.filter((s) => !s.securedBy);
    const s = p.spot && !p.spot.securedBy ? p.spot : this.nearestSpot(p, free);
    if (!s) { this.playerDriver().stop(dt); return; }
    const d = Math.hypot(s.x - p.x, s.z - p.z);
    this.playerDriver().drive(s.x, s.z, d < 7 ? 0.08 : 1.0, dt, t, { world: g.world, avoidTrucks: this.trucks });
    if (d < 2.0) this.playerDriver().stop(dt);
  }
  endRound() {
    const g = this.game, p = this.player;
    for (const tr of this.trucks) if (tr.tow) { tr.kinematicStep = null; tr.tow = null; tr.ghost = false; if (tr.alive) this.secure(tr, tr.spot); }
    const out = this.alive().filter((tr) => !tr.secured);
    for (const tr of out) {
      tr.alive = false; tr.eliminatedRound = this.round; this.elimOrder.push(tr);
      g.fx.smoke(tr.x, 1.5, tr.z, 16, 0x555555, 1.3); g.fx.sparks(tr.x, 1, tr.z, 10, 0xef3b4b);
      tr.mesh.visible = false;
    }
    for (const tr of this.trucks) if (tr.secured) tr.mass /= 6;
    if (!p.alive) {
      g.hud.announce('ELIMINATED'); g.audio.sad();
      this.finish(g.outcome.place, this.ranking(), 3.5);
      return;
    }
    const survivors = this.alive();
    if (survivors.length === 1) {
      g.hud.announce('LAST TRUCK PARKED!'); g.audio.fanfare(); g.fx.confetti(p.x, 6, p.z, 220, 12);
      this.finish(1, this.ranking(), 4);
      return;
    }
    g.hud.toast(`${out.length} ELIMINATED`, 'bad'); g.audio.thud();
    this.round++;
    this.phase = 'between'; this.phaseT = 3;
  }
  ranking() {
    // winner first, then by elimination round descending
    const list = this.trucks.slice().sort((a, b) => {
      const ra = a.alive ? 99 : a.eliminatedRound, rb = b.alive ? 99 : b.eliminatedRound;
      if (rb !== ra) return rb - ra; return (a.isPlayer ? -1 : 0) - (b.isPlayer ? -1 : 0);
    });
    // slot the player at the rolled place among the trucks eliminated in the same round
    const idx = list.indexOf(this.player); list.splice(idx, 1);
    list.splice(clamp(this.game.outcome.place - 1, 0, list.length), 0, this.player);
    return list.map((tr, i) => ({ truck: tr, place: i + 1, score: tr.alive ? 'parked' : `out R${tr.eliminatedRound + 1}` }));
  }
  hud() {
    const alive = this.alive();
    const rows = this.trucks.slice().sort((a, b) => (b.alive - a.alive) || ((b.secured ? 1 : 0) - (a.secured ? 1 : 0))).map((tr, i) => ({ name: tr.name, color: this.colorOf(tr), you: tr.isPlayer, score: tr.alive ? (tr.secured ? '✓' : (tr.spot ? Math.round(tr.progress * 100) + '%' : '')) : 'OUT', pos: i + 1, out: !tr.alive }));
    const secured = this.spots.filter((s) => s.securedBy).length;
    const timer = this.phase === 'music' ? icon('note', 'ico-inline') + ' DRIVE' : this.phase === 'park' ? (this.towing ? "TIME'S UP!" : `PARK! ${Math.max(0, Math.ceil(PARK_LIMIT - this.phaseT))}`) : `ROUND ${this.round + 1}`;
    return { rows: rows.slice(0, 10), timer, sub: `Round ${this.round + 1}/${this.schedule.length} · ${alive.length} trucks · ${secured}/${this.spots.length} spots` };
  }
  drawMinimap(ctx, size) {
    const m = this.mapper(this.ring.x, this.ring.z, this.ring.r + 20, size);
    for (const s of this.spots) { const [px, py] = m(s.x, s.z); ctx.fillStyle = s.securedBy ? '#3ad17c' : '#3aa9ff'; ctx.fillRect(px - 4, py - 4, 8, 8); }
    for (const tr of this.trucks) { if (tr.isPlayer || !tr.alive) continue; const [px, py] = m(tr.x, tr.z); this.dot(ctx, px, py, this.colorOf(tr), 3.5); }
    const [px, py] = m(this.player.x, this.player.z); this.dot(ctx, px, py, '#ffb02a', 5, true);
  }
}
