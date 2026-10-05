// GeoBuilder: accumulates flat-shaded quads, boxes and transformed primitives into one BufferGeometry.
// Used for every static city bucket so thousands of details collapse into a handful of draw calls.
import * as THREE from 'three';

const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _x = new THREE.Vector3(), _col = new THREE.Color();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _eu = new THREE.Euler();

export function rgb(color) { if (Array.isArray(color)) return color; _col.set(color); return [_col.r, _col.g, _col.b]; }
export function shade(color, k) { const c = rgb(color); return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)]; }
export function mix(a, b, t) { const x = rgb(a), y = rgb(b); return [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]; }

/** Matrix from position, Euler rotation (YXZ order: yaw then pitch) and scale. */
export function xform(x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _eu.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_eu);
  return _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)).clone();
}

const PRIMS = {};
/** Shared unit primitives (non-indexed) for transformed instancing into builders. */
export function prim(name) {
  if (PRIMS[name]) return PRIMS[name];
  let g;
  const cyl = /^cyl(\d+)$/.exec(name);
  if (cyl) { PRIMS[name] = new THREE.CylinderGeometry(0.5, 0.5, 1, +cyl[1]).toNonIndexed(); return PRIMS[name]; }
  switch (name) {
    case 'box': g = new THREE.BoxGeometry(1, 1, 1); break;
    case 'cone12': g = new THREE.ConeGeometry(0.5, 1, 12); break;
    case 'dome12': g = new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); break;
    case 'sphere10': g = new THREE.SphereGeometry(0.5, 10, 8); break;
    default: throw new Error('unknown prim ' + name);
  }
  PRIMS[name] = g.toNonIndexed();
  return PRIMS[name];
}

export class GeoBuilder {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; }
  get count() { return this.p.length / 3; }
  _push(v, n, uv, c) { this.p.push(v[0], v[1], v[2]); this.n.push(n[0], n[1], n[2]); this.u.push(uv ? uv[0] : 0, uv ? uv[1] : 0); this.c.push(c[0], c[1], c[2]); }
  /** Quad a-b-c-d (either winding) facing outward normal n; uvs optional [[u,v] x4]. */
  quad(a, b, c, d, n, uvs, color) {
    _e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _e2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); _x.crossVectors(_e1, _e2);
    const flip = _x.x * n[0] + _x.y * n[1] + _x.z * n[2] < 0, col = rgb(color), U = uvs || [];
    if (!flip) { this._push(a, n, U[0], col); this._push(b, n, U[1], col); this._push(c, n, U[2], col); this._push(a, n, U[0], col); this._push(c, n, U[2], col); this._push(d, n, U[3], col); }
    else { this._push(a, n, U[0], col); this._push(c, n, U[2], col); this._push(b, n, U[1], col); this._push(a, n, U[0], col); this._push(d, n, U[3], col); this._push(c, n, U[2], col); }
  }
  tri(a, b, c, n, uvs, color) {
    _e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _e2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); _x.crossVectors(_e1, _e2);
    const col = rgb(color), U = uvs || [];
    if (_x.x * n[0] + _x.y * n[1] + _x.z * n[2] >= 0) { this._push(a, n, U[0], col); this._push(b, n, U[1], col); this._push(c, n, U[2], col); }
    else { this._push(a, n, U[0], col); this._push(c, n, U[2], col); this._push(b, n, U[1], col); }
  }
  /** Axis-aligned box. bottom=false skips the underside (never visible on the ground). */
  box(x0, y0, z0, x1, y1, z1, color, bottom = false, skip = '') {
    if (x0 > x1) [x0, x1] = [x1, x0]; if (y0 > y1) [y0, y1] = [y1, y0]; if (z0 > z1) [z0, z1] = [z1, z0];
    const q = (a, b, c, d, n) => this.quad(a, b, c, d, n, null, color);
    if (skip !== '+x') q([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]);
    if (skip !== '-x') q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
    q([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]);
    if (bottom) q([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
    if (skip !== '+z') q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    if (skip !== '-z') q([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [0, 0, -1]);
  }
  /** Append a three.js geometry transformed by matrix, flat colour; keeps its UVs if it has them. */
  geo(g, matrix, color) {
    const gg = g.index ? g.toNonIndexed() : g.clone();
    if (matrix) gg.applyMatrix4(matrix);
    const P = gg.attributes.position.array, N = gg.attributes.normal.array, UV = gg.attributes.uv ? gg.attributes.uv.array : null, col = rgb(color);
    for (let i = 0, k = 0; i < P.length; i += 3, k += 2) {
      this.p.push(P[i], P[i + 1], P[i + 2]); this.n.push(N[i], N[i + 1], N[i + 2]);
      this.u.push(UV ? UV[k] : 0, UV ? UV[k + 1] : 0); this.c.push(col[0], col[1], col[2]);
    }
  }
  /** Oriented box: centre, size (w across, h up, len along yaw direction), yaw about Y, pitch about local X. */
  obox(cx, cy, cz, w, h, len, yaw, pitch, color) { this.geo(prim('box'), xform(cx, cy, cz, yaw, pitch, 0, w, h, len), color); }
  cyl(cx, cy, cz, r, h, color, seg = 12, ry = 0, rx = 0, rz = 0) { this.geo(prim('cyl' + seg), xform(cx, cy, cz, ry, rx, rz, r * 2, h, r * 2), color); }
  /** Split triangles into square cells (by centroid) so off-screen chunks are culled from view and shadow passes. */
  buildChunks(cell) {
    if (!this.count) return [];
    const groups = new Map(), P = this.p, N = this.n, U = this.u, C = this.c;
    for (let t = 0, T = this.count / 3; t < T; t++) {
      const i = t * 9, cx = (P[i] + P[i + 3] + P[i + 6]) / 3, cz = (P[i + 2] + P[i + 5] + P[i + 8]) / 3;
      const key = Math.floor(cx / cell) * 100003 + Math.floor(cz / cell);
      let g = groups.get(key); if (!g) { g = new GeoBuilder(); groups.set(key, g); }
      for (let k = 0; k < 9; k++) { g.p.push(P[i + k]); g.n.push(N[i + k]); g.c.push(C[i + k]); }
      for (let k = 0; k < 6; k++) g.u.push(U[t * 6 + k]);
    }
    return [...groups.values()].map((g) => g.build());
  }
  build() {
    if (!this.count) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}
