// A single match: scene, weather, city, trucks, physics loop, event routing to the active mode.
import * as THREE from 'three';
import { RNG } from './core/rng.js';
import { clamp, damp } from './core/math.js';
import { TRUCKS } from './data/trucks.js';
import { makePlan } from './world/layouts.js';
import { buildCity } from './world/city.js';
import { generateTrack } from './world/track.js';
import { Truck, collideTrucks } from './vehicles/truck.js';
import { Specials } from './vehicles/specials.js';
import { Particles } from './fx/particles.js';
import { RaceMode } from './modes/race.js';
import { RumbleMode } from './modes/rumble.js';
import { SoccerMode } from './modes/soccer.js';
import { ChairsMode } from './modes/chairs.js';

const MODE_CLASSES = { race: RaceMode, rumble: RumbleMode, soccer: SoccerMode, chairs: ChairsMode };
const STEP = 1 / 60;

export class Game {
  constructor({ renderer, input, audio, hud, params, outcome, playerDef, onFinish, onQuit }) {
    this.renderer = renderer; this.input = input; this.audio = audio; this.hud = hud;
    this.params = params; this.outcome = outcome; this.playerDef = playerDef; this.onFinish = onFinish; this.onQuit = onQuit;
    this.rng = new RNG(params.seed);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.5, 900);
    this.time = 0; this.accum = 0; this.state = 'countdown'; this.countdown = 3.6; this.done = false;
    this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3(); this.camOrbit = 0;
    this.shakeT = 0;
    this.build();
  }

  build() {
    const { params, scene, rng } = this;
    const w = params.weather, nb = params.neighbourhood;
    scene.background = new THREE.Color(w.sky);
    scene.fog = new THREE.Fog(w.fog, w.fogNear, w.fogFar);
    this.hemi = new THREE.HemisphereLight(w.hemi[0], w.hemi[1], w.ambient * 2.0); scene.add(this.hemi);
    this.amb = new THREE.AmbientLight(0xffffff, w.ambient * 0.5); scene.add(this.amb);
    this.sun = new THREE.DirectionalLight(w.sunColor, w.sun); this.sun.position.set(60, 90, 40);
    this.sun.castShadow = true; const sc = this.sun.shadow.camera; sc.left = sc.bottom = -75; sc.right = sc.top = 75; sc.near = 10; sc.far = 300;
    this.sun.shadow.mapSize.set(this.input.isTouch ? 1024 : 2048, this.input.isTouch ? 1024 : 2048); this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun); scene.add(this.sun.target);

    // plan + track + city
    this.plan = makePlan(params.mode, params, rng);
    if (params.mode === 'race') this.track = generateTrack(this.plan, rng);
    const city = buildCity(scene, this.plan, nb, w, rng);
    this.city = city; this.world = city.world; this.props = city.props;
    if (this.track?.features.overpass) { const o = this.track.features.overpass; o.world = this.world.addOverpass(o.ax, o.az, o.bx, o.bz, 5, 6, 22); }

    this.fx = new Particles(scene);
    this.specials = new Specials(scene, this.fx, this.audio, rng);

    // trucks
    const bots = rng.shuffle(TRUCKS.filter((t) => t.id !== this.playerDef.id)).slice(0, params.players - 1);
    this.player = new Truck(this.playerDef, { isPlayer: true });
    this.bots = bots.map((d) => new Truck(d));
    this.trucks = [this.player, ...this.bots];
    for (const t of this.trucks) scene.add(t.mesh);

    if (w.night) { this.headlight = new THREE.SpotLight(0xfff2cc, 180, 60, 0.6, 0.5, 1.2); this.headlight.castShadow = false; scene.add(this.headlight); scene.add(this.headlight.target); }
    if (w.rain) {
      const n = 1200, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 120; pos[i * 3 + 1] = Math.random() * 40; pos[i * 3 + 2] = (Math.random() - 0.5) * 120; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.rain = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfe3ff, size: 0.25, transparent: true, opacity: 0.6 })); scene.add(this.rain);
    }

    this.mode = new MODE_CLASSES[params.mode](this);
    this.mode.setup();
    for (const t of this.trucks) t.syncMesh(0);
    this.hud.show(this);
    this.hud.announce('3', true);
    this.audio.startEngine();
    this.input.enabled = false;
    // initial camera
    this.updateCamera(1, true);
  }

  update(dtReal) {
    if (this.done) return;
    const dt = Math.min(dtReal, 0.05);
    if (this.state === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      const now = Math.ceil(this.countdown);
      if (now !== before && now > 0) { this.hud.announce(String(now), true); this.audio.beep(false); }
      if (this.countdown <= 0) { this.state = 'play'; this.hud.announce('GO!'); this.audio.beep(true); this.input.enabled = true; }
      this.updateCamera(dt);
      this.hud.update(this, dt);
      return;
    }
    this.accum += dt;
    let steps = 0;
    while (this.accum >= STEP && steps < 4) { this.step(STEP); this.accum -= STEP; steps++; }
    if (steps === 4) this.accum = 0;
    this.updateCamera(dt);
    this.hud.update(this, dt);
    if (this.mode.finished) {
      this.mode.endTimer -= dt;
      if (this.mode.endTimer <= 0 && !this.done) { this.done = true; this.onFinish(this.mode.result); }
    }
  }

  step(dt) {
    this.time += dt;
    const t = this.time;
    const input = this.input.poll();
    const p = this.player;
    if (this.autopilot) { /* mode.autopilot drives the player */ }
    else if (p.alive && !this.mode.finished) {
      p.control.steer = input.steer; p.control.throttle = input.throttle; p.control.handbrake = input.handbrake;
      p.control.turbo = input.turboPressed;
      if (input.specialPressed) this.specials.use(p, this.trucks, (a, v, k, s) => this.mode.onSpecialHit(a, v, k, s));
    } else { p.control.throttle = 0; p.control.steer = 0; p.control.turbo = false; }

    if (this.autopilot && this.mode.autopilot) this.mode.autopilot(dt, t);
    this.mode.update(dt, t);

    for (const tr of this.trucks) {
      if (!tr.alive) continue;
      if (!tr.isPlayer && tr.control.special) { tr.control.special = false; this.specials.use(tr, this.trucks, (a, v, k, s) => this.mode.onSpecialHit(a, v, k, s)); }
      tr.update(dt, this.world, t);
      tr.collideProps(this.props, (prop, how, strength) => this.onPropHit(tr, prop, how, strength));
    }
    // truck vs truck
    const T = this.trucks;
    for (let i = 0; i < T.length; i++) {
      if (!T[i].alive) continue;
      for (let j = i + 1; j < T.length; j++) {
        if (!T[j].alive) continue;
        const r = collideTrucks(T[i], T[j]);
        if (r && r.strength > 0) this.onTruckHit(T[i], T[j], r);
      }
    }
    // consume truck events
    for (const tr of this.trucks) {
      for (const ev of tr.events) {
        if (ev.type === 'turbo') { if (tr.isPlayer || this.near(tr)) this.audio.boost(); }
        else if (ev.type === 'wall') { if (ev.strength > 0.4) { this.fx.sparks(ev.x ?? tr.x, tr.y + 0.6, ev.z ?? tr.z, 8); if (tr.isPlayer) { this.audio.hit(ev.strength); this.shake(ev.strength * 0.5); } else if (this.near(tr)) this.audio.hit(ev.strength * 0.5); } }
        else if (ev.type === 'land') { this.fx.smoke(tr.x, tr.y + 0.3, tr.z, 5, 0x999999, 0.6); if (tr.isPlayer) this.audio.thud(); }
      }
      tr.events.length = 0;
      // continuous fx
      if (tr.turboTime > 0 && Math.random() < 0.8) this.fx.emit(2, (q) => { q.x = tr.x - tr.fwdX * 2.8 + (Math.random() - 0.5); q.y = tr.y + 0.8; q.z = tr.z - tr.fwdZ * 2.8 + (Math.random() - 0.5); q.vx = -tr.fwdX * 10; q.vz = -tr.fwdZ * 10; q.vy = 1; q.g = 0; q.size = 0.6; q.grow = -0.5; q.life = 0.35; q.color = Math.random() < 0.5 ? 0xff6a2a : 0xffd166; });
      if (tr.drifting && tr.speed > 8 && Math.random() < 0.6) this.fx.smoke(tr.x - tr.fwdX * 1.6, tr.y + 0.2, tr.z - tr.fwdZ * 1.6, 1, 0xdddddd, 0.6);
      if (tr.fx.stun > 0 && Math.random() < 0.4) this.fx.smoke(tr.x, tr.y + 2.5, tr.z, 1, 0x444444, 0.7);
      if (tr.fx.burn > 0 && Math.random() < 0.5) this.fx.smoke(tr.x, tr.y + 1, tr.z, 1, 0xff5722, 0.4);
    }
    this.specials.update(dt, this.trucks, t, this.world, (a, v, k, s) => this.mode.onSpecialHit(a, v, k, s));
    this.props.update(dt);
    this.fx.update(dt);
    if (this.rain) { const pos = this.rain.geometry.attributes.position; for (let i = 0; i < pos.count; i++) { let y = pos.getY(i) - 40 * dt; if (y < 0) y += 40; pos.setY(i, y); } pos.needsUpdate = true; this.rain.position.set(this.camera.position.x, 0, this.camera.position.z); }
    // audio
    const sr = clamp(p.speed / p.maxSpeed, 0, 1.2);
    this.audio.setEngine(sr, p.turboTime > 0);
  }

  near(tr) { return Math.hypot(tr.x - this.player.x, tr.z - this.player.z) < 35; }
  shake(a) { this.shakeT = Math.max(this.shakeT, Math.min(0.5, a * 0.3)); }

  onTruckHit(a, b, r) {
    const now = this.time;
    const s = r.strength;
    if (s > 2) {
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      this.fx.sparks(mx, Math.max(a.y, b.y) + 1, mz, Math.min(20, 4 + s), 0xffd166);
      if (s > 9) this.fx.debris(mx, 1.5, mz, 6, 0x444444);
      if (a.isPlayer || b.isPlayer) { this.audio.hit(s / 8); this.shake(s / 15); } else if (this.near(a)) this.audio.hit(s / 14);
    }
    // who hit whom: the one moving faster toward the other is the attacker
    const va = a.vx * -r.nx + a.vz * -r.nz, vb = b.vx * r.nx + b.vz * r.nz;
    const att = va > vb ? a : b, vic = att === a ? b : a;
    if (s > 2) { vic.lastHitBy = att; vic.lastHitTime = now; }
    this.mode.onTruckHit(att, vic, { strength: s, time: now });
  }
  onPropHit(tr, prop, how, strength) {
    if (how === 'smash') {
      this.fx.debris(prop.x, 0.8, prop.z, 5, 0x9e9e9e);
      if (tr.isPlayer) this.audio.hit(0.5 + strength * 0.3); else if (this.near(tr)) this.audio.hit(0.3);
    } else if (how === 'totaled') {
      this.fx.smoke(tr.x, tr.y + 1.5, tr.z, 14, 0x333333, 1.2); this.fx.sparks(tr.x, tr.y + 1, tr.z, 20, 0xff6a2a);
      if (tr.isPlayer) { this.audio.crash(); this.shake(1); this.hud.toast('TOTALED!', 'bad'); } else if (this.near(tr)) this.audio.crash();
    } else if (how === 'bump' && strength > 3 && tr.isPlayer) this.audio.hit(strength / 10);
    this.mode.onPropHit(tr, prop, how, strength);
  }

  updateCamera(dt, snap = false) {
    const p = this.mode.cameraTarget || this.player;
    const cam = this.camera;
    const w = this.renderer.domElement;
    const aspect = w.clientWidth / Math.max(1, w.clientHeight);
    if (cam.aspect !== aspect) { cam.aspect = aspect; cam.updateProjectionMatrix(); }
    let tx, ty, tz, lx, ly, lz;
    if (this.mode.finished || !p.alive || this.state === 'countdown') {
      this.camOrbit += dt * (this.state === 'countdown' ? 0.35 : 0.5);
      const r = 14, a = this.camOrbit + (this.state === 'countdown' ? p.heading + Math.PI * 0.75 : 0);
      tx = p.x + Math.sin(a) * r; tz = p.z + Math.cos(a) * r; ty = p.y + 6;
      lx = p.x; ly = p.y + 1.5; lz = p.z;
    } else {
      const back = 10.5 + clamp(p.speed / p.maxSpeed, 0, 1.3) * 3.5;
      // follow velocity direction slightly when drifting
      let hx = p.fwdX, hz = p.fwdZ;
      if (p.speed > 6) { const k = 0.35; hx = hx * (1 - k) + (p.vx / p.speed) * k; hz = hz * (1 - k) + (p.vz / p.speed) * k; const l = Math.hypot(hx, hz) || 1; hx /= l; hz /= l; }
      tx = p.x - hx * back; tz = p.z - hz * back; ty = p.y + 5.2 + (p.onOverpass ? 0.6 : 0);
      lx = p.x + hx * 7; ly = p.y + 1.4; lz = p.z + hz * 7;
      if (this.mode.cameraMode === 'ball' && this.mode.ball) { const b = this.mode.ball; const k = 0.35; lx = lx * (1 - k) + b.x * k; lz = lz * (1 - k) + b.z * k; }
    }
    if (snap) { this.camPos.set(tx, ty, tz); this.camLook.set(lx, ly, lz); }
    else {
      const lam = 5.5;
      this.camPos.x = damp(this.camPos.x, tx, lam, dt); this.camPos.y = damp(this.camPos.y, ty, 6, dt); this.camPos.z = damp(this.camPos.z, tz, lam, dt);
      this.camLook.x = damp(this.camLook.x, lx, 9, dt); this.camLook.y = damp(this.camLook.y, ly, 9, dt); this.camLook.z = damp(this.camLook.z, lz, 9, dt);
    }
    // keep the camera out of buildings: pull in if blocked
    const dx = this.camPos.x - p.x, dz = this.camPos.z - p.z, d = Math.hypot(dx, dz) || 1;
    const hit = this.world.rayDistance(p.x, p.z, dx / d, dz / d, d);
    if (hit < d) { const k = Math.max(0.3, (hit - 1) / d); this.camPos.x = p.x + dx * k; this.camPos.z = p.z + dz * k; this.camPos.y = Math.max(this.camPos.y, p.y + 4 + (1 - k) * 6); }
    cam.position.copy(this.camPos);
    if (this.shakeT > 0) { this.shakeT -= dt; cam.position.x += (Math.random() - 0.5) * this.shakeT * 1.2; cam.position.y += (Math.random() - 0.5) * this.shakeT * 1.2; }
    cam.lookAt(this.camLook);
    // sun follows
    this.sun.position.set(p.x + 60, 90, p.z + 40); this.sun.target.position.set(p.x, 0, p.z); this.sun.target.updateMatrixWorld();
    if (this.headlight) { this.headlight.position.set(this.player.x + this.player.fwdX * 2.5, this.player.y + 1.4, this.player.z + this.player.fwdZ * 2.5); this.headlight.target.position.set(this.player.x + this.player.fwdX * 30, 0, this.player.z + this.player.fwdZ * 30); this.headlight.target.updateMatrixWorld(); }
  }

  render() { this.renderer.render(this.scene, this.camera); }

  dispose() {
    this.audio.stopEngine(); this.audio.stopMusic();
    this.hud.hide();
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { m.map?.dispose?.(); m.emissiveMap?.dispose?.(); m.dispose(); } } });
    this.scene.clear();
  }
}
