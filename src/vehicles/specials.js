// Special moves: hazards dropped on the road, projectiles, radial bursts, forward cones and self buffs.
import * as THREE from 'three';
import { angleDiff } from '../core/math.js';

const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

export class Specials {
  constructor(scene, particles, audio, rng) {
    this.scene = scene; this.fx = particles; this.audio = audio; this.rng = rng;
    this.hazards = []; this.projectiles = [];
    this.group = new THREE.Group(); scene.add(this.group);
  }
  dispose() { this.scene.remove(this.group); }

  inFront(att, v, range, halfAngle) {
    const dx = v.x - att.x, dz = v.z - att.z, d = Math.hypot(dx, dz);
    if (d > range || d < 0.1) return false;
    return Math.abs(angleDiff(att.heading, Math.atan2(dx, dz))) < halfAngle;
  }
  behind(att, v, range) {
    const dx = v.x - att.x, dz = v.z - att.z, d = Math.hypot(dx, dz);
    if (d > range) return false;
    return Math.abs(angleDiff(att.heading, Math.atan2(dx, dz))) > Math.PI * 0.6;
  }

  /** Bot heuristic: should this truck fire its special now? */
  botWants(tr, trucks, dt, aggression = 1) {
    if (tr.spCd > 0 || tr.disabled() || tr.speed < 4) return false;
    const k = tr.def.special.kind;
    let ok = false;
    for (const v of trucks) {
      if (v === tr || !v.alive || (v.team !== undefined && tr.team !== 0 && v.team === tr.team && tr.team !== 0)) continue;
      if (v.team === tr.team && v.team) continue;
      switch (k) {
        case 'projectile': case 'net': case 'freezeCone': case 'lasso': case 'wave': ok = this.inFront(tr, v, 26, 0.5); break;
        case 'slick': case 'mines': case 'smoke': case 'tornado': ok = this.behind(tr, v, 16); break;
        case 'radialKnock': case 'shockwave': case 'drunk': case 'spinAttack': ok = Math.hypot(v.x - tr.x, v.z - tr.z) < 9; break;
        case 'ram': ok = this.inFront(tr, v, 22, 0.6); break;
        case 'lob': ok = this.inFront(tr, v, 32, 0.6) && Math.hypot(v.x - tr.x, v.z - tr.z) > 10; break;
      }
      if (ok) break;
    }
    return ok && this.rng.chance(1.2 * aggression * dt);
  }

