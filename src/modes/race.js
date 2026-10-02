// Race: non-loop Grand Prix. The director paces bots around the player so the finishing order matches the roll.
import { Mode } from './base.js';
import { finalizeTrack, buildTrackVisuals, trackPointAt, trackProgress } from '../world/track.js';
import { BotDriver } from '../ai/bot.js';
import { clamp, smoothstep, noise1, fmtTime, ordinal, angleDiff } from '../core/math.js';

export class RaceMode extends Mode {
  setup() {
    const g = this.game, track = g.track;
    finalizeTrack(track, g.world);
    buildTrackVisuals(g.scene, track, g.world, g.props, this.rng);
    this.track = track;
    // grid
    const order = this.rng.shuffle(this.trucks);
    order.forEach((tr, i) => {
      const s = track.startS - 8 - Math.floor(i / 2) * 7.5;
      const p = trackPointAt(track, s), lat = (i % 2 ? 2.9 : -2.9);
      tr.place(p.x - p.tz * lat, p.z + p.tx * lat, Math.atan2(p.tx, p.tz));
      tr.trackIdx = p.idx; tr.trackS = s; tr.finishedAt = null; tr.place = null;
    });
    // director assignment
    const place = g.outcome.place, n = this.trucks.length;
    const bots = this.rng.shuffle(this.bots);
    this.finished = false; this.finishOrder = [];
    this.drivers = new Map();
    bots.forEach((b, i) => {
      // ranks 1..n excluding the player's place
      const rank = i + 1 < place ? i + 1 : i + 2;
      b.targetRank = rank;
      const ahead = rank < place;
      const k = ahead ? (place - rank) : (rank - place);
      b.finalGap = (ahead ? 1 : -1) * (14 + k * 16 + this.rng.range(0, 8));
      b.noiseSeed = this.rng.range(0, 1000); b.noiseAmp = this.rng.range(35, 70);
      b.laneOff = this.rng.range(-2.5, 2.5); b.laneSeed = this.rng.range(0, 100);
      b.boostMul = 1;
      this.drivers.set(b.id, new BotDriver(b, this.rng));
    });
    this.player.targetRank = place;
    this.startTime = 0; this.playerFinished = false; this.lastWrongWay = 0;
    this.mapBounds = this.computeBounds();
  }
  computeBounds() {
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const s of this.track.samples) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z); }
    return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, half: Math.max(maxX - minX, maxZ - minZ) / 2 + 30 };
  }

  update(dt, t) {
    super.update(dt, t);
    const g = this.game, track = this.track, p = this.player;
    for (const tr of this.trucks) if (tr.finishedAt === null) trackProgress(track, tr);
    const frac = clamp(p.trackS / track.finishS, 0, 1);
    const endPhase = smoothstep(0.3, 0.85, frac);
    const finalStretch = track.finishS - p.trackS < 70;

    for (const b of this.bots) {
      if (b.finishedAt !== null) { this.cruiseAfterFinish(b, dt, t); continue; }
      const drv = this.drivers.get(b.id);
      // desired offset from player progress
      const wander = noise1(t * 0.07 + b.noiseSeed) * b.noiseAmp * 0.6 + (b.finalGap > 0 ? 12 : -12);
      const desired = b.finalGap * endPhase + wander * (1 - endPhase) + (b.finalGap > 0 ? 6 : -6);
      let err = (p.trackS + desired) - b.trackS;
      if (this.playerFinished) err = b.finalGap > 0 ? 50 : -5; // ahead bots sprint, behind bots ease
      let speedFactor = clamp(1 + err / 45, 0.08, 1.35);
      // a bot slated behind that happens to be just ahead of the player keeps rolling so it can be overtaken naturally
      if (b.finalGap < 0 && b.trackS > p.trackS && b.trackS - p.trackS < 25) speedFactor = Math.max(speedFactor, 0.6);
      b.boostMul = b.finalGap > 0 ? clamp(1 + Math.max(0, err - 20) / 150, 1, 1.25) : 1;
      // always brake for upcoming corners: crashing loses far more time than braking
      const cap = this.turnCap(b);
      speedFactor = Math.min(speedFactor, cap);
      b.dbg = { err: Math.round(err), sf: +speedFactor.toFixed(2), cap, boost: +b.boostMul.toFixed(2) };
      // bots slated to finish behind the player never cross the line first
      if (b.finalGap < 0 && !this.playerFinished && b.trackS > track.finishS - 22) speedFactor = 0;
      this.rails(b, dt);
      if (finalStretch && !this.playerFinished) {
        if (b.finalGap > 0 && b.trackS < p.trackS + 10) { speedFactor = Math.min(1.5, cap + 0.3); b.boostMul = 1.4; }
        if (b.finalGap < 0 && b.trackS > p.trackS - 10) { speedFactor = 0; if (b.fx.spin <= 0 && b.speed > 12 && this.rng.chance(dt * 2)) { b.applyEffect('spin', 1.2); g.fx.smoke(b.x, 1, b.z, 6, 0x999999); } }
      }
      // target point on the spline with a lane offset
      const lane = clamp(b.laneOff + noise1(t * 0.2 + b.laneSeed) * 1.5, -2.2, 2.2);
      const look = 6 + b.speed * 0.35;
      const [tx, tz] = this.followTarget(b, look, lane);
      if (Math.abs(b.trackLat) > 6) speedFactor = Math.min(speedFactor, 0.7);
      this.unstick(b, drv, t);
      drv.drive(tx, tz, speedFactor, dt, t, { world: g.world, avoidTrucks: this.trucks, turbo: err > 25 || (finalStretch && b.finalGap > 0) });
      if (g.specials.botWants(b, this.trucks, dt, 0.8)) b.control.special = true;
    }
    // apply boost multipliers via maxSpeed tweak
    for (const b of this.bots) { if (b._baseMax === undefined) b._baseMax = b.maxSpeed; b.maxSpeed = b._baseMax * (b.boostMul || 1); }

    // finishes
    for (const tr of this.trucks) {
      if (tr.finishedAt === null && tr.trackS >= track.finishS) {
        tr.finishedAt = this.elapsed; this.finishOrder.push(tr); tr.place = this.finishOrder.length;
        const fp = trackPointAt(track, track.finishS);
        if (tr.isPlayer) {
          this.playerFinished = true;
          g.fx.confetti(fp.x, 8, fp.z, 160, 12);
          // ahead bots not yet across are placed ahead per plan; behind bots after
          const ranking = this.trucks.slice().sort((a, b) => (a.isPlayer ? g.outcome.place : a.targetRank) - (b.isPlayer ? g.outcome.place : b.targetRank));
          ranking.forEach((r, i) => { r.place = i + 1; });
          // any bot slated ahead that is still on the road is treated as having just crossed: it gets a time a hair quicker
          for (const r of ranking) if (!r.isPlayer && r.targetRank < g.outcome.place && r.finishedAt === null) { r.finishedAt = Math.max(0, tr.finishedAt - (g.outcome.place - r.targetRank) * 0.4); r.shownLate = true; }
          const place = g.outcome.place;
          g.hud.announce(ordinal(place) + ' PLACE!');
          if (place <= 3) g.audio.fanfare(); else g.audio.sad();
          this.finish(place, ranking.map((r) => ({ truck: r, place: r.place, score: r.finishedAt !== null ? fmtTime(r.finishedAt) : '' })), 3.5);
        } else if (g.near(tr)) g.fx.confetti(fp.x, 7, fp.z, 40, 8);
      }
    }
    // wrong-way / off track hints
    if (!this.playerFinished && p.trackDist > 22 && t - this.lastWrongWay > 4) { this.lastWrongWay = t; g.hud.toast('BACK TO THE TRACK!', 'bad'); }
  }
  /** target point ahead on the spline; never a point behind the truck (avoids circling) */
  followTarget(tr, look, lane) {
    const track = this.track;
    let tp = trackPointAt(track, tr.trackS + look);
    if (Math.abs(tr.trackLat) > 6) { tp = trackPointAt(track, tr.trackS + 5); lane = 0; }
    let tx = tp.x - tp.tz * lane, tz = tp.z + tp.tx * lane;
    const rel = Math.abs(angleDiff(tr.heading, Math.atan2(tx - tr.x, tz - tr.z)));
    if (rel > 1.9) { const fp = trackPointAt(track, tr.trackS + look + 22); tx = fp.x; tz = fp.z; }
    return [tx, tz];
  }
  /** AI trucks wedged for a long time get placed back on the road (small visual pop, prevents soft-locks) */
  unstick(tr, drv, t) {
    if (drv.stuckCount - (tr._lastStuckCount || 0) >= 1) { tr._lastStuckCount = drv.stuckCount; tr._stuckEvents = (tr._stuckEvents || []).filter((x) => t - x < 20); tr._stuckEvents.push(t); }
    if ((tr._stuckEvents || []).length >= 6) {
      tr._stuckEvents.length = 0;
      const p = trackPointAt(this.track, tr.trackS + 3);
      tr.x = p.x; tr.z = p.z; tr.heading = Math.atan2(p.tx, p.tz); tr.vx = p.tx * 4; tr.vz = p.tz * 4; tr.angVel = 0;
      this.game.fx.smoke(tr.x, 1, tr.z, 8, 0x999999, 1);
    }
  }
  /** speed cap (0..1.4) from the curvature of the track ahead of a truck */
  turnCap(tr) {
    const a1 = trackPointAt(this.track, tr.trackS + 6), a2 = trackPointAt(this.track, tr.trackS + 14 + tr.speed * 0.9);
    const turn = Math.acos(clamp(a1.tx * a2.tx + a1.tz * a2.tz, -1, 1));
    return turn > 1.2 ? 0.45 : turn > 0.7 ? 0.6 : turn > 0.35 ? 0.8 : 1.4;
  }
  /** soft rail: pull a truck back toward the road when it drifts wide (bots and autopilot only) */
  rails(tr, dt) {
    if (tr.airborne || tr.trackLat === undefined) return;
    const lat = tr.trackLat, lim = 4.0;
    if (Math.abs(lat) <= lim || Math.abs(lat) > 9) return; // far off the road: steer back instead of pushing into walls
    const a0 = this.track.samples[tr.trackIdx], sgn = -Math.sign(lat), k = Math.min(30, (Math.abs(lat) - lim) * 8);
    tr.vx += (-a0.tz) * sgn * k * dt; tr.vz += (a0.tx) * sgn * k * dt;
    if (Math.abs(lat) > 6.5) { const want = Math.atan2(a0.tx, a0.tz); tr.heading += angleDiff(tr.heading, want) * Math.min(1, 3 * dt); if (tr.speed < 2) { tr.vx += a0.tx * 6 * dt; tr.vz += a0.tz * 6 * dt; } }
  }
  autopilot(dt, t) {
    const p = this.player, g = this.game;
    if (p.finishedAt !== null) { this.playerDriver().stop(dt); return; }
    const [tx, tz] = this.followTarget(p, 6 + p.speed * 0.35, 0);
    let sf = Math.min(1.0, this.turnCap(p));
    if (Math.abs(p.trackLat) > 6) sf = Math.min(sf, 0.7);
    this.rails(p, dt);
    this.unstick(p, this.playerDriver(), t);
    this.playerDriver().drive(tx, tz, sf, dt, t, { world: g.world, avoidTrucks: this.trucks, turbo: true });
    if (g.specials.botWants(p, this.trucks, dt, 1)) g.specials.use(p, this.trucks, (a, v, k, s) => this.onSpecialHit(a, v, k, s));
  }
  cruiseAfterFinish(b, dt, t) {
    const drv = this.drivers.get(b.id);
    const tp = trackPointAt(this.track, Math.min(this.track.length - 1, b.trackS + 12));
    trackProgress(this.track, b);
    if (this.track.length - b.trackS < 6) drv.stop(dt); else drv.drive(tp.x, tp.z, 0.4, dt, t, { world: this.game.world, avoidTrucks: this.trucks });
  }
  standings() {
    return this.trucks.slice().sort((a, b) => {
      if (a.finishedAt !== null && b.finishedAt !== null) return a.place - b.place;
      if (a.finishedAt !== null) return -1; if (b.finishedAt !== null) return 1;
      return b.trackS - a.trackS;
    });
  }
  hud() {
    const rows = this.standings().map((tr, i) => ({ name: tr.name, color: this.colorOf(tr), you: tr.isPlayer, score: tr.finishedAt !== null ? fmtTime(tr.finishedAt) : '', pos: tr.finishedAt !== null ? tr.place : i + 1 }));
    return { rows, timer: fmtTime(this.elapsed), sub: `${Math.round(clamp(this.player.trackS / this.track.finishS, 0, 1) * 100)}% · ${ordinal(rows.findIndex((r) => r.you) + 1)}` };
  }
  drawMinimap(ctx, size) {
    const m = this.mapper(this.mapBounds.cx, this.mapBounds.cz, this.mapBounds.half, size);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath();
    const S = this.track.samples;
    for (let i = 0; i < S.length; i += 3) { const [px, py] = m(S[i].x, S[i].z); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
    ctx.stroke();
    const fp = m(S[this.track.finishIdx].x, S[this.track.finishIdx].z); this.dot(ctx, fp[0], fp[1], '#ef3b4b', 4);
    const sp = m(S[this.track.startIdx].x, S[this.track.startIdx].z); this.dot(ctx, sp[0], sp[1], '#3ad17c', 4);
    for (const tr of this.trucks) { if (tr.isPlayer) continue; const [px, py] = m(tr.x, tr.z); this.dot(ctx, px, py, this.colorOf(tr), 3.5); }
    const [px, py] = m(this.player.x, this.player.z); this.dot(ctx, px, py, '#ffb02a', 5, true);
  }
}
