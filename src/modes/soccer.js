// Soccer: futsal in a walled courtyard. The director schedules goals; keepers deny everything else.
import * as THREE from 'three';
import { Mode } from './base.js';
import { BotDriver } from '../ai/bot.js';
import { buildArena as buildArenaVisuals, soccerBall, teamMarker, waveFlag, NeonScoreboard } from '../world/setpieces.js';
import { clamp, fmtTime } from '../core/math.js';

const BALL_R = 1.6, TURF_Y = 0.22; // turf surface height

export class SoccerMode extends Mode {
  setup() {
    const g = this.game, A = g.plan.arena, rng = this.rng;
    this.A = A; this.timeLeft = g.params.time; this.total = g.params.time;
    this.cameraMode = 'ball';
    this.buildArena();
    // teams: player team 1 attacks +z, team 2 attacks -z
    const half = this.trucks.length / 2;
    this.player.team = 1; this.bots.forEach((b, i) => { b.team = i < half - 1 ? 1 : 2; });
    this.teams = { 1: this.trucks.filter((t) => t.team === 1), 2: this.trucks.filter((t) => t.team === 2) };
    this.drivers = new Map(); for (const b of this.bots) this.drivers.set(b.id, new BotDriver(b, rng));
    // keepers: last bot of each team
    this.keeper = { 1: this.teams[1].filter((t) => !t.isPlayer).slice(-1)[0], 2: this.teams[2].slice(-1)[0] };
    this.score = { 1: 0, 2: 0 };
    // team identity without touching the skins
    for (const tr of this.trucks) { tr.teamMarker = teamMarker(tr.team === 1 ? 0x2f9bff : 0xff4d57); tr.mesh.add(tr.teamMarker); }
    // giant neon scoreboard behind the boards on one long side, facing the pitch
    this.board = new NeonScoreboard(); const side = rng.sign();
    this.board.group.position.set(side * (A.maxX + 9), 0, 0); this.board.group.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    g.scene.add(this.board.group);
    // goal schedule
    const win = g.outcome.win, winner = win ? 1 : 2, loser = win ? 2 : 1;
    const W = rng.int(2, 4), L = rng.int(0, W - 1);
    const times = [];
    for (let i = 0; i < W + L; i++) times.push(rng.range(12, this.total - 12));
    times.sort((a, b) => a - b);
    const teamsSeq = rng.shuffle([...Array(W).fill(winner), ...Array(L).fill(loser)]);
    // make sure the last goal goes to the winner for drama
    const li = teamsSeq.lastIndexOf(winner); [teamsSeq[li], teamsSeq[teamsSeq.length - 1]] = [teamsSeq[teamsSeq.length - 1], teamsSeq[li]];
    this.schedule = times.map((t, i) => ({ t, team: teamsSeq[i], done: false }));
    this.winner = winner;
    g.world.addPad(this.A.minX, this.A.minZ - this.A.goalDepth, this.A.maxX, this.A.maxZ + this.A.goalDepth, TURF_Y);
    this.ball = { x: 0, y: BALL_R + TURF_Y, z: 0, vx: 0, vy: 0, vz: 0, lastTouch: null, lastTouchT: -9 };
    const bm = soccerBall(BALL_R); g.scene.add(bm); this.ballMesh = bm;
    this.kickoff(1.5);
    this.celebrate = 0; this.stoppage = false; this.lastShotDenied = -9;
    this.teamColors = { 1: '#3aa9ff', 2: '#ef3b4b' };
  }
  buildArena() {
    const g = this.game, A = this.A, world = g.world, T = 1.0, wallH = A.wallH;
    const box = (x0, z0, x1, z1, h, kind = 'board') => world.addAABB(x0, z0, x1, z1, kind, h);
    box(A.minX - T, A.minZ - A.goalDepth - T, A.minX, A.maxZ + A.goalDepth + T, wallH);
    box(A.maxX, A.minZ - A.goalDepth - T, A.maxX + T, A.maxZ + A.goalDepth + T, wallH);
    for (const [z, sgn] of [[A.minZ, -1], [A.maxZ, 1]]) {
      const z0 = sgn < 0 ? z - T : z, z1 = sgn < 0 ? z : z + T;
      box(A.minX - T, z0, -A.goalHalf, z1, wallH); box(A.goalHalf, z0, A.maxX + T, z1, wallH);
      const back0 = sgn < 0 ? z - A.goalDepth - T : z + A.goalDepth, back1 = back0 + T;
      box(-A.goalHalf - T, back0, A.goalHalf + T, back1, 7, 'net');
      const zi0 = Math.min(z, back0), zi1 = Math.max(z1, back1);
      box(-A.goalHalf - T, zi0, -A.goalHalf, zi1, 7, 'net'); box(A.goalHalf, zi0, A.goalHalf + T, zi1, 7, 'net');
    }
    buildArenaVisuals(g.scene, A);
  }
  kickoff(delay) {
    const A = this.A;
    this.pause = delay; this.ball.x = 0; this.ball.z = 0; this.ball.y = 12; this.ball.vx = this.ball.vy = this.ball.vz = 0;
    this.ball.live = false; // nobody can touch it until it has dropped and bounced
    for (const team of [1, 2]) {
      const sgn = team === 1 ? -1 : 1, list = this.teams[team], n = list.length;
      list.forEach((tr, i) => {
        const isK = tr === this.keeper[team];
        const row = isK ? 0.92 : (i === 0 ? 0.28 : 0.6);
        const lat = isK ? 0 : ((i % 2 ? 1 : -1) * (8 + Math.floor(i / 2) * 10)) * (i === 0 ? 0 : 1);
        tr.place(lat, sgn * A.maxZ * row, sgn < 0 ? 0 : Math.PI);
      });
    }
    this.ballMesh.position.set(0, this.ball.y, 0);
  }
  /** Per-frame cosmetics: flags, scoreboard. */
  decorate(dt, t) {
    for (const tr of this.trucks) if (tr.teamMarker) waveFlag(tr.teamMarker, t + tr.id, tr.speed);
    const sec = Math.max(0, Math.ceil(this.timeLeft)), mm = Math.floor(sec / 60), ss = String(sec % 60).padStart(2, '0');
    this.board.update({ blue: this.score[1], red: this.score[2], time: `${mm}:${ss}`, note: this.stoppage ? 'STOPPAGE TIME' : this.pause > 0 ? 'KICK OFF' : '' });
  }
  /** Ball cam on/off (Rocket League style). */
  toggleCamera() { this.cameraMode = this.cameraMode === 'ball' ? 'car' : 'ball'; this.game.hud.toast(this.cameraMode === 'ball' ? 'BALL CAM' : 'CAR CAM', 'gold'); this.game.hud.setCamMode(this.cameraMode); }
  applyRender(alpha) { const b = this.ball; if (b.px === undefined) return; this.ballMesh.position.set(b.px + (b.x - b.px) * alpha, b.py + (b.y - b.py) * alpha, b.pz + (b.z - b.pz) * alpha); }
  goalZ(team) { return team === 1 ? this.A.maxZ : this.A.minZ; } // goal the team attacks
  ownGoalZ(team) { return team === 1 ? this.A.minZ : this.A.maxZ; }
  pendingGoal() { return this.schedule.find((s) => !s.done && s.t <= this.elapsed) || null; }
  allowed(team) { const pg = this.pendingGoal(); if (pg && pg.team === team) return true; if (this.stoppage && team === this.winner) return true; return false; }

