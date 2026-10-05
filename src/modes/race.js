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
    // usable road on each side of the racing line (walls, ramp sides, the narrower overpass deck), for lane picking
    this.room = track.samples.map((q) => {
      const cap = q.y > 0.3 ? 4.6 : 6.5;
      return [Math.min(cap, g.world.rayDistance(q.x, q.z, q.tz, -q.tx, 8)), Math.min(cap, g.world.rayDistance(q.x, q.z, -q.tz, q.tx, 8))]; // [-lat side, +lat side]
    });
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
      // each truck has a slot in the train around the player (k places ahead or behind), about 6 m apart: early on
      // it wanders a lot around that slot (places swap, the order looks open), later less and less
      b.finalGap = (ahead ? 1 : -1) * (4 + k * 6 + this.rng.range(0, 3));
      b.noiseSeed = this.rng.range(0, 1000); b.noiseAmp = this.rng.range(10, 16);
      b.laneOff = this.rng.range(-2.5, 2.5); b.laneSeed = this.rng.range(0, 100);
      b.boostMul = 1;
      this.drivers.set(b.id, new BotDriver(b, this.rng));
    });
    this.player.targetRank = place;
    this.startTime = 0; this.playerFinished = false; this.lastWrongWay = 0;
    // the order sorts itself out gradually over a long window (settled by roughly 65-88% of the race), so nobody
    // needs more than a modest pace advantage; now and then it opens late for a last-gasp comeback
    this.corrStart = this.rng.chance(0.12) ? this.rng.range(0.62, 0.7) : this.rng.range(0.45, 0.62);
    this.corrEnd = Math.min(0.88, this.corrStart + this.rng.range(0.2, 0.25));
    this.limiterUsed = 0; this.pPace = 20; this._v = new THREE.Vector3();
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
    const pRemain = Math.max(0, track.finishS - p.trackS);
    // the player's pace, smoothed: instant speed jumps around in crashes and corners
    this.pPace = damp(this.pPace, clamp(p.speed, 8, p.maxSpeed), 0.8, dt);
    // and the player's speed right now (lightly smoothed): late in the race bots match it, so a pass sticks
    this.pNow = damp(this.pNow ?? p.speed, p.speed, 4, dt);
    const win = smoothstep(this.corrStart, this.corrEnd, frac);
    // what the camera can see this frame (bots catching up out of view may use more pace)
    const cam = g.camera; cam.updateMatrixWorld();
    const fr = this._fr || (this._fr = new THREE.Frustum()), pm = this._pm || (this._pm = new THREE.Matrix4());
    pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); fr.setFromProjectionMatrix(pm);
    const inView = (tr) => this._sph.set(this._v.set(tr.x, tr.y + 1.6, tr.z), 4) && fr.intersectsSphere(this._sph);
    this._sph = this._sph || new THREE.Sphere();

    for (const b of this.bots) {
      if (b.finishedAt !== null) { this.cruiseAfterFinish(b, dt, t); continue; }
      if (b._baseMax === undefined) { b._baseMax = b.maxSpeed; b._baseTurn = b.turnRate; b._baseAccel = b.accel; }
      const drv = this.drivers.get(b.id), ahead = b.finalGap > 0, gap = b.trackS - p.trackS;
      // a truck far out of place (crash, spin-out) starts sorting itself out early instead of needing a late burst
      const wrongBy = ahead ? -gap : gap;
      if (frac > 0.2 && !this.playerFinished && wrongBy + Math.abs(b.finalGap) > Math.max(30, pRemain * 0.14)) b.early = Math.min(1, (b.early || 0) + dt * 0.25);
      const blend = Math.max(win, b.early || 0);
      b.correcting = blend > 0.02;
      if (b.correcting && b.correctFrom === undefined) b.correctFrom = frac;
      // open racing: wander around the player (ahead-slated trucks mostly ahead, the rest mostly behind)
      // (a tight pack: the field stays around the player for most of the race)
      const settle = clamp(frac / Math.max(0.2, this.corrStart), 0, 1);
      const wander = b.finalGap + noise1(t * 0.06 + b.noiseSeed) * b.noiseAmp * (1 - 0.65 * settle);
      const desired = wander * (1 - blend) + b.finalGap * blend;
      let err = desired - gap; // > 0: needs to gain on the player
      if (this.playerFinished) err = ahead ? 80 : -20;
      // pace: the player's pace plus a proportional term; a hidden power boost of at most 30% when short of the target
      // bots are proper racers (a little stronger than their stats) and close gaps quickly when they fall back
      let boost = 1.06 + clamp((err - 4) / 35, 0, 0.39);
      // slipstream: tucked in behind the player a climber gets a small tow
      if (ahead && b.correcting && gap < -4 && gap > -30) boost = Math.min(1.6, boost + 0.06 + (blend > 0.5 ? 0.08 : 0));
      // slingshot: late on, a climber tucked in close behind the player pulls out of the tow and gets past
      if (ahead && blend > 0.55 && gap < -2 && gap > -22 && !this.playerFinished) boost = Math.max(boost, 1.72);
      // out of sight behind the player, a climber may close in faster and slip through other bots; in view it is
      // solid again (once clear of whatever it overlapped) and back to believable pace
      const unseen = ahead && b.correcting && gap < -3 && !this.playerFinished && !inView(b);
      if (unseen) { boost = Math.max(boost, 2.1); b.ghostBots = true; }
      else if (b.ghostBots && !this.trucks.some((o) => o !== b && !o.isPlayer && Math.hypot(o.x - b.x, o.z - b.z) < 6.2)) b.ghostBots = false;
      // floors: a truck slated ahead may run away (never crawls waiting for the player); one slated behind slows to be caught
      const toLine = track.finishS - b.trackS;
      let speedFactor = clamp((this.pPace / (b._baseMax * boost)) * (1 + err / 35), ahead ? 0.35 : gap > 0 && toLine < 160 ? 0.12 : 0.3, 1.3);
      if (err > 12) speedFactor = Math.max(speedFactor, Math.min(1.3, 0.95 + (err - 12) / 25)); // short of its place: flat out
      // late on, once a truck slated ahead is past the player it never drops below the player's speed (the pass
      // sticks), and one slated behind never out-runs the player while it is just behind
      if (blend > 0.4 && !this.playerFinished) {
        const pv = this.pNow / (b._baseMax * boost);
        if (ahead && gap > -2) speedFactor = Math.max(speedFactor, Math.min(1.3, pv * (gap < b.finalGap ? 1.08 : 1.0)));
        if (!ahead && gap < 2 && gap > -25) speedFactor = Math.min(speedFactor, pv * 0.97);
      }
      // corners: always brake (handling scales with the boost, so the cap is relative)
      speedFactor = Math.min(speedFactor, this.turnCap(b));
      // behind-slated trucks that are still ahead of the player late on slip up now and then
      if (!ahead && b.correcting && blend > 0.3 && !this.playerFinished && gap > -4) {
        if (!b.mistakeAt) b.mistakeAt = t + this.rng.range(1, 4);
        if (t > b.mistakeAt && b.speed > 12 && track.finishS - b.trackS > 100) {
          b.mistakeAt = t + this.rng.range(5, 9);
          if (this.rng.chance(0.5)) { b.applyEffect('spin', 1.1); g.fx.smoke(b.x, 1, b.z, 8, 0x999999); }
          else { b.wideLane = b.trackLat >= 0 ? (b.laneHi ?? 3) + 0.4 : (b.laneLo ?? -3) - 0.4; b.wideUntil = t + 1.6; } // runs wide into the kerb
        }
      }
      if (b.wideUntil && t > b.wideUntil) { b.wideUntil = 0; b.wideLane = null; }
      // a behind-slated truck that reaches the last stretch ahead of the player pulls over to the side and waits
      if (!ahead && !this.playerFinished && gap > 0 && toLine < 50) { b.wideLane = (p.trackLat ?? 0) > 0 ? (b.laneLo ?? -3) : (b.laneHi ?? 3); b.wideUntil = t + 0.5; }
      // a behind-slated truck never crosses the line before the player
      if (!ahead && !this.playerFinished && b.trackS > track.finishS - 10 - (b.speed * b.speed) / 30) { speedFactor = 0; boost = Math.min(boost, 0.2); }
      b.boostMul = damp(b.boostMul || 1, boost, 1.5, dt);
      // climbers shrug off spin-outs and freezes from other trucks' specials while they make their move
      b.shielded = ahead && b.correcting && !this.playerFinished;
      this.rails(b, dt);
      // lanes: pick the clearest way past whatever is ahead; if every lane is blocked, follow instead of ramming
      const passSide = (p.trackLat ?? 0) > 0 ? -1 : 1;
      // a truck that has to drop back moves over to the side away from the player instead of blocking the road
      // (to the player's side: the climbers pass on the other one, and the player has traffic to get round, as in a real race)
      const preferred = err < -8 && !this.playerFinished ? -passSide * 3.4 : b.correcting && !this.playerFinished && ahead ? passSide * 2.4 : b.laneOff;
      const plan = this.planLane(b, preferred, dt);
      speedFactor = Math.min(speedFactor, plan.cap);
      const lane = b.wideLane ?? b.laneCur;
      const look = clamp(5 + b.speed * 0.3, 6, 16);
      const [tx, tz] = this.followTarget(b, look, clamp(lane + noise1(t * 0.2 + b.laneSeed) * 0.25, b.laneLo, b.laneHi));
      if (Math.abs(b.trackLat) > 6) speedFactor = Math.min(speedFactor, 0.7);
      this.unstick(b, drv, t);
      b.dbg = { err: Math.round(err), sf: +speedFactor.toFixed(2), boost: +b.boostMul.toFixed(2), corr: b.correcting, lane: +b.laneCur.toFixed(1), clear: Math.round(plan.clear), cap: plan.cap, tcap: this.turnCap(b) };
      // turbo like a person would: on a clear straight whenever the truck is not supposed to be dropping back
      this.driveLane(b, drv, tx, tz, speedFactor, dt, plan.clear > 25 && err > -6 && this.turnCap(b) > 1);
      // hidden brake: a behind-slated truck is held short of the line until the player is across
      if (!ahead && !this.playerFinished && b.trackS > track.finishS - 14) { const k = Math.exp((b.trackS > track.finishS - 5 ? -25 : -6) * dt); b.vx *= k; b.vz *= k; }
      if (plan.clear > 12 && g.specials.botWants(b, this.trucks, dt, 0.8)) b.control.special = true;
      b.kinematicStep = null;
      b.maxSpeed = b._baseMax * b.boostMul; b.turnRate = b._baseTurn * b.boostMul; b.accel = b._baseAccel * b.boostMul;
      this.safetyNet(b, ahead, frac, speedFactor);
    }
    if (p._baseMax !== undefined) p.maxSpeed = p._baseMax; // the player's truck is never slowed down
    // hard stop: a behind-slated truck cannot be shoved across the line before the player (it just won't budge)
    if (!this.playerFinished) for (const b of this.bots) {
      if (b.finalGap > 0 || b.finishedAt !== null || b.trackS <= track.finishS - 2) continue;
      const q = trackPointAt(track, track.finishS - 2), over = b.trackS - (track.finishS - 2), fwd = b.vx * q.tx + b.vz * q.tz;
      b.x -= q.tx * over; b.z -= q.tz * over; b.trackS = track.finishS - 2;
      if (fwd > 0) { b.vx -= q.tx * fwd; b.vz -= q.tz * fwd; }
    }

    // finishes (physical crossing order is recorded; the ranking itself is always the rolled one)
    for (const tr of this.trucks) {
      if (tr.finishedAt === null && tr.trackS >= track.finishS) {
        tr.finishedAt = this.elapsed; this.finishOrder.push(tr); tr.finishPlace = this.finishOrder.length;
        const fp = trackPointAt(track, track.finishS);
        if (tr.isPlayer) {
          this.playerFinished = true; this.finishWait = 0;
          g.fx.confetti(fp.x, 8, fp.z, 160, 12);
          const place = g.outcome.place;
          if (tr.finishPlace !== place) console.warn('race pacing missed: crossed', tr.finishPlace, 'rolled', place);
          g.hud.announce(ordinal(place) + ' PLACE!');
          if (place <= 3) g.audio.fanfare(); else g.audio.sad();
        } else if (g.near(tr)) g.fx.confetti(fp.x, 7, fp.z, 40, 8);
      }
    }
    if (this.playerFinished && !this.finished) {
      // give trucks slated ahead a moment to cross, then post the rolled result
      this.finishWait += dt;
      const pending = this.bots.some((b) => b.finalGap > 0 && b.finishedAt === null);
      if (!pending || this.finishWait > 4) this.finish(g.outcome.place, this.rankedResult(), Math.max(0.6, 3.5 - this.finishWait));
    }
    // wrong-way / off track hints
    if (!this.playerFinished && p.trackDist > 22 && t - this.lastWrongWay > 4) { this.lastWrongWay = t; g.hud.toast('BACK TO THE TRACK!', 'bad'); }
  }
  /**
   * The result board: always the rolled order. Finish times are shown where the crossing order agrees with it
   * (the player's own time always), so the board never contradicts itself.
   */
  rankedResult() {
    const list = this.trucks.slice().sort((a, b) => a.targetRank - b.targetRank);
    const pt = this.player.finishedAt;
    let last = -Infinity;
    return list.map((tr) => {
      let score = '';
      if (tr.isPlayer) { score = fmtTime(pt); last = pt; }
      else if (tr.finishedAt !== null && tr.finishedAt >= last && (tr.targetRank > this.player.targetRank || tr.finishedAt <= pt)) { score = fmtTime(tr.finishedAt); last = tr.finishedAt; }
      tr.finishPlace = tr.targetRank;
      return { truck: tr, place: tr.targetRank, score };
    });
  }
  /**
   * Race driving for bots: pure-pursuit steering onto a point of the chosen lane and a speed controller. No wall
   * feelers and no swerving around trucks (the lane planner already picked a clear line). Wedged against something,
   * it backs off and tries again.
   */
  driveLane(b, drv, tx, tz, speedFactor, dt, turbo) {
    const c = b.control;
    if (b.stuckTime > 1.0 && drv.reverseTimer <= 0) { drv.reverseTimer = 0.9; drv.reverseDir = angleDiff(b.heading, Math.atan2(tx - b.x, tz - b.z)) > 0 ? -1 : 1; b.stuckTime = 0; drv.stuckCount++; }
    if (drv.reverseTimer > 0) { drv.reverseTimer -= dt; c.throttle = -1; c.steer = drv.reverseDir; c.handbrake = false; c.turbo = false; return; }
    const diff = angleDiff(b.heading, Math.atan2(tx - b.x, tz - b.z));
    c.steer = clamp(diff * 2.4, -1, 1);
    const want = b.maxSpeed * clamp(speedFactor, 0, 1.4) * (Math.abs(diff) > 0.8 ? 0.55 : Math.abs(diff) > 0.45 ? 0.8 : 1);
    c.throttle = clamp((want - b.fwdSpeed) / 4, -1, 1);
    c.handbrake = false;
    c.turbo = !!turbo && Math.abs(diff) < 0.2 && b.turboCd <= 0;
  }
  /**
   * Overtaking: score candidate lanes by how far ahead they are clear of slower trucks (in track coordinates), with a
   * small preference for staying put and for the director's preferred side. Lane changes are eased; a truck that is
   * still lined up behind a slower one follows at a safe gap instead of ramming it.
   */
  /** lateral range a truck's centre can use over the next stretch of road */
  laneRange(b) {
    const i0 = b.trackIdx ?? 0, R = this.room;
    let lo = -4.2, hi = 4.2;
    for (let i = Math.max(0, i0 - 2); i < Math.min(R.length, i0 + 16); i++) { lo = Math.max(lo, -(R[i][0] - 1.8)); hi = Math.min(hi, R[i][1] - 1.8); }
    if (lo > hi) lo = hi = (lo + hi) / 2;
    return [lo, hi];
  }
  planLane(b, preferred, dt) {
    const [lo, hi] = this.laneRange(b);
    const others = b.ghostBots ? [this.player] : this.trucks;
    b.laneLo = lo; b.laneHi = hi;
    const LANES = [-3.6, -1.8, 0, 1.8, 3.6].map((l) => clamp(l, lo, hi)).filter((l, i, a) => a.indexOf(l) === i), W = 2.8;
    if (b.laneCur === undefined) { b.laneCur = clamp(b.trackLat ?? b.laneOff ?? 0, -3.6, 3.6); b.laneTarget = b.laneCur; }
    const cur = b.trackLat ?? b.laneCur;
    const clearOf = (l) => {
      let clear = 50;
      for (const o of others) {
        if (o === b || !o.alive || o.trackLat === undefined) continue;
        const ds = o.trackS - b.trackS;
        if (ds < -1.5 || ds > 50) continue;
        if (ds > 10 && o.fwdSpeed > b.fwdSpeed + 2) continue; // pulling away: not in the way
        if (Math.abs(o.trackLat - l) < W && ds < clear) clear = Math.max(0, ds);
      }
      // getting there: something alongside between here and that lane makes the move impossible right now
      if (Math.abs(l - cur) > 1 && !(b.forceT > 0)) for (const o of others) {
        if (o === b || !o.alive || o.trackLat === undefined) continue;
        const ds = o.trackS - b.trackS, side = o.trackLat - cur;
        if (Math.abs(ds) < 6.5 && side * (l - cur) > 0 && Math.abs(side) > 0.8 && Math.abs(side) < Math.abs(l - cur) + W) clear = Math.min(clear, 1);
      }
      return clear;
    };
    // held up too long behind something slow: force the move (squeeze past whatever is alongside)
    if (b.heldT > 1.5) { b.forceT = 2.0; b.heldT = 0; }
    if (b.forceT > 0) b.forceT -= dt;
    let best = b.laneTarget, bestScore = -Infinity, bestClear = 0;
    const scores = new Map();
    for (const l of LANES) {
      const c = clearOf(l), score = c - Math.abs(l - cur) * 1.5 - Math.abs(l - preferred) * 0.5 - (Math.abs(l) > 3 ? 1 : 0);
      scores.set(l, [score, c]);
      if (score > bestScore) { bestScore = score; best = l; bestClear = c; }
    }
    // hysteresis: keep the current plan unless another lane is clearly better
    const keep = scores.get(b.laneTarget);
    if (keep && keep[0] > bestScore - 5) { best = b.laneTarget; bestClear = keep[1]; }
    b.laneTarget = clamp(best, lo, hi);
    const rate = bestClear < 15 ? 3.4 : 2.2;
    b.laneCur += clamp(b.laneTarget - b.laneCur, -rate * dt, rate * dt);
    b.laneCur = clamp(b.laneCur, lo - 0.3, hi + 0.3);
    // follow: whatever is directly ahead in the truck's actual line sets a speed cap with a safe gap
    // follow: whatever is directly ahead in the truck's actual line sets a speed cap with a safe gap (match its
    // speed when close, never a dead stop behind a moving truck); a squeeze-past creeps instead of waiting
    let cap = 1.4;
    for (const o of others) {
      if (o === b || !o.alive || o.trackLat === undefined) continue;
      const ds = o.trackS - b.trackS;
      if (ds < 0.5 || ds > 16 || Math.abs(o.trackLat - b.trackLat) > 2.5) continue; // actually overlapping
      // keep pace with it (racing in its slipstream), easing off only when right on its bumper
      const vo = Math.max(0, o.fwdSpeed), vSafe = ds < 6.5 ? vo * 0.85 : vo * 0.97 + (ds - 6.5) * 0.9;
      cap = Math.min(cap, Math.max(0, vSafe) / Math.max(1, b.maxSpeed));
    }
    if (b.forceT > 0) cap = Math.max(cap, 0.22);
    b.heldT = cap < 0.25 && !b.disabled() ? (b.heldT || 0) + dt : 0;
    return { cap, clear: bestClear };
  }
  /**
   * Last resort for a truck that is wedged (stuck) or hopelessly far back early on (crashed): when neither the truck
   * nor the spot it moves to can be seen by the camera, it is put back on the track. Never during the late race.
   */
  safetyNet(b, ahead, frac, sf) {
    const p = this.player, g = this.game;
    if (this.playerFinished) return;
    const deficit = p.trackS - b.trackS;
    b.slowT = b.speed < 6 && sf > 0.4 && !b.disabled() ? (b.slowT || 0) + 1 / 60 : 0; // wants to go, cannot
    const stuck = b.slowT > 2.0, far = ahead && frac < this.corrEnd && deficit >= 140;
    if ((!far && !stuck) || (b._lastNet && this.elapsed - b._lastNet < 6)) return;
    const cam = g.camera; cam.updateMatrixWorld();
    const fr = this._fr || (this._fr = new THREE.Frustum()), m = this._pm || (this._pm = new THREE.Matrix4());
    m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); fr.setFromProjectionMatrix(m);
    const seen = (x, y, z) => Math.hypot(x - cam.position.x, z - cam.position.z) < 300 && (fr.containsPoint(this._v.set(x, y + 1.5, z)) || Math.hypot(x - cam.position.x, z - cam.position.z) < 40);
    if (seen(b.x, b.y, b.z)) return;
    const s = far ? p.trackS - 80 : b.trackS + 2, q = trackPointAt(this.track, s);
    if (seen(q.x, q.y, q.z) || s < 0) return;
    const lat = this.rng.range(-2.5, 2.5);
    b.x = q.x - q.tz * lat; b.z = q.z + q.tx * lat; b.y = q.y; b.heading = Math.atan2(q.tx, q.tz);
    const v0 = far ? this.pPace : 12; b.vx = q.tx * v0; b.vz = q.tz * v0; b.angVel = 0; b.slowT = 0; b.trackIdx = q.idx; b.trackS = s; b.trackLat = lat; b.laneCur = lat; b.laneTarget = 0; b._lastNet = this.elapsed; this.netUsed = (this.netUsed || 0) + 1;
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
    return turn > 1.2 ? 0.62 : turn > 0.7 ? 0.78 : turn > 0.35 ? 0.93 : 1.4;
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
    // test driver: a competent person (racing line, clean overtakes, turbo on the straights)
    const p = this.player, g = this.game;
    if (p.finishedAt !== null) { this.playerDriver().stop(dt); return; }
    trackProgress(this.track, p);
    const plan = this.planLane(p, 0, dt);
    const [tx, tz] = this.followTarget(p, clamp(5 + p.speed * 0.3, 6, 16), clamp(p.laneCur, p.laneLo, p.laneHi));
    let sf = Math.min(1.3, this.turnCap(p), Math.max(plan.cap, 0.75)); // people barge through traffic
    if (Math.abs(p.trackLat) > 6) sf = Math.min(sf, 0.7);
    this.rails(p, dt);
    this.unstick(p, this.playerDriver(), t);
    this.driveLane(p, this.playerDriver(), tx, tz, sf, dt, plan.clear > 25 && this.turnCap(p) > 1);
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
    if (this.playerFinished) return this.trucks.slice().sort((a, b) => a.targetRank - b.targetRank);
    return this.trucks.slice().sort((a, b) => {
      if (a.finishedAt !== null && b.finishedAt !== null) return a.finishPlace - b.finishPlace;
      if (a.finishedAt !== null) return -1; if (b.finishedAt !== null) return 1;
      return b.trackS - a.trackS;
    });
  }
  hud() {
    const rows = this.standings().map((tr, i) => ({ name: tr.name, color: this.colorOf(tr), you: tr.isPlayer, score: tr.finishedAt !== null ? fmtTime(tr.finishedAt) : '', pos: this.playerFinished ? tr.targetRank : tr.finishedAt !== null ? tr.finishPlace : i + 1 }));
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
