// Static world colliders: axis-aligned boxes (buildings, walls) in a spatial hash + overpass elevation.
export class SpatialHash {
  constructor(cell = 24) { this.cell = cell; this.map = new Map(); this.stamp = 1; }
  key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
  insert(item, minX, minZ, maxX, maxZ) {
    const c = this.cell;
    for (let ix = Math.floor(minX / c); ix <= Math.floor(maxX / c); ix++)
      for (let iz = Math.floor(minZ / c); iz <= Math.floor(maxZ / c); iz++) {
        const k = this.key(ix, iz);
        let b = this.map.get(k); if (!b) { b = []; this.map.set(k, b); }
        b.push(item);
      }
  }
  query(minX, minZ, maxX, maxZ, out = []) {
    const c = this.cell, st = ++this.stamp;
    out.length = 0;
    for (let ix = Math.floor(minX / c); ix <= Math.floor(maxX / c); ix++)
      for (let iz = Math.floor(minZ / c); iz <= Math.floor(maxZ / c); iz++) {
        const b = this.map.get(this.key(ix, iz)); if (!b) continue;
        for (const it of b) if (it._st !== st) { it._st = st; out.push(it); }
      }
    return out;
  }
}

export class StaticWorld {
  constructor() {
    this.aabbs = [];
    this.hash = new SpatialHash(24);
    this.overpasses = [];
    this.ramps = [];
    this._q = [];
    this.bounds = { minX: -300, maxX: 300, minZ: -300, maxZ: 300 };
  }
  addAABB(minX, minZ, maxX, maxZ, kind = 'building', height = 10) {
    const a = { minX, minZ, maxX, maxZ, kind, height, _st: 0 };
    this.aabbs.push(a); this.hash.insert(a, minX, minZ, maxX, maxZ);
    return a;
  }
  /** Returns contacts for a circle: [{nx, nz, depth, kind}] */
  circleContacts(x, z, r, out = []) {
    out.length = 0;
    const list = this.hash.query(x - r, z - r, x + r, z + r, this._q);
    for (const a of list) {
      const cx = Math.max(a.minX, Math.min(x, a.maxX));
      const cz = Math.max(a.minZ, Math.min(z, a.maxZ));
      let dx = x - cx, dz = z - cz;
      let d = Math.hypot(dx, dz);
      if (d >= r) continue;
      if (d < 1e-5) {
        // centre inside the box: push out along the smallest penetration axis
        const px = Math.min(x - a.minX, a.maxX - x), pz = Math.min(z - a.minZ, a.maxZ - z);
        if (px < pz) { dx = (x - a.minX < a.maxX - x) ? -1 : 1; dz = 0; d = 0; out.push({ nx: dx, nz: 0, depth: px + r, kind: a.kind, box: a }); }
        else { dz = (z - a.minZ < a.maxZ - z) ? -1 : 1; out.push({ nx: 0, nz: dz, depth: pz + r, kind: a.kind, box: a }); }
        continue;
      }
      out.push({ nx: dx / d, nz: dz / d, depth: r - d, kind: a.kind, box: a });
    }
    return out;
  }
  /** Does the segment from (x,z) heading dir by length hit any box? Returns distance or Infinity. */
  rayDistance(x, z, dx, dz, maxLen, withRamps = false) {
    const d = this.rayBoxes(x, z, dx, dz, maxLen);
    return withRamps && this.ramps.length ? Math.min(d, this.rayRamps(x, z, dx, dz, maxLen)) : d;
  }
  /** Ramps as obstacles for AI feelers: solid from the sides and the high end, open to a truck lining up a jump. */
  rayRamps(x, z, dx, dz, maxLen) {
    let best = Infinity;
    for (const r of this.ramps) {
      const qx = x - r.cx, qz = z - r.cz;
      if (qx * qx + qz * qz > (maxLen + r.len) ** 2) continue;
      const a0 = qx * r.ux + qz * r.uz + r.len / 2, l0 = -qx * r.uz + qz * r.ux, da = dx * r.ux + dz * r.uz, dl = -dx * r.uz + dz * r.ux;
      if (a0 < r.len * 0.3 && da > 0.75) continue;
      let tmin = 0, tmax = maxLen;
      const slab = (o, dd, lo, hi) => { if (Math.abs(dd) < 1e-6) return o >= lo && o <= hi; let t1 = (lo - o) / dd, t2 = (hi - o) / dd; if (t1 > t2) [t1, t2] = [t2, t1]; tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); return tmin <= tmax; };
      if (!slab(a0, da, r.len * 0.15, r.len) || !slab(l0, dl, -r.hw, r.hw)) continue;
      if (tmin < best) best = tmin;
    }
    return best;
  }
  rayBoxes(x, z, dx, dz, maxLen) {
    const list = this.hash.query(Math.min(x, x + dx * maxLen) - 1, Math.min(z, z + dz * maxLen) - 1, Math.max(x, x + dx * maxLen) + 1, Math.max(z, z + dz * maxLen) + 1, this._q);
    let best = Infinity;
    for (const a of list) {
      // slab test
      let tmin = 0, tmax = maxLen;
      if (Math.abs(dx) < 1e-6) { if (x < a.minX || x > a.maxX) continue; }
      else { let t1 = (a.minX - x) / dx, t2 = (a.maxX - x) / dx; if (t1 > t2) [t1, t2] = [t2, t1]; tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) continue; }
      if (Math.abs(dz) < 1e-6) { if (z < a.minZ || z > a.maxZ) continue; }
      else { let t1 = (a.minZ - z) / dz, t2 = (a.maxZ - z) / dz; if (t1 > t2) [t1, t2] = [t2, t1]; tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) continue; }
      if (tmin < best) best = tmin;
    }
    return best;
  }
  addOverpass(ax, az, bx, bz, halfWidth = 5, maxH = 6, rampLen = 22) {
    const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
    const op = { ax, az, bx, bz, ux, uz, L, halfWidth, maxH, rampLen };
    this.overpasses.push(op);
    return op;
  }
  /** Jump ramp: a wedge rising along (dirX, dirZ) from 0 to height over len, ending in a sheer lip. */
  /** Raised flat surface (pavement, plaza, lawn bed): trucks ride on top of it. */
  addPad(minX, minZ, maxX, maxZ, h) { (this.pads || (this.pads = [])).push({ minX, minZ, maxX, maxZ, h }); }
  padHeight(x, z) {
    let h = 0;
    if (this.pads) for (const p of this.pads) if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ && p.h > h) h = p.h;
    return h;
  }
  addRamp(cx, cz, yaw, len, width, height) {
    const r = { cx, cz, yaw, ux: Math.sin(yaw), uz: Math.cos(yaw), len, hw: width / 2, height };
    this.ramps.push(r); return r;
  }
  /** Ramp height at (x, z), or -1 when outside every ramp. */
  rampHeight(x, z) {
    let best = -1;
    for (const r of this.ramps) {
      const dx = x - r.cx, dz = z - r.cz, along = dx * r.ux + dz * r.uz + r.len / 2, lat = -dx * r.uz + dz * r.ux;
      if (along < 0 || along > r.len || Math.abs(lat) > r.hw) continue;
      best = Math.max(best, r.height * (along / r.len));
    }
    return best;
  }
  /** Elevation of the drivable surface at (x,z). Also returns which overpass + lateral offset. */
  elevation(x, z, out = { h: 0, op: null, lat: 0, along: 0 }) {
    out.h = this.padHeight(x, z); out.op = null; out.ramp = false; out.pad = out.h > 0;
    if (this.ramps.length) { const rh = this.rampHeight(x, z); if (rh > out.h) { out.h = rh; out.ramp = true; out.pad = false; } }
    for (const op of this.overpasses) {
      const rx = x - op.ax, rz = z - op.az;
      const along = rx * op.ux + rz * op.uz;
      if (along < -2 || along > op.L + 2) continue;
      const lat = -rx * op.uz + rz * op.ux;
      if (Math.abs(lat) > op.halfWidth + 1.5) continue;
      const h = op.maxH * Math.max(0, Math.min(1, along / op.rampLen, (op.L - along) / op.rampLen));
      if (h > out.h) { out.h = h; out.op = op; out.lat = lat; out.along = along; out.pad = false; }
    }
    return out;
  }
  overpassHeightAlong(op, along) {
    return op.maxH * Math.max(0, Math.min(1, along / op.rampLen, (op.L - along) / op.rampLen));
  }
}

