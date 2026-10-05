// Race: non-loop Grand Prix. The director paces bots around the player so the finishing order matches the roll.
import * as THREE from 'three';
import { Mode } from './base.js';
import { finalizeTrack, buildTrackVisuals, trackPointAt, trackProgress } from '../world/track.js';
import { BotDriver } from '../ai/bot.js';
import { clamp, smoothstep, noise1, fmtTime, ordinal, angleDiff, damp, wrapAngle } from '../core/math.js';

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
      tr.trackIdx = p.idx; tr.trackS = s; tr.finishedAt = null; tr.finishPlace = null;
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
    // the order sorts itself out over a late window; occasionally very late for a last-gasp comeback
    this.corrStart = this.rng.chance(0.15) ? this.rng.range(0.9, 0.93) : this.rng.range(0.78, 0.9);
    this.corrLen = this.rng.range(0.05, 0.08);
    this.limiterUsed = 0; this.paceMul = 1; this._v = new THREE.Vector3();
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
    for (const tr of this.trucks) if (tr.finishedAt === null && !tr.kinematicStep) trackProgress(track, tr);
    const frac = clamp(p.trackS / track.finishS, 0, 1);
    const pRemain = Math.max(0, track.finishS - p.trackS), pTime = pRemain / Math.max(p.speed, 9);
    let limiterNeeded = false;

    for (const b of this.bots) {
      if (b.finishedAt !== null) { this.cruiseAfterFinish(b, dt, t); continue; }
      if (b._baseMax === undefined) b._baseMax = b.maxSpeed;
      const drv = this.drivers.get(b.id), ahead = b.finalGap > 0;
      // feasibility: an ahead bot that would need an absurd speed to get past in time starts its correction now
      const needSpeed = ahead ? (track.finishS + 6 - b.trackS) / Math.max(pTime, 0.4) : 0;
      // start correcting early if the gap to close is getting too big for the distance left
      const wrongBy = ahead ? (p.trackS + 6) - b.trackS : b.trackS - (p.trackS - 6);
      if (!b.correcting && frac > 0.35 && wrongBy > pRemain * 0.22) b.correcting = true;
      if (frac >= this.corrStart) b.correcting = true;
      const startAt = b.correctFrom ?? (b.correcting ? (b.correctFrom = Math.min(frac, this.corrStart)) : null);
      const blend = startAt === null ? 0 : smoothstep(startAt, Math.min(0.985, startAt + this.corrLen), frac);
      // open racing: wander around the player (both sides), drifting back to the player when far off
      const wander = noise1(t * 0.07 + b.noiseSeed) * b.noiseAmp * 0.55 + (ahead ? 6 : -6);
      const desired = wander * (1 - blend) + b.finalGap * blend;
      let err = (p.trackS + desired) - b.trackS;
      if (this.playerFinished) err = ahead ? 60 : -5;
      let speedFactor = clamp(1 + err / 40, 0.1, 1.35);
      // hidden pace: lagging bots get a rubber band; correcting ahead bots get exactly the speed they need
      let boost = clamp(1 + Math.max(0, err - 25) / 120, 1, 1.3);
      let draft = false;
      if (ahead && b.correcting && !this.playerFinished) {
        boost = Math.max(boost, clamp((needSpeed * 1.12) / b._baseMax, 1, 2.1));
        if (b.trackS < p.trackS + 8) speedFactor = Math.max(speedFactor, 1.3);
        // slipstream: tucked in close behind the player, a climber gets an immediate tow past
        if (b.trackS < p.trackS + 6 && b.trackS > p.trackS - 40) { boost = Math.max(boost, (Math.max(p.speed, 10) * 1.45) / b._baseMax); draft = true; }
      }
      // corners: always brake (handling scales with the hidden boost, so the cap is relative)
      const cap = this.turnCap(b);
      speedFactor = Math.min(speedFactor, cap);
      // behind bots that are still ahead of the player during the correction ease off or slip up
      if (!ahead && b.correcting && !this.playerFinished && b.trackS > p.trackS - 6) {
        speedFactor = Math.min(speedFactor, 0.55 + 0.3 * (1 - blend));
        // while ahead of the player late on, slower than the player by enough to be caught before the line
        const surplus = b.trackS - p.trackS + 10, slowK = clamp(1 - surplus / Math.max(30, pRemain * 0.6), 0.3, 0.85);
        boost = Math.min(boost, Math.max(0.25, (Math.max(p.speed, 8) * slowK) / b._baseMax));
        if (!b.mistakeAt) b.mistakeAt = t + this.rng.range(0.5, 3);
        if (t > b.mistakeAt && b.speed > 12 && track.finishS - b.trackS > 100) {
          b.mistakeAt = t + this.rng.range(4, 8);
          if (this.rng.chance(0.55)) { b.applyEffect('spin', 1.1); g.fx.smoke(b.x, 1, b.z, 8, 0x999999); }
          else { b.laneOff = (b.laneOff >= 0 ? 1 : -1) * 4.6; b.wideUntil = t + 1.6; }  // runs wide into the kerb
        }
      }
      // failsafe: a behind bot never crosses the line before the player
      if (!ahead && !this.playerFinished && b.trackS > track.finishS - 10 - (b.speed * b.speed) / 30) { speedFactor = 0; boost = Math.min(boost, 0.2); }
      b.boostMul = draft ? Math.max(b.boostMul || 1, boost) : damp(b.boostMul || 1, boost, 2.5, dt);
      if (b.wideUntil && t > b.wideUntil) { b.laneOff = this.rng.range(-2.2, 2.2); b.wideUntil = 0; }
      // limiter only when this climber cannot make it at the pace the rail can give it
      const canDo = b.kinematicStep ? (b.railV ?? 0) * 1.25 : b._baseMax * 1.3;
      if (ahead && b.correcting && !this.playerFinished && b.trackS < p.trackS + 4 && pRemain < 200 && (needSpeed > canDo || pRemain < 45)) limiterNeeded = true;
      b.dbg = { err: Math.round(err), sf: +speedFactor.toFixed(2), boost: +b.boostMul.toFixed(2), corr: !!b.correcting };
      this.rails(b, dt);
      // target point on the spline with a lane offset
      // lane discipline while the order sorts itself out: climbers pass on one side, fallers keep to the other
      // climbers overtake on the side away from the player; fallers keep to the player's side
      const passSide = (p.trackLat ?? 0) > 0 ? -1 : 1;
      const laneBase = b.correcting && !this.playerFinished && !b.wideUntil ? passSide * (ahead ? 2.6 : -2.2) : b.laneOff;
      b.laneCur = damp(b.laneCur ?? b.laneOff, laneBase, 1.2, dt);
      const lane = clamp(b.laneCur + noise1(t * 0.2 + b.laneSeed) * (b.correcting ? 0.4 : 1.5), -4.6, 4.6);
      const look = 6 + b.speed * 0.35;
      const [tx, tz] = this.followTarget(b, look, b.wideUntil ? b.laneOff : clamp(lane, -2.2, 2.2));
      if (Math.abs(b.trackLat) > 6) speedFactor = Math.min(speedFactor, 0.7);
      this.unstick(b, drv, t);
      // climbers only steer around trucks that are not giving way to them
      const avoid = ahead && b.correcting ? this.trucks.filter((o) => o.isPlayer || o.finalGap > 0) : this.trucks;
      drv.drive(tx, tz, speedFactor, dt, t, { world: g.world, avoidTrucks: avoid, turbo: b.boostMul > 1.15 || err > 25 });
      // hidden brake: a behind bot is held short of the line until the player is across
      if (!ahead && !this.playerFinished && b.trackS > track.finishS - 14) { const k = Math.exp(-6 * dt); b.vx *= k; b.vz *= k; }
      if (g.specials.botWants(b, this.trucks, dt, 0.8)) b.control.special = true;
      if (b.correcting && !this.playerFinished) this.railCommand(b, ahead, err, pRemain, needSpeed, lane);
      else b.kinematicStep = null;
      if (b._baseTurn === undefined) { b._baseTurn = b.turnRate; b._baseAccel = b.accel; }
      b.maxSpeed = b._baseMax * b.boostMul; b.turnRate = b._baseTurn * b.boostMul; b.accel = b._baseAccel * b.boostMul;
      this.safetyNet(b, ahead, pRemain);
    }
    // last resort: if an ahead bot still has not got past near the end, the player's top speed sags a little
    if (p._baseMax === undefined) p._baseMax = p.maxSpeed;
    const want = limiterNeeded ? 1 - 0.5 * clamp(1 - pRemain / 200, 0, 1) : 1;
    if (limiterNeeded) this.limiterUsed += dt;
    this.paceMul = damp(this.paceMul, want, 2.5, dt);
    p.maxSpeed = p._baseMax * this.paceMul;

    // finishes
    for (const tr of this.trucks) {
      if (tr.finishedAt === null && tr.trackS >= track.finishS) {
        tr.finishedAt = this.elapsed; this.finishOrder.push(tr); tr.finishPlace = this.finishOrder.length;
        const fp = trackPointAt(track, track.finishS);
        if (tr.isPlayer) {
          this.playerFinished = true;
          g.fx.confetti(fp.x, 8, fp.z, 160, 12);
          const place = tr.finishPlace;
          if (place !== g.outcome.place) console.warn('race pacing missed: crossed', place, 'rolled', g.outcome.place);
          g.hud.announce(ordinal(place) + ' PLACE!');
          if (place <= 3) g.audio.fanfare(); else g.audio.sad();
          this.awaitRanking = true;
        } else if (g.near(tr)) g.fx.confetti(fp.x, 7, fp.z, 40, 8);
      }
    }
    if (this.awaitRanking && !this.finished) {
      // finishers in true crossing order, then the rest by their track position
      const ranking = this.standings();
      ranking.forEach((r, i) => { if (r.finishedAt === null) r.finishPlace = i + 1; });
      this.awaitRanking = false;
      this.finish(this.player.finishPlace, ranking.map((r) => ({ truck: r, place: r.finishPlace, score: r.finishedAt !== null ? fmtTime(r.finishedAt) : '' })), 3.5);
    }
    // wrong-way / off track hints
    if (!this.playerFinished && p.trackDist > 22 && t - this.lastWrongWay > 4) { this.lastWrongWay = t; g.hud.toast('BACK TO THE TRACK!', 'bad'); }
  }
  /**
   * Racing-line drive for bots in the correction window: the bot follows the spline at a commanded speed, limited by
   * the corner ahead and by a realistic acceleration, changing lanes smoothly. Climbers get exactly the pace they need,
   * fallers ease off behind the player.
   */
  railCommand(b, ahead, err, pRemain, needSpeed, lane) {
    const p = this.player, track = this.track;
    if (!b.kinematicStep) {
      // join the rail where the bot is: same distance, same (clamped) lateral offset, same speed
      b.railS = b.trackS; b.railLat = clamp(b.trackLat ?? 0, -4.6, 4.6); b.railV = Math.max(4, b.fwdSpeed);
      b.kinematicStep = (dt, world) => this.railStep(b, dt, world);
    }
    const ps = Math.max(p.speed, 8);
    let v;
    if (ahead) {
      v = b.railS < p.trackS + 6 ? Math.max(needSpeed * 1.15, ps * 1.18) : ps * clamp(1 + err / 60, 1.0, 1.25);
      v = Math.max(v, needSpeed * 1.08);
    } else if (b.railS > p.trackS - 6) {
      const surplus = b.railS - p.trackS + 10;
      v = ps * clamp(1 - surplus / Math.max(30, pRemain * 0.6), 0.3, 0.85);
    } else v = ps * clamp(1 + err / 60, 0.6, 0.98);
    if (!ahead && track.finishS - b.railS < 14) v = 0;
    b.railTarget = Math.min(v, 78); b.railLane = lane;
  }
  railStep(b, dt, world) {
    const track = this.track;
    // corner limit from the heading change over the next stretch
    const a1 = trackPointAt(track, b.railS + 4), a2 = trackPointAt(track, b.railS + 24 + b.railV * 0.6);
    const turn = Math.acos(clamp(a1.tx * a2.tx + a1.tz * a2.tz, -1, 1)), radius = (20 + b.railV * 0.6) / Math.max(turn, 1e-3);
    const vCorner = Math.sqrt(26 * radius);
    const target = Math.min(b.railTarget ?? b.railV, vCorner);
    const acc = target > b.railV ? 16 + b.accel * 0.4 : 30;
    b.railV = target > b.railV ? Math.min(target, b.railV + acc * dt) : Math.max(target, b.railV - acc * dt);
    const prevLat = b.railLat;
    b.railLat += clamp((b.railLane ?? 0) - b.railLat, -3.2 * dt, 3.2 * dt);
    b.railS += b.railV * dt;
    const q = trackPointAt(track, b.railS), nx = -q.tz, nz = q.tx;
    const x = q.x + nx * b.railLat, z = q.z + nz * b.railLat;
    const dLat = (b.railLat - prevLat) / Math.max(1e-4, b.railV * dt);
    const heading = Math.atan2(q.tx, q.tz) + Math.atan(dLat) * -1;
    b.vx = (x - b.x) / dt; b.vz = (z - b.z) / dt;
    if (Math.hypot(b.vx, b.vz) > b.railV * 1.6 + 5) { b.vx = q.tx * b.railV; b.vz = q.tz * b.railV; } // first step after joining
    b.angVel = wrapAngle(heading - b.heading) / dt;
    b.x = x; b.z = z; b.heading = heading;
    const el = world.elevation(x, z); b.groundH = el.h; b.onOverpass = !!el.op && el.h > 0.05; b.y = el.h;
    b.trackS = b.railS; b.trackLat = b.railLat; b.trackIdx = q.idx;
  }
  /**
   * Last-resort catch-up for an ahead bot that is hopelessly far back (crashed, stuck): when neither the bot nor the
   * spot it moves to can be seen by the camera, it is placed on the track a little behind the player.
   */
  safetyNet(b, ahead, pRemain) {
    const p = this.player, g = this.game;
    if (!ahead || this.playerFinished || !b.correcting) return;
    const deficit = p.trackS - b.trackS;
    b.slowT = b.speed < 8 && !b.disabled() ? (b.slowT || 0) + 1 / 60 : 0;
    const stuck = b.slowT > 1.0, far = deficit >= Math.max(70, pRemain * 0.35);
    if ((!far && !stuck) || (b._lastNet && this.elapsed - b._lastNet < (stuck ? 2 : 6))) return;
    const cam = g.camera; cam.updateMatrixWorld();
    const fr = this._fr || (this._fr = new THREE.Frustum()), m = this._pm || (this._pm = new THREE.Matrix4());
    m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); fr.setFromProjectionMatrix(m);
    const seen = (x, y, z) => fr.containsPoint(this._v.set(x, y + 1.5, z)) && Math.hypot(x - cam.position.x, z - cam.position.z) < 260;
    if (seen(b.x, b.y, b.z)) return;
    // stuck: back onto the centre line where it is; hopelessly far: up to just behind the player
    const s = far ? p.trackS - 34 : b.trackS + 2, q = trackPointAt(this.track, s);
    if (seen(q.x, q.y, q.z) || s < 0) return;
    const lat = this.rng.range(-2.5, 2.5);
    b.x = q.x - q.tz * lat; b.z = q.z + q.tx * lat; b.y = q.y; b.heading = Math.atan2(q.tx, q.tz);
    const v0 = far ? p.speed : 15; b.vx = q.tx * v0; b.vz = q.tz * v0; b.angVel = 0; b.slowT = 0; b.trackIdx = q.idx; b.trackS = s; b._lastNet = this.elapsed; this.netUsed = (this.netUsed || 0) + 1;
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
    if (drv.stuckCount - (tr._lastStuckCount || 0) >= 1) { tr._lastStuckCount = drv.stuckCount; tr._stuckEvents = (tr._stuckEvents || []).filter((x) => t - x < 25); tr._stuckEvents.push(t); }
    if ((tr._stuckEvents || []).length >= 4) {
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
    b.kinematicStep = null;
    const drv = this.drivers.get(b.id);
    const tp = trackPointAt(this.track, Math.min(this.track.length - 1, b.trackS + 12));
    trackProgress(this.track, b);
    if (this.track.length - b.trackS < 6) drv.stop(dt); else drv.drive(tp.x, tp.z, 0.4, dt, t, { world: this.game.world, avoidTrucks: this.trucks });
  }
  standings() {
    return this.trucks.slice().sort((a, b) => {
      if (a.finishedAt !== null && b.finishedAt !== null) return a.finishPlace - b.finishPlace;
      if (a.finishedAt !== null) return -1; if (b.finishedAt !== null) return 1;
      return b.trackS - a.trackS;
    });
  }
  hud() {
    const rows = this.standings().map((tr, i) => ({ name: tr.name, color: this.colorOf(tr), you: tr.isPlayer, score: tr.finishedAt !== null ? fmtTime(tr.finishedAt) : '', pos: tr.finishedAt !== null ? tr.finishPlace : i + 1 }));
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