  /** Fire a truck's special. onHit(attacker, victim, kind) called when a victim is affected. */
  use(tr, trucks, onHit) {
    if (tr.spCd > 0 || tr.disabled()) return false;
    const sp = tr.def.special, k = sp.kind;
    tr.spCd = tr.spCdMax;
    const fX = tr.fwdX, fZ = tr.fwdZ;
    const others = trucks.filter((v) => v !== tr && v.alive && !(v.team && v.team === tr.team));
    this.audio.special();
    switch (k) {
      case 'radialKnock': case 'spinAttack': {
        const R = k === 'radialKnock' ? 9.5 : 8.5;
        this.fx.ring(tr.x, 1, tr.z, k === 'radialKnock' ? 0xa5452a : 0xd98c3f, R);
        if (k === 'spinAttack') tr.angVel += 14;
        for (const v of others) {
          const dx = v.x - tr.x, dz = v.z - tr.z, d = Math.hypot(dx, dz);
          if (d > R) continue;
          const s = 1 - d / R * 0.5;
          v.impulse((dx / d) * 22 * s * v.mass, (dz / d) * 22 * s * v.mass, 3 * v.mass);
          v.applyEffect('spin', 0.9); v.angVel += 6 * Math.sign(dx * fZ - dz * fX);
          this.fx.sparks(v.x, 1.5, v.z, 10, 0xffd166);
          this.hitMark(tr, v); onHit?.(tr, v, k, 1.2);
        }
        break;
      }
      case 'shockwave': {
        const R = 11; this.fx.ring(tr.x, 0.5, tr.z, 0x9b4dca, R); this.fx.debris(tr.x, 0.5, tr.z, 16, 0x6d4c41); this.audio.thud();
        tr.bounce = 0.6;
        for (const v of others) {
          const dx = v.x - tr.x, dz = v.z - tr.z, d = Math.hypot(dx, dz);
          if (d > R) continue;
          v.impulse((dx / d) * 8 * v.mass, (dz / d) * 8 * v.mass, 11 * v.mass);
          v.applyEffect('spin', 0.5); this.hitMark(tr, v); onHit?.(tr, v, k, 1.5);
        }
        break;
      }
      case 'drunk': {
        const R = 12; this.fx.ring(tr.x, 1, tr.z, 0xffc400, R); this.fx.splash(tr.x, 2, tr.z, 0xffe08a, 20);
        for (const v of others) { if (Math.hypot(v.x - tr.x, v.z - tr.z) > R) continue; v.applyEffect('drunk', 3.5); this.hitMark(tr, v); onHit?.(tr, v, k, 0.6); }
        break;
      }
      case 'freezeCone': {
        this.audio.freeze();
        for (let i = 0; i < 24; i++) this.fx.emit(1, (p) => { const a = tr.heading + (Math.random() - 0.5) * 1.1; p.x = tr.x + fX * 3; p.y = 1.5; p.z = tr.z + fZ * 3; p.vx = Math.sin(a) * 20; p.vz = Math.cos(a) * 20; p.vy = 1; p.g = 0; p.drag = 1.5; p.size = 0.6; p.life = 0.8; p.color = 0x9ad4ff; });
        for (const v of others) { if (!this.inFront(tr, v, 20, 0.6)) continue; v.applyEffect('freeze', 2.2); v.vx *= 0.2; v.vz *= 0.2; this.hitMark(tr, v); onHit?.(tr, v, k, 1); }
        break;
      }
      case 'wave': {
        for (let i = 0; i < 40; i++) this.fx.emit(1, (p) => { const a = tr.heading + (Math.random() - 0.5) * 1.6; p.x = tr.x + fX * 3; p.y = 0.5; p.z = tr.z + fZ * 3; p.vx = Math.sin(a) * 24; p.vz = Math.cos(a) * 24; p.vy = 3; p.g = 4; p.drag = 1.2; p.size = 0.7; p.life = 0.9; p.color = Math.random() < 0.5 ? 0xd62828 : 0xffd60a; });
        for (const v of others) { if (!this.inFront(tr, v, 18, 0.85)) continue; const dx = v.x - tr.x, dz = v.z - tr.z, d = Math.hypot(dx, dz); v.impulse((dx / d) * 24 * v.mass, (dz / d) * 24 * v.mass, 2 * v.mass); v.applyEffect('slick', 1.4); this.hitMark(tr, v); onHit?.(tr, v, k, 1.2); }
        break;
      }
      case 'lasso': {
        let best = null, bd = 1e9;
        for (const v of others) { if (!this.inFront(tr, v, 28, 0.7)) continue; const d = Math.hypot(v.x - tr.x, v.z - tr.z); if (d < bd) { bd = d; best = v; } }
        if (best) {
          const dx = tr.x - best.x, dz = tr.z - best.z, d = Math.hypot(dx, dz);
          best.impulse((dx / d) * 26 * best.mass, (dz / d) * 26 * best.mass, 1);
          best.applyEffect('snare', 1.0);
          for (let i = 0; i < 16; i++) this.fx.emit(1, (p) => { const t = i / 16; p.x = tr.x + (best.x - tr.x) * t; p.y = 1.8; p.z = tr.z + (best.z - tr.z) * t; p.g = 0; p.size = 0.35; p.life = 0.5; p.color = 0xe3d7b5; });
          this.hitMark(tr, best); onHit?.(tr, best, k, 1);
        }
        break;
      }
      case 'ram': { tr.applyEffect('ram', 3.5); tr.impulse(fX * 10 * tr.mass, fZ * 10 * tr.mass); this.fx.ring(tr.x, 1, tr.z, 0xffd166, 5); break; }
      case 'slick': {
        const bx = tr.x - fX * 4.5, bz = tr.z - fZ * 4.5;
        this.addHazard({ kind: 'slick', x: bx, z: bz, r: 3.4, life: 9, owner: tr, burn: !!sp.burn, color: sp.burn ? 0x8b1a1a : 0xffa726 });
        this.fx.splash(bx, 0.5, bz, sp.burn ? 0xc62828 : 0xffb300, 16);
        break;
      }
      case 'mines': {
        for (let i = 0; i < (sp.count || 3); i++) {
          const back = 4 + i * 3.2, side = (i - 1) * 1.8;
          this.addHazard({ kind: 'mine', x: tr.x - fX * back + Math.cos(tr.heading) * side, z: tr.z - fZ * back - Math.sin(tr.heading) * side, r: 1.3, life: 22, owner: tr, color: 0xfff3b0 });
        }
        break;
      }
      case 'smoke': { this.addHazard({ kind: 'smoke', x: tr.x - fX * 5, z: tr.z - fZ * 5, r: 6.5, life: 7, owner: tr, color: 0x555555 }); break; }
      case 'tornado': { this.addHazard({ kind: 'tornado', x: tr.x - fX * 6, z: tr.z - fZ * 6, r: 5, life: 6, owner: tr, color: 0xf5c518, vx: -fX * 3, vz: -fZ * 3 }); break; }
      case 'projectile': {
        const n = sp.count || 3;
        for (let i = 0; i < n; i++) {
          const a = tr.heading + (i - (n - 1) / 2) * 0.12;
          this.addProjectile({ kind: 'burrito', x: tr.x + fX * 3.5, y: 1.6, z: tr.z + fZ * 3.5, vx: Math.sin(a) * 48 + tr.vx * 0.5, vz: Math.cos(a) * 48 + tr.vz * 0.5, vy: 0, g: 0, life: 1.6, owner: tr, r: 1.2, color: 0xd9d9d9 });
        }
        break;
      }
      case 'net': { this.addProjectile({ kind: 'net', x: tr.x + fX * 3.5, y: 1.6, z: tr.z + fZ * 3.5, vx: fX * 42 + tr.vx * 0.5, vz: fZ * 42 + tr.vz * 0.5, vy: 0, g: 0, life: 1.4, owner: tr, r: 1.8, color: 0xffe9a8 }); break; }
      case 'lob': { this.addProjectile({ kind: 'pho', x: tr.x + fX * 3, y: 2.5, z: tr.z + fZ * 3, vx: fX * 26 + tr.vx * 0.7, vz: fZ * 26 + tr.vz * 0.7, vy: 11, g: 22, life: 4, owner: tr, r: 1.0, color: 0xffd166 }); break; }
    }
    tr.events.push({ type: 'special' });
    return true;
  }
  hitMark(att, v) { v.lastHitBy = att; v.lastHitTime = performance.now() / 1000; }