// 2D oriented box vs oriented box (SAT). Returns {nx,nz,depth} pushing A away from B, or null.
export function obbVsObb(a, b) {
  // a,b: {x,z,cos,sin,hw,hl} ; axes: forward (sin,cos) and right (cos,-sin)
  const axes = [[a.sin, a.cos], [a.cos, -a.sin], [b.sin, b.cos], [b.cos, -b.sin]];
  const dx = b.x - a.x, dz = b.z - a.z;
  let minDepth = Infinity, best = null;
  for (let i = 0; i < 4; i++) {
    const [nx, nz] = axes[i];
    const ra = Math.abs(nx * a.sin + nz * a.cos) * a.hl + Math.abs(nx * a.cos - nz * a.sin) * a.hw;
    const rb = Math.abs(nx * b.sin + nz * b.cos) * b.hl + Math.abs(nx * b.cos - nz * b.sin) * b.hw;
    const dist = dx * nx + dz * nz;
    const depth = ra + rb - Math.abs(dist);
    if (depth <= 0) return null;
    if (depth < minDepth) { minDepth = depth; best = dist > 0 ? [-nx, -nz] : [nx, nz]; }
  }
  if (!best) return null; // degenerate input (NaN)
  return { nx: best[0], nz: best[1], depth: minDepth };
}
