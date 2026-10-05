// Generic bot driver: steer toward a target with obstacle avoidance, stuck recovery and special usage.
import { clamp, angleDiff, lerp } from '../core/math.js';

export class BotDriver {
  constructor(truck, rng) {
    this.truck = truck; this.rng = rng;
    this.reverseTimer = 0; this.reverseDir = 1;
    this.skill = rng.range(0.7, 1.0);
    this.jitterPhase = rng.range(0, 100);
    this.avoidBias = 0; this.stuckCount = 0; this.stallT = 0;
  }
  /**
   * Drive toward (tx,tz). speedFactor 0..1.3 scales the desired speed vs max speed.
   * opts: { avoidTrucks: [trucks], world, aggressive, turbo }
   */
  drive(tx, tz, speedFactor, dt, t, opts = {}) {
    const tr = this.truck, c = tr.control;
    const world = opts.world;
    const dx = tx - tr.x, dz = tz - tr.z, dist = Math.hypot(dx, dz);
    const targetHeading = Math.atan2(dx, dz);
    let diff = angleDiff(tr.heading, targetHeading);

    // obstacle avoidance: cast 3 feelers against static world
    if (world && dist > 4) {
      const look = clamp(6 + tr.speed * 0.9, 8, 30);
      const h = tr.heading;
      const dL = world.rayDistance(tr.x, tr.z, Math.sin(h - 0.45), Math.cos(h - 0.45), look, true);
      const dC = world.rayDistance(tr.x, tr.z, Math.sin(h), Math.cos(h), look, true);
      const dR = world.rayDistance(tr.x, tr.z, Math.sin(h + 0.45), Math.cos(h + 0.45), look, true);
      let avoid = 0;
      if (dC < look) avoid += (dL > dR ? -1 : 1) * (1 - dC / look) * 1.6;
      if (dL < look * 0.8) avoid += (1 - dL / look) * 1.0;
      if (dR < look * 0.8) avoid -= (1 - dR / look) * 1.0;
      if (avoid !== 0) { diff = clamp(diff + avoid, -Math.PI, Math.PI); this.avoidBias = avoid; }
      if (dC < 7 && tr.speed > 12) speedFactor = Math.min(speedFactor, 0.55);
    }
    // separation from other trucks (soft)
    if (opts.avoidTrucks) {
      for (const o of opts.avoidTrucks) {
        if (o === tr || !o.alive) continue;
        const ox = o.x - tr.x, oz = o.z - tr.z, d2 = ox * ox + oz * oz;
        if (d2 > 110) continue;
        const d = Math.sqrt(d2);
        const ang = Math.atan2(ox, oz), rel = angleDiff(tr.heading, ang);
        if (Math.abs(rel) < 0.7 && !opts.aggressive) { diff += (rel > 0 ? -1 : 1) * (1 - d / 10.5) * 0.9; if (d < 6 && tr.speed > o.speed) speedFactor = Math.min(speedFactor, 0.8); }
      }
    }
    // stuck recovery
    if (tr.stuckTime > 1.1 && this.reverseTimer <= 0) { this.reverseTimer = 1.2; this.reverseDir = diff > 0 ? -1 : 1; tr.stuckTime = 0; this.stuckCount++; }
    // stall detector: wanted to move but barely moving for a long time -> harder reverse
    if (speedFactor > 0.3 && tr.speed < 3 && !tr.disabled()) { this.stallT += dt; if (this.stallT > 2.0 && this.reverseTimer <= 0) { this.reverseTimer = 1.6; this.reverseDir = this.rng.sign(); this.stallT = 0; this.stuckCount++; } } else this.stallT = Math.max(0, this.stallT - dt);
    if (this.reverseTimer > 0) {
      this.reverseTimer -= dt;
      c.throttle = -1; c.steer = this.reverseDir; c.handbrake = false; c.turbo = false;
      return;
    }
    const steer = clamp(diff * 1.8 * this.skill, -1, 1);
    c.steer = steer;
    // slow for sharp turns
    const turnSlow = Math.abs(diff) > 0.9 ? 0.45 : Math.abs(diff) > 0.5 ? 0.7 : 1;
    let desired = tr.maxSpeed * clamp(speedFactor, 0, 1.4) * turnSlow;
    if (speedFactor > 0 && speedFactor < 0.3) desired = Math.max(desired, Math.min(dist * 0.9, 7)); // creep toward a close target (parking); 0 means stop
    const err = desired - tr.fwdSpeed;
    c.throttle = clamp(err / 4, -1, 1);
    if (dist < 1.6 && speedFactor < 0.2) c.throttle = -clamp(tr.fwdSpeed / 4, -1, 1);
    c.handbrake = Math.abs(diff) > 1.1 && tr.speed > tr.maxSpeed * 0.55;
    c.turbo = !!opts.turbo && speedFactor > 1.0 && Math.abs(diff) < 0.3 && tr.turboCd <= 0;
  }
  stop(dt) {
    const c = this.truck.control; c.steer = 0; c.throttle = -clamp(this.truck.fwdSpeed / 3, -1, 1); c.turbo = false; c.handbrake = false;
  }
}

export const lerpSpeed = lerp;