  addHazard(h) {
    let mesh;
    if (h.kind === 'slick') { mesh = new THREE.Mesh(new THREE.CylinderGeometry(h.r, h.r, 0.12, 16), mat(h.color)); mesh.position.set(h.x, 0.08, h.z); }
    else if (h.kind === 'mine') { mesh = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), mat(h.color)); mesh.scale.y = 1.25; mesh.position.set(h.x, 0.9, h.z); }
    else if (h.kind === 'smoke') { mesh = new THREE.Mesh(new THREE.SphereGeometry(h.r, 12, 8), mat(h.color, { transparent: true, opacity: 0.55 })); mesh.position.set(h.x, 2.5, h.z); }
    else if (h.kind === 'tornado') { mesh = new THREE.Mesh(new THREE.ConeGeometry(h.r, 10, 10, 1, true), mat(h.color, { transparent: true, opacity: 0.6, side: THREE.DoubleSide })); mesh.rotation.x = Math.PI; mesh.position.set(h.x, 5, h.z); }
    else if (h.kind === 'steam') { mesh = new THREE.Mesh(new THREE.SphereGeometry(h.r, 12, 8), mat(0xffffff, { transparent: true, opacity: 0.5 })); mesh.position.set(h.x, 2.5, h.z); }
    h.mesh = mesh; h.age = 0; h.hits = new Map(); this.group.add(mesh); this.hazards.push(h);
  }
  addProjectile(p) {
    let mesh;
    if (p.kind === 'burrito') { mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.8, 8), mat(p.color)); mesh.rotation.x = Math.PI / 2; mesh.rotation.y = Math.atan2(p.vx, p.vz); }
    else if (p.kind === 'net') { mesh = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), new THREE.MeshBasicMaterial({ color: p.color, wireframe: true })); }
    else { mesh = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), mat(p.color)); }
    mesh.position.set(p.x, p.y, p.z); p.mesh = mesh; p.age = 0; this.group.add(mesh); this.projectiles.push(p);
  }

  update(dt, trucks, t, world, onHit) {
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i]; h.age += dt;
      if (h.vx) { h.x += h.vx * dt; h.z += h.vz * dt; h.mesh.position.x = h.x; h.mesh.position.z = h.z; }
      if (h.kind === 'tornado') { h.mesh.rotation.y += dt * 9; if (Math.random() < 0.5) this.fx.smoke(h.x, 1, h.z, 1, 0xf5c518, 0.5); }
      if (h.kind === 'smoke' && Math.random() < 0.6) this.fx.smoke(h.x + (Math.random() - 0.5) * 6, 1, h.z + (Math.random() - 0.5) * 6, 1, 0x666666, 1.2);
      if (h.kind === 'steam' && Math.random() < 0.6) this.fx.smoke(h.x + (Math.random() - 0.5) * 6, 1, h.z + (Math.random() - 0.5) * 6, 1, 0xffffff, 1.0);
      if (h.kind === 'slick' && h.burn && Math.random() < 0.3) this.fx.smoke(h.x + (Math.random() - 0.5) * 4, 0.3, h.z + (Math.random() - 0.5) * 4, 1, 0xff7043, 0.4);
      for (const v of trucks) {
        if (!v.alive || v.airborne) continue;
        if (v === h.owner && h.age < 1.5) continue;
        if (Math.hypot(v.x - h.x, v.z - h.z) > h.r + 1.2) continue;
        const last = h.hits.get(v.id) || -99; if (h.age - last < 1.0) continue;
        h.hits.set(v.id, h.age);
        const own = v === h.owner;
        switch (h.kind) {
          case 'slick': v.applyEffect('slick', 2.3); if (h.burn) v.applyEffect('burn', 2.0); if (!own) { this.hitMark(h.owner, v); onHit?.(h.owner, v, 'slick', 0.7); } break;
          case 'mine': v.applyEffect('spin', 1.2); v.impulse((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, 4 * v.mass); this.fx.splash(h.x, 1, h.z, 0xffb100, 18); this.fx.splash(h.x, 1, h.z, 0xffffff, 10); h.life = 0; if (!own) { this.hitMark(h.owner, v); onHit?.(h.owner, v, 'mine', 1); } break;
          case 'smoke': v.applyEffect('blind', 1.5); v.applyEffect('slow', 1.0); if (!own) onHit?.(h.owner, v, 'smoke', 0.4); break;
          case 'steam': v.applyEffect('slow', 2.5); v.applyEffect('blind', 1.0); if (!own) { this.hitMark(h.owner, v); onHit?.(h.owner, v, 'steam', 0.7); } break;
          case 'tornado': v.applyEffect('spin', 1.6); v.impulse((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 6 * v.mass); if (!own) { this.hitMark(h.owner, v); onHit?.(h.owner, v, 'tornado', 1.2); } break;
        }
      }
      if (h.age >= h.life) {
        if (h.age > h.life - 1 && h.mesh.material.transparent) h.mesh.material.opacity = Math.max(0, h.mesh.material.opacity - dt);
        if (h.age >= h.life) { this.group.remove(h.mesh); this.hazards.splice(i, 1); }
      } else if (h.age > h.life - 1) { h.mesh.scale.setScalar(Math.max(0.01, h.life - h.age)); }
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]; p.age += dt;
      p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.mesh.position.set(p.x, p.y, p.z); p.mesh.rotation.z += dt * 12;
      let dead = p.age >= p.life || p.y <= 0.2;
      if (world) { const c = world.circleContacts(p.x, p.z, 0.6, []); if (c.length) dead = true; }
      if (!dead) for (const v of trucks) {
        if (v === p.owner || !v.alive) continue;
        if (Math.hypot(v.x - p.x, v.z - p.z) > p.r + 2.4 || Math.abs(v.y - p.y) > 3) continue;
        dead = true;
        if (p.kind === 'burrito') { const d = Math.hypot(p.vx, p.vz); v.impulse((p.vx / d) * 16 * v.mass, (p.vz / d) * 16 * v.mass, 2); v.applyEffect('spin', 0.5); this.fx.splash(p.x, 1.5, p.z, 0xf9e4b7, 12); this.audio.hit(0.8); this.hitMark(p.owner, v); onHit?.(p.owner, v, 'burrito', 1); }
        else if (p.kind === 'net') { v.applyEffect('snare', 1.7); v.vx *= 0.2; v.vz *= 0.2; this.hitMark(p.owner, v); onHit?.(p.owner, v, 'net', 1); }
        else if (p.kind === 'pho') { /* burst handled below */ }
        break;
      }
      if (dead) {
        if (p.kind === 'pho') { this.addHazard({ kind: 'steam', x: p.x, z: p.z, r: 6, life: 4, owner: p.owner }); this.fx.splash(p.x, 1, p.z, 0xffd166, 24); this.audio.thud(); }
        this.group.remove(p.mesh); this.projectiles.splice(i, 1);
      }
    }
  }
}