  update(dt, t) {
    super.update(dt, t);
    const g = this.game;
    if (this.finished) { for (const b of this.bots) this.drivers.get(b.id).stop(dt); this.updateBall(dt, false); return; }
    if (this.pause > 0) { this.pause -= dt; for (const b of this.bots) this.drivers.get(b.id).stop(dt); this.ball.px = this.ball.x; this.ball.py = this.ball.y; this.ball.pz = this.ball.z; this.ballMesh.position.set(this.ball.x, this.ball.y, this.ball.z); this.decorate(dt, t); return; }
    if (!this.stoppage) this.timeLeft -= dt;
    this.directBots(dt, t);
    this.updateBall(dt, true);
    this.decorate(dt, t);
    if (this.timeLeft <= 0 && !this.stoppage) {
      const leader = this.score[1] === this.score[2] ? 0 : (this.score[1] > this.score[2] ? 1 : 2);
      if (leader === this.winner) this.endMatch();
      else { this.stoppage = true; g.hud.announce('STOPPAGE TIME'); g.audio.whistle(); }
    }
  }
  updateBall(dt, live) {
    const b = this.ball, A = this.A, g = this.game;
    b.px = b.x; b.py = b.y; b.pz = b.z;
    b.vy -= 20 * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    const drag = Math.exp(-0.25 * dt); b.vx *= drag; b.vz *= drag;
    if (b.y < BALL_R + TURF_Y) { if (!b.live) { b.live = true; this.game.audio.thud(); this.game.fx.smoke(b.x, 0.3, b.z, 6, 0xdddddd, 0.6); } b.y = BALL_R + TURF_Y; b.vy = Math.abs(b.vy) > 1.5 ? -b.vy * 0.6 : 0; b.vx *= 0.97; b.vz *= 0.97; }
    if (b.y > 16) { b.y = 16; b.vy = -Math.abs(b.vy) * 0.5; }
    // side walls
    if (b.x < A.minX + BALL_R) { b.x = A.minX + BALL_R; b.vx = Math.abs(b.vx) * 0.8; }
    if (b.x > A.maxX - BALL_R) { b.x = A.maxX - BALL_R; b.vx = -Math.abs(b.vx) * 0.8; }
    // end walls & goals
    for (const [z, sgn, team] of [[A.minZ, -1, 2], [A.maxZ, 1, 1]]) { // team = attacking team scoring into this end
      const crossing = sgn < 0 ? b.z < z + BALL_R : b.z > z - BALL_R;
      if (!crossing) continue;
      const inMouth = Math.abs(b.x) < A.goalHalf - BALL_R * 0.5 && b.y < 6 - BALL_R * 0.5;
      const deep = sgn < 0 ? b.z < z - 1.5 : b.z > z + 1.5;
      if (inMouth) {
        if (live && !deep && !this.allowed(team) && (sgn < 0 ? b.vz < 0 : b.vz > 0)) {
          // denied: ring off the post/bar
          b.vz = -b.vz * 0.7; b.vx += (Math.random() - 0.5) * 6; b.vy += 3;
          b.x = Math.sign(b.x || 1) * (A.goalHalf - BALL_R * 0.6);
          g.fx.sparks(b.x, 5, z, 16, 0xffffff); g.audio.tone?.(1800, 0.25, 'square', 0.15);
          if (this.elapsed - this.lastShotDenied > 1) { this.lastShotDenied = this.elapsed; g.hud.toast('OFF THE POST!', 'bad'); }
        } else if (live && deep) { this.goal(team); return; }
        else {
          // inside the goal box: bounce on back/sides
          const back = sgn < 0 ? z - A.goalDepth + BALL_R : z + A.goalDepth - BALL_R;
          if ((sgn < 0 && b.z < back) || (sgn > 0 && b.z > back)) { b.z = back; b.vz = -b.vz * 0.4; }
          if (Math.abs(b.x) > A.goalHalf - BALL_R) { b.x = Math.sign(b.x) * (A.goalHalf - BALL_R); b.vx = -b.vx * 0.5; }
          if (b.y > 6 - BALL_R) { b.y = 6 - BALL_R; b.vy = -Math.abs(b.vy) * 0.4; }
        }
      } else {
        const lim = sgn < 0 ? z + BALL_R : z - BALL_R;
        if (sgn < 0 ? b.z < lim : b.z > lim) { b.z = lim; b.vz = -b.vz * 0.8; }
      }
    }
    // trucks hit the ball
    if (live && b.live) for (const tr of this.trucks) {
      if (!tr.alive) continue;
      // closest point on truck OBB (2D) to ball
      const dx = b.x - tr.x, dz = b.z - tr.z;
      const c = Math.cos(tr.heading), s = Math.sin(tr.heading);
      const lx = dx * c - dz * s, lz = dx * s + dz * c; // local: lx right, lz forward
      const cx = clamp(lx, -tr.hw, tr.hw), cz = clamp(lz, -tr.hl, tr.hl);
      const ddx = lx - cx, ddz = lz - cz, d = Math.hypot(ddx, ddz);
      if (d > BALL_R || b.y - BALL_R > tr.y + 3.2) continue;
      let nx, nz;
      if (d < 1e-4) { nx = Math.sin(tr.heading); nz = Math.cos(tr.heading); } else { const wx = ddx * c + ddz * s, wz = -ddx * s + ddz * c; nx = wx / d; nz = wz / d; }
      const push = BALL_R - d + 0.05; b.x += nx * push; b.z += nz * push;
      const rvx = b.vx - tr.vx, rvz = b.vz - tr.vz, vn = rvx * nx + rvz * nz;
      if (vn < 0) {
        const e = 0.9; const j = -(1 + e) * vn;
        b.vx += nx * j; b.vz += nz * j;
        const spd = tr.speed;
        b.vy += clamp(spd * 0.35, 1.5, 11);
        // nudge toward the aim point if the team is allowed to score (hidden hand)
        if (tr.aimX !== undefined && this.allowed(tr.team) && !tr.isPlayer) {
          const ax = tr.aimX - b.x, az = tr.aimZ - b.z, al = Math.hypot(ax, az) || 1, sp = Math.hypot(b.vx, b.vz);
          b.vx = b.vx * 0.4 + (ax / al) * sp * 0.6; b.vz = b.vz * 0.4 + (az / al) * sp * 0.6;
        }
        b.lastTouch = tr; b.lastTouchT = this.elapsed;
        g.fx.sparks(b.x, b.y, b.z, 6, 0xffffff);
        if (tr.isPlayer || g.near(tr)) g.audio.thud();
      }
    }
    // homing when a goal is overdue: gently bend toward the goal when heading that way in the attacking half
    if (live) {
      const pg = this.pendingGoal();
      const team = pg ? pg.team : (this.stoppage ? this.winner : 0);
      const overdue = pg ? this.elapsed - pg.t : (this.stoppage ? 30 : 0);
      if (team && overdue > 5 && b.lastTouch && b.lastTouch.team === team && this.elapsed - b.lastTouchT < 3) {
        const gz = this.goalZ(team), toward = Math.sign(gz) === Math.sign(b.vz);
        const sp = Math.hypot(b.vx, b.vz);
        if (toward && sp > 4) {
          const ax = -b.x * 0.6, az = gz - b.z, al = Math.hypot(ax, az), k = clamp((overdue - 5) / 15, 0.2, 1) * 5 * dt;
          const want = Math.max(sp, overdue > 15 ? 22 : sp);
          b.vx += (ax / al * want - b.vx) * k; b.vz += (az / al * want - b.vz) * k;
          if (Math.abs(gz - b.z) < 30 && b.y > 4.5) b.vy -= 10 * dt; // keep it under the bar
        }
      }
    }
    this.ballMesh.position.set(b.x, b.y, b.z);
    this.ballMesh.rotation.x += b.vz * dt / BALL_R; this.ballMesh.rotation.z -= b.vx * dt / BALL_R;
  }
  goal(team) {
    const g = this.game;
    this.score[team]++;
    const pg = this.pendingGoal(); if (pg && pg.team === team) pg.done = true;
    else { const nxt = this.schedule.find((s) => !s.done && s.team === team); if (nxt) nxt.done = true; }
    const scorer = this.ball.lastTouch && this.ball.lastTouch.team === team ? this.ball.lastTouch : null;
    const mine = team === 1;
    g.hud.announce(mine ? 'GOAL!' : 'GOAL AGAINST');
    g.hud.toast(scorer ? `${scorer.isPlayer ? 'YOU' : scorer.name} SCORED${scorer.isPlayer ? '!' : ''}` : 'OWN GOAL', mine ? 'good' : 'bad');
    g.audio.goal();
    g.fx.confetti(this.ball.x, 6, this.ball.z, mine ? 120 : 40, 10);
    this.kickoff(3);
    if (this.stoppage && team === this.winner) { this.stoppage = false; this.timeLeft = 0; this.endMatch(); }
  }
  endMatch() {
    const g = this.game, place = g.outcome.place;
    g.hud.announce(place === 1 ? 'YOU WIN!' : 'DEFEAT');
    if (place === 1) { g.audio.fanfare(); g.fx.confetti(this.player.x, 6, this.player.z, 200, 14); } else g.audio.sad();
    g.audio.whistle();
    const ranking = [...this.teams[this.winner], ...this.teams[this.winner === 1 ? 2 : 1]].map((tr, i) => ({ truck: tr, place: tr.team === this.winner ? 1 : 2, score: tr.team === 1 ? 'BLUE' : 'RED' }));
    this.finish(place, ranking, 4);
  }

  directBots(dt, t) {
    const g = this.game, b = this.ball, A = this.A;
    for (const team of [1, 2]) {
      const list = this.teams[team], gz = this.goalZ(team), ogz = this.ownGoalZ(team), allowed = this.allowed(team);
      const opp = team === 1 ? 2 : 1;
      // chaser: closest non-keeper to the ball
      let chaser = null, bd = 1e9;
      for (const tr of list) { if (tr === this.keeper[team] || tr.isPlayer) continue; const d = Math.hypot(tr.x - b.x, tr.z - b.z); if (d < bd) { bd = d; chaser = tr; } }
      const pg = this.pendingGoal();
      const urgency = allowed ? clamp((this.elapsed - (pg ? pg.t : this.elapsed)) / 15, 0.3, 1.3) : 0.6;
      for (const tr of list) {
        if (tr.isPlayer) continue;
        const drv = this.drivers.get(tr.id);
        const isK = tr === this.keeper[team];
        let tx, tz, sf = 1.0, aim = null, aggressive = false;
        if (isK) {
          // keeper: sit on the line tracking the ball; lunge when the ball comes toward the goal and we must deny
          const sgn = Math.sign(ogz);
          const lineZ = ogz - sgn * 4;
          const ballComing = Math.sign(b.vz) === sgn && Math.abs(b.z - ogz) < 45 && Math.hypot(b.vx, b.vz) > 4;
          const mustDeny = !this.allowed(opp);
          let predX = b.x;
          if (ballComing && Math.abs(b.vz) > 0.5) { const tt = (lineZ - b.z) / b.vz; predX = b.x + b.vx * tt; }
          tx = clamp(predX, -A.goalHalf + 1, A.goalHalf - 1); tz = lineZ;
          sf = 1.0;
          if (ballComing && mustDeny && Math.abs(b.z - ogz) < 30) { tx = b.x + b.vx * 0.25; tz = b.z + b.vz * 0.25; sf = 1.4; aggressive = true; tr.maxSpeed = tr._baseMax ? tr._baseMax * 1.5 : (tr._baseMax = tr.maxSpeed, tr.maxSpeed * 1.5); }
          else { if (tr._baseMax) tr.maxSpeed = tr._baseMax; }
          if (!mustDeny && ballComing) { tx = clamp(predX + (predX > 0 ? -10 : 10), -A.goalHalf, A.goalHalf); sf = 0.5; } // step aside: the goal is scheduled
          aim = { x: 0, z: gz };
        } else if (tr === chaser) {
          // approach the ball from behind relative to the aim point
          const inAttackHalf = Math.sign(b.z - 0) === Math.sign(gz) || Math.abs(b.z) < 10;
          let aimX = 0, aimZ = gz;
          // passing: pick a teammate further upfield with space
          let mate = null, best = -1e9;
          for (const m of list) { if (m === tr || m === this.keeper[team]) continue; const up = (m.z - b.z) * Math.sign(gz); if (up < 5) continue; let near = 1e9; for (const o of this.teams[opp]) near = Math.min(near, Math.hypot(o.x - m.x, o.z - m.z)); const sc = up + near * 0.8 - Math.abs(m.x) * 0.3; if (sc > best) { best = sc; mate = m; } }
          const distGoal = Math.hypot(b.x, gz - b.z);
          const shoot = distGoal < 40 || !mate || this.rng.chance(0.25 * urgency) || (allowed && urgency > 0.8);
          if (!shoot && mate) { aimX = mate.x + mate.vx * 0.5; aimZ = mate.z + mate.vz * 0.5; }
          if (shoot && !allowed) { aimX = (b.x > 0 ? 1 : -1) * (A.goalHalf + 6); } // shots drift wide
          if (shoot && allowed) { aimX = clamp(-b.x * 0.3, -A.goalHalf + 3, A.goalHalf - 3); }
          const ax = aimX - b.x, az = aimZ - b.z, al = Math.hypot(ax, az) || 1;
          const behind = 4.5;
          tx = b.x - (ax / al) * behind + b.vx * 0.25; tz = b.z - (az / al) * behind + b.vz * 0.25;
          // if we're on the wrong side of the ball, swing around
          const sx = tr.x - b.x, sz = tr.z - b.z; const dot = (sx * ax + sz * az) / (al * (Math.hypot(sx, sz) || 1));
          if (dot > 0.3 && Math.hypot(sx, sz) < 10) { const px = -az / al, pz = ax / al; const side = (sx * px + sz * pz) > 0 ? 1 : -1; tx = b.x + px * side * 8 - (ax / al) * 6; tz = b.z + pz * side * 8 - (az / al) * 6; }
          sf = 1.1 + 0.2 * urgency; aggressive = true; aim = { x: aimX, z: aimZ };
          if (Math.hypot(tr.x - b.x, tr.z - b.z) < 12 && Math.abs(dot) < 0.4 && tr.turboCd <= 0 && allowed) tr.control.turbo = true;
          void inAttackHalf;
        } else {
          // support positions: spread laterally, stay between ball and own goal or push up
          const idx = list.indexOf(tr), side = idx % 2 ? 1 : -1;
          const up = Math.sign(gz);
          const supportZ = clamp(b.z + up * (allowed ? 14 : -6) * (idx % 3 === 0 ? 1 : 0.4), Math.min(ogz, gz) * 0.85, Math.max(ogz, gz) * 0.85);
          tx = clamp(b.x * 0.3 + side * 16, A.minX + 6, A.maxX - 6); tz = supportZ;
          sf = Math.hypot(tx - tr.x, tz - tr.z) < 6 ? 0.1 : 0.85;
          // while the other side is due a goal, this team's defenders hang back (tired legs)
          if (this.allowed(opp)) { sf = Math.min(sf, 0.5); tz = clamp(ogz * 0.6, Math.min(ogz, gz), Math.max(ogz, gz)); }
          aim = { x: 0, z: gz };
        }
        tr.aimX = aim.x; tr.aimZ = aim.z;
        drv.drive(tx, tz, sf, dt, t, { world: null, avoidTrucks: aggressive ? null : this.trucks, aggressive, turbo: aggressive });
        if (g.specials.botWants(tr, this.trucks, dt, 0.5)) tr.control.special = true;
      }
    }
  }
  autopilot(dt, t) {
    const p = this.player, b = this.ball, gz = this.goalZ(1);
    if (this.pause > 0) { this.playerDriver().stop(dt); return; }
    const ax = -b.x, az = gz - b.z, al = Math.hypot(ax, az) || 1;
    const tx = b.x - (ax / al) * 4 + b.vx * 0.2, tz = b.z - (az / al) * 4 + b.vz * 0.2;
    this.playerDriver().drive(tx, tz, 1.2, dt, t, { world: null, aggressive: true, turbo: true });
  }
  hud() {
    const rows = [];
    for (const team of [1, 2]) {
      rows.push({ header: team === 1 ? `BLUE ${this.score[1]}` : `RED ${this.score[2]}` });
      for (const tr of this.teams[team]) rows.push({ name: tr.name + (tr === this.keeper[team] ? ' (GK)' : ''), color: this.colorOf(tr), you: tr.isPlayer, score: '', pos: '' });
    }
    return { rows, timer: `${this.score[1]} - ${this.score[2]}`, sub: (this.stoppage ? 'STOPPAGE · ' : '') + fmtTime(this.timeLeft) };
  }
  drawMinimap(ctx, size) {
    const A = this.A, m = this.mapper(0, 0, A.maxZ + 14, size);
    const [x0, y0] = m(A.minX, A.minZ), [x1, y1] = m(A.maxX, A.maxZ);
    ctx.fillStyle = 'rgba(78,138,58,0.6)'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    const [gx0] = m(-A.goalHalf, 0), [gx1] = m(A.goalHalf, 0);
    ctx.fillStyle = '#3aa9ff'; ctx.fillRect(gx0, y0 - 4, gx1 - gx0, 4);
    ctx.fillStyle = '#ef3b4b'; ctx.fillRect(gx0, y1, gx1 - gx0, 4);
    for (const tr of this.trucks) { if (tr.isPlayer) continue; const [px, py] = m(tr.x, tr.z); this.dot(ctx, px, py, this.teamColors[tr.team], 3.5); }
    const [px, py] = m(this.player.x, this.player.z); this.dot(ctx, px, py, '#ffb02a', 5, true);
    const [bx, by] = m(this.ball.x, this.ball.z); this.dot(ctx, bx, by, '#fff', 3, true);
  }
}
