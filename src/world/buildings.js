// Procedural buildings: style-driven facades plus modelled architectural detail, written into shared buckets.
import { GeoBuilder, prim, xform, rgb, shade, mix } from './builder.js';
import { BAY, FLOOR, GROUND, TILE, FACADE_STYLES, SIGN_COLS, SIGN_ROWS, SHOP_NAMES } from './citytex.js';

const STYLE_FLOORS = { brick: [1, 9], brickB: [1, 9], stucco: [1, 6], siding: [1, 3], concrete: [3, 16], glass: [6, 34] };
const NB_STYLE = {
  default: { brick: 3, brickB: 2, stucco: 2, siding: 1, concrete: 1.5, glass: 1 },
  'Downtown Deli': { brick: 1.5, brickB: 1, stucco: 0.3, siding: 0, concrete: 3, glass: 4 },
  'Noodle Narrows': { brick: 1.5, brickB: 1.5, stucco: 1, siding: 0.2, concrete: 2.5, glass: 2.5 },
  'Little Lisbon': { brick: 1, brickB: 0.5, stucco: 5, siding: 1, concrete: 0.5, glass: 0.2 },
  'Sugar Hill': { brick: 1, brickB: 1, stucco: 3, siding: 3, concrete: 0.5, glass: 0.3 },
  'Burger Heights': { brick: 4, brickB: 3, stucco: 1, siding: 2, concrete: 1, glass: 0.5 },
  'Grill Street': { brick: 4, brickB: 3, stucco: 1, siding: 1.5, concrete: 1, glass: 0.5 },
  'Sauce Side': { brick: 3, brickB: 2, stucco: 2.5, siding: 1, concrete: 1, glass: 0.5 },
  'Pho District': { brick: 2, brickB: 1, stucco: 3, siding: 0.5, concrete: 2, glass: 1 },
};
const ACCENTS = ['#ff4d57', '#2f9bff', '#3fd46f', '#ffd626', '#b56cff', '#ff7a1a', '#ff6fae', '#1aa39a', '#22304a'];
const STONE = '#efe6d6', IRON = '#3a3f47', METAL = '#aab3bc', WOOD = '#8a6a4a';

export class CityBuilder {
  constructor(rng, nb, { tall = 1 } = {}) {
    this.rng = rng; this.nb = nb; this.tall = tall; this.B = {};
    this.weights = NB_STYLE[nb.name] || NB_STYLE.default;
  }
  bucket(name) { const k = this.prefix ? this.prefix + name : name; return this.B[k] || (this.B[k] = new GeoBuilder()); }

  /** Textured wall quad from a to b (a is the viewer's left), y from ya to yb. */
  wall(bucket, tile, a, b, n, ya, yb, tint, yRef, uOff, vOff) {
    const [tw, th] = tile, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const v0 = (ya - yRef) / th + vOff, v1 = (yb - yRef) / th + vOff, u0 = uOff, u1 = uOff + len / tw;
    this.bucket(bucket).quad([a[0], ya, a[1]], [b[0], ya, b[1]], [b[0], yb, b[1]], [a[0], yb, a[1]], n, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], tint);
  }
  /** Flat roof quad. */
  roof(x0, z0, x1, z1, y, tint, bucket = 'roof') {
    const [tw] = TILE.roof;
    this.bucket(bucket).quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [0, 1, 0], [[x0 / tw, z0 / tw], [x0 / tw, z1 / tw], [x1 / tw, z1 / tw], [x1 / tw, z0 / tw]], tint);
  }
  pickStyle(floors) {
    const opts = Object.entries(this.weights).filter(([s, w]) => w > 0 && floors >= STYLE_FLOORS[s][0] && floors <= STYLE_FLOORS[s][1]);
    if (!opts.length) return floors > 9 ? 'glass' : 'brick';
    let t = this.rng.next() * opts.reduce((a, [, w]) => a + w, 0);
    for (const [s, w] of opts) { t -= w; if (t <= 0) return s; }
    return opts[0][0];
  }

  /**
   * A building on a lot. block: the city block rect (to know which faces front a street).
   * Returns the collider footprint { x0, z0, x1, z1, h }.
   */
  building(lot, block, { maxH = Infinity, y0 = 0.25 } = {}) {
    const rng = this.rng, P = 0.45;
    const fit = (len) => { const n = Math.max(1, Math.floor((len - 2 * P) / BAY)); return { n, len: n * BAY + 2 * P }; };
    const fx = fit(lot.x1 - lot.x0), fz = fit(lot.z1 - lot.z0);
    if (fx.len > lot.x1 - lot.x0 + 0.01 || fz.len > lot.z1 - lot.z0 + 0.01) return null;
    const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
    // hug the street side of the lot where there is one
    const sx = lot.x0 - block.x0 < 1 ? lot.x0 + fx.len / 2 : block.x1 - lot.x1 < 1 ? lot.x1 - fx.len / 2 : cx;
    const sz = lot.z0 - block.z0 < 1 ? lot.z0 + fz.len / 2 : block.z1 - lot.z1 < 1 ? lot.z1 - fz.len / 2 : cz;
    const x0 = sx - fx.len / 2, x1 = sx + fx.len / 2, z0 = sz - fz.len / 2, z1 = sz + fz.len / 2;

    let floors = Math.round((2 + Math.pow(rng.next(), 2.1) * 9) * this.tall);
    if (rng.chance(0.08)) floors = Math.round(floors * 1.9);
    floors = Math.max(1, Math.min(floors, Math.floor((maxH - GROUND) / FLOOR)));
    if (maxH < GROUND + FLOOR) floors = 1;
    const style = this.pickStyle(floors);
    const tint = this.wallTint(style);
    const top = this.mass({ x0, z0, x1, z1, y0, floors, style, tint, block, ground: true, nx: fx.n, nz: fz.n });
    return { x0, z0, x1, z1, h: top };
  }

  wallTint(style) {
    const pal = this.nb.palette, rng = this.rng;
    if (style === 'glass') return rng.pick(['#9fd0ff', '#a8f0e0', '#c8d8ff', '#b8e6ff', '#d6f5c8']);
    if (style === 'concrete') return mix(rng.pick(pal), '#ffffff', 0.55);
    if (style === 'siding') return mix(rng.pick(pal), '#ffffff', 0.25);
    return rgb(rng.pick(pal));
  }

  /** One rectangular mass (with optional setback tower on top). Returns its top height. */
  mass(m) {
    const { x0, z0, x1, z1, y0, floors, style, tint, block, ground } = m, rng = this.rng, P = 0.45;
    const groundH = ground ? GROUND : 0, top = y0 + groundH + floors * FLOOR;
    const glass = style === 'glass', pitched = !glass && style !== 'concrete' && floors <= 2 && ground && rng.chance(style === 'siding' || style === 'stucco' ? 0.6 : 0.25);
    // setback: tall masses step in once
    let towerFloors = 0;
    if (floors >= 7 && m.nx >= 3 && m.nz >= 3 && rng.chance(0.55)) towerFloors = Math.round(floors * rng.range(0.35, 0.6));
    const baseFloors = floors - towerFloors, baseTop = y0 + groundH + baseFloors * FLOOR;
    const faces = [
      { n: [0, 0, 1], a: [x0, z1], b: [x1, z1], street: z1 > block.z1 - 3 },
      { n: [0, 0, -1], a: [x1, z0], b: [x0, z0], street: z0 < block.z0 + 3 },
      { n: [1, 0, 0], a: [x1, z1], b: [x1, z0], street: x1 > block.x1 - 3 },
      { n: [-1, 0, 0], a: [x0, z0], b: [x0, z1], street: x0 < block.x0 + 3 },
    ];
    const uOff = rng.int(0, 3) * 0.25, vOff = rng.int(0, 1) * 0.5;
    const trim = glass ? METAL : (style === 'concrete' ? shade(tint, 0.86) : rng.chance(0.5) ? STONE : shade(tint, 0.78));
    const accent = rng.pick(ACCENTS);
    for (const f of faces) {
      const d = [(f.b[0] - f.a[0]), (f.b[1] - f.a[1])], L = Math.hypot(d[0], d[1]); d[0] /= L; d[1] /= L;
      const inset = glass ? 0 : P;
      const a = [f.a[0] + d[0] * inset, f.a[1] + d[1] * inset], b = [f.b[0] - d[0] * inset, f.b[1] - d[1] * inset];
      f.d = d; f.A = a; f.len = L - inset * 2;
      if (ground) {
        if (f.street && !pitched || f.street && rng.chance(0.5)) this.storefront(f, y0, accent, rng);
        else this.wall(style, TILE.facade, a, b, f.n, y0, y0 + groundH, tint, y0 + groundH, uOff, vOff);
      }
      this.wall(style, TILE.facade, a, b, f.n, y0 + groundH, baseTop, tint, y0 + groundH, uOff, vOff);
    }
    // corner pilasters / mullions
    const T = this.bucket('trim');
    if (!glass) for (const [px, pz, sx, sz] of [[x0, z0, 1, 1], [x1, z0, -1, 1], [x0, z1, 1, -1], [x1, z1, -1, -1]]) T.box(px - sx * 0.12, y0, pz - sz * 0.12, px + sx * P, baseTop, pz + sz * P, shade(tint, 0.9));
    else for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) T.box(px - 0.18, y0, pz - 0.18, px + 0.18, baseTop, pz + 0.18, METAL);
    // string course above the ground floor and floor ledges
    if (ground) this.band(x0, z0, x1, z1, y0 + groundH - 0.18, 0.36, 0.2, trim);
    if (style === 'stucco' || style === 'concrete') for (let k = 1; k < baseFloors; k++) this.band(x0, z0, x1, z1, y0 + groundH + k * FLOOR - 0.06, 0.12, 0.1, trim);
    if (glass) for (let k = 0; k <= baseFloors; k += 4) this.band(x0, z0, x1, z1, y0 + groundH + k * FLOOR - 0.1, 0.2, 0.06, METAL);
    // style extras on the facades
    if ((style === 'brick' || style === 'brickB') && baseFloors >= 3 && rng.chance(0.6)) {
      const f = rng.pick(faces.filter((q) => q.len >= 2 * BAY));
      if (f) this.fireEscape(f, y0 + groundH, baseFloors, rng);
    }
    if ((style === 'stucco' || style === 'concrete') && baseFloors >= 2 && rng.chance(0.45)) for (const f of faces) if (f.street) this.balconies(f, y0 + groundH, baseFloors, style === 'concrete' ? '#cfe8f5' : IRON, rng);
    // top of the base mass
    if (pitched) this.pitchedRoof(x0, z0, x1, z1, baseTop, tint, rng);
    else {
      this.cornice(x0, z0, x1, z1, baseTop, style, trim);
      this.roof(x0 + 0.3, z0 + 0.3, x1 - 0.3, z1 - 0.3, baseTop + 0.02, rng.pick(['#c9c7c2', '#a9a6a0', '#d8d2c6', '#8f9aa3']));
      if (!towerFloors) this.rooftop(x0, z0, x1, z1, baseTop, style, tint, rng, top);
    }
    if (towerFloors) {
      const step = BAY, nx = m.nx - 2, nz = m.nz - 2;
      const tx0 = x0 + step, tx1 = x1 - step, tz0 = z0 + step, tz1 = z1 - step;
      const tStyle = rng.chance(0.6) ? style : (style === 'glass' ? 'concrete' : 'glass');
      return this.mass({ x0: tx0, z0: tz0, x1: tx1, z1: tz1, y0: baseTop, floors: towerFloors, style: tStyle, tint: tStyle === style ? tint : this.wallTint(tStyle), block, ground: false, nx, nz });
    }
    return pitched ? baseTop + 2.4 : baseTop + 0.9;
  }

  /** Horizontal ring band around a footprint (string courses, ledges). */
  band(x0, z0, x1, z1, y, h, out, color) {
    const T = this.bucket('trim');
    // each strip skips its face against the wall, and the side strips skip their ends (hidden by the long strips)
    T.box(x0 - out, y, z1 - 0.01, x1 + out, y + h, z1 + out, color, true, '-z');
    T.box(x0 - out, y, z0 - out, x1 + out, y + h, z0 + 0.01, color, true, '+z');
    T.quad([x1 + out, y, z0], [x1 + out, y + h, z0], [x1 + out, y + h, z1], [x1 + out, y, z1], [1, 0, 0], null, color);
    T.quad([x1, y + h, z0], [x1, y + h, z1], [x1 + out, y + h, z1], [x1 + out, y + h, z0], [0, 1, 0], null, color);
    T.quad([x0 - out, y, z0], [x0 - out, y + h, z0], [x0 - out, y + h, z1], [x0 - out, y, z1], [-1, 0, 0], null, color);
    T.quad([x0 - out, y + h, z0], [x0 - out, y + h, z1], [x0, y + h, z1], [x0, y + h, z0], [0, 1, 0], null, color);
    if (out > 0.2) { // undersides of deep cornices are visible from the street
      T.quad([x0 - out, y, z0 - out], [x1 + out, y, z0 - out], [x1 + out, y, z1 + out], [x0 - out, y, z1 + out], [0, -1, 0], null, shade(color, 0.8));
    }
  }
  cornice(x0, z0, x1, z1, y, style, trim) {
    if (style === 'glass') { this.band(x0, z0, x1, z1, y - 0.1, 1.0, 0.05, METAL); return; }
    if (style === 'concrete') { this.band(x0, z0, x1, z1, y - 0.05, 0.9, 0.12, trim); return; }
    this.band(x0, z0, x1, z1, y - 0.3, 0.3, 0.2, trim);
    this.band(x0, z0, x1, z1, y, 0.35, 0.5, shade(trim, 0.92));
    // parapet
    const T = this.bucket('trim'), pc = shade(trim, 0.95), ph = 0.75, py = y + 0.35, t = 0.25;
    T.box(x0, py, z1 - t, x1, py + ph, z1, pc); T.box(x0, py, z0, x1, py + ph, z0 + t, pc);
    T.box(x0, py, z0, x0 + t, py + ph, z1, pc); T.box(x1 - t, py, z0, x1, py + ph, z1, pc);
  }

  storefront(f, y0, accent, rng) {
    const { A, d, n, len } = f;
    const pt = (s, y, out) => [A[0] + d[0] * s + n[0] * out, y, A[1] + d[1] * s + n[2] * out];
    const tintFrame = rng.chance(0.7) ? rgb(accent) : rgb('#ffffff');
    const a = [A[0], A[1]], b = [A[0] + d[0] * len, A[1] + d[1] * len];
    const uOff = rng.int(0, 1) * 0.5;
    this.wall('store', TILE.store, a, b, n, y0, y0 + GROUND, tintFrame, y0, uOff, 0);
    const mods = Math.max(1, Math.round(len / (BAY * 2)));
    const modLen = len / mods;
    for (let k = 0; k < mods; k++) {
      const s0 = k * modLen, s1 = s0 + modLen, sc = (s0 + s1) / 2, accentK = rng.pick(ACCENTS);
      // sign
      const sw = Math.min(modLen - 1.4, 5.6), sh = 0.78, sy = y0 + GROUND - 0.48;
      const cell = rng.int(0, SHOP_NAMES.length - 1), cu = (cell % SIGN_COLS) / SIGN_COLS, cv = 1 - (Math.floor(cell / SIGN_COLS) + 1) / SIGN_ROWS;
      const p0 = pt(sc - sw / 2, sy - sh / 2, 0.22), p1 = pt(sc + sw / 2, sy - sh / 2, 0.22), p2 = pt(sc + sw / 2, sy + sh / 2, 0.22), p3 = pt(sc - sw / 2, sy + sh / 2, 0.22);
      this.bucket('sign').quad(p0, p1, p2, p3, n, [[cu, cv], [cu + 1 / SIGN_COLS, cv], [cu + 1 / SIGN_COLS, cv + 1 / SIGN_ROWS], [cu, cv + 1 / SIGN_ROWS]], [1, 1, 1]);
      const q0 = pt(sc - sw / 2 - 0.08, sy - sh / 2 - 0.08, 0), q1 = pt(sc + sw / 2 + 0.08, sy + sh / 2 + 0.08, 0.2);
      this.bucket('trim').box(Math.min(q0[0], q1[0]), q0[1], Math.min(q0[2], q1[2]), Math.max(q0[0], q1[0]), q1[1], Math.max(q0[2], q1[2]), '#22304a');
      // awning
      if (rng.chance(0.75)) this.awning(pt, s0 + 0.5, s1 - 0.5, y0, n, rgb(accentK), rng);
      // blade sign on some corners
      if (k === 0 && rng.chance(0.25)) {
        const c2 = rng.int(0, SHOP_NAMES.length - 1), u2 = (c2 % SIGN_COLS) / SIGN_COLS, v2 = 1 - (Math.floor(c2 / SIGN_COLS) + 1) / SIGN_ROWS;
        const by = y0 + GROUND + 0.6, bl = 2.6, bh = 1.3, base = pt(s0 + 0.6, by, 0.1), tip = pt(s0 + 0.6, by, 0.1 + bl);
        const side = [d[0], 0, d[1]];
        const quadAt = (sideSign) => this.bucket('sign').quad([base[0] + side[0] * 0.08 * sideSign, by, base[2] + side[2] * 0.08 * sideSign], [tip[0] + side[0] * 0.08 * sideSign, by, tip[2] + side[2] * 0.08 * sideSign], [tip[0] + side[0] * 0.08 * sideSign, by + bh, tip[2] + side[2] * 0.08 * sideSign], [base[0] + side[0] * 0.08 * sideSign, by + bh, base[2] + side[2] * 0.08 * sideSign], [side[0] * sideSign, 0, side[2] * sideSign], sideSign < 0 ? [[u2, v2], [u2 + 1 / SIGN_COLS, v2], [u2 + 1 / SIGN_COLS, v2 + 1 / SIGN_ROWS], [u2, v2 + 1 / SIGN_ROWS]] : [[u2 + 1 / SIGN_COLS, v2], [u2, v2], [u2, v2 + 1 / SIGN_ROWS], [u2 + 1 / SIGN_COLS, v2 + 1 / SIGN_ROWS]], [1, 1, 1]);
        quadAt(1); quadAt(-1);
        this.bucket('trim').obox((base[0] + tip[0]) / 2, by + bh + 0.05, (base[2] + tip[2]) / 2, 0.08, 0.08, bl + 0.2, Math.atan2(n[0], n[2]), 0, IRON);
      }
    }
    // step / threshold
    const t0 = pt(0, y0, 0), t1 = pt(len, y0 + 0.12, 0.35);
    this.bucket('trim').box(Math.min(t0[0], t1[0]), y0, Math.min(t0[2], t1[2]), Math.max(t0[0], t1[0]), y0 + 0.12, Math.max(t0[2], t1[2]), '#b9b6ae');
  }
  awning(pt, s0, s1, y0, n, color, rng) {
    const yb = y0 + 3.45, yf = y0 + 2.85, out = rng.range(1.2, 1.7), W = this.bucket('awning'), w = s1 - s0, tw = TILE.awning[0];
    const b0 = pt(s0, yb, 0.05), b1 = pt(s1, yb, 0.05), f0 = pt(s0, yf, out), f1 = pt(s1, yf, out);
    const slope = [n[0] * 0.45, 0.89, n[2] * 0.45];
    W.quad(b0, b1, f1, f0, slope, [[0, 1], [w / tw, 1], [w / tw, 0.25], [0, 0.25]], color);
    W.quad(f0, f1, [f1[0], yf - 0.38, f1[2]], [f0[0], yf - 0.38, f0[2]], [n[0], 0, n[2]], [[0, 0.25], [w / tw, 0.25], [w / tw, 0], [0, 0]], color);
    W.quad(b0, b1, f1, f0, [-slope[0], -slope[1], -slope[2]], [[0, 1], [w / tw, 1], [w / tw, 0.25], [0, 0.25]], shade(color, 0.6));
    const sd = [pt(1, 0, 0)[0] - pt(0, 0, 0)[0], 0, pt(1, 0, 0)[2] - pt(0, 0, 0)[2]];
    W.tri(b0, f0, [f0[0], yf - 0.38, f0[2]], [-sd[0], 0, -sd[2]], [[0, 1], [0.3, 0.25], [0.3, 0]], color);
    W.tri(b1, f1, [f1[0], yf - 0.38, f1[2]], [sd[0], 0, sd[2]], [[0, 1], [0.3, 0.25], [0.3, 0]], color);
  }
  fireEscape(f, yBase, floors, rng) {
    const { A, d, n, len } = f, T = this.bucket('trim'), w = 2 * BAY - 0.6, depth = 1.2;
    const s0 = Math.floor(rng.range(0, Math.max(0, len - 2 * BAY)) / BAY) * BAY + 0.3, s1 = s0 + w;
    const pt = (s, out) => [A[0] + d[0] * s + n[0] * out, A[1] + d[1] * s + n[2] * out];
    const yaw = Math.atan2(d[0], d[1]);
    const boxL = (sa, sb, oa, ob, ya, yb) => { const p = pt(sa, oa), q = pt(sb, ob); T.box(Math.min(p[0], q[0]), ya, Math.min(p[1], q[1]), Math.max(p[0], q[0]), yb, Math.max(p[1], q[1]), IRON); };
    for (let k = 0; k < floors; k++) {
      const y = yBase + k * FLOOR + 0.05;
      boxL(s0, s1, 0, depth, y, y + 0.1);                    // platform
      boxL(s0, s1, depth - 0.05, depth, y + 1.0, y + 1.06);   // top rail
      for (const s of [s0, s1 - 0.06]) boxL(s, s + 0.06, depth - 0.06, depth, y, y + 1.06);
      if (k < floors - 1) { // stair to next platform
        const run = w * 0.62, rise = FLOOR, len2 = Math.hypot(run, rise), dir = k % 2 ? 1 : -1;
        const sm = (s0 + s1) / 2 + dir * 0.0, c = pt(sm, depth * 0.55);
        T.obox(c[0], y + rise / 2 + 0.05, c[1], depth * 0.6, 0.08, len2, yaw + (dir > 0 ? 0 : Math.PI), -Math.atan2(rise, run), IRON);
      }
    }
    // drop ladder
    const lp = pt(s1 - 0.6, depth - 0.2);
    for (const off of [-0.22, 0.22]) T.obox(lp[0] + d[0] * off, yBase - 1.2, lp[1] + d[1] * off, 0.05, 2.4, 0.05, yaw, 0, IRON);
    for (let k = 0; k < 3; k++) T.obox(lp[0], yBase - 2.1 + k * 0.7, lp[1], 0.03, 0.03, 0.48, yaw + Math.PI / 2, 0, IRON);
  }
  balconies(f, yBase, floors, railColor, rng) {
    const { A, d, n, len } = f, T = this.bucket('trim'), bays = Math.round(len / BAY);
    const pt = (s, out) => [A[0] + d[0] * s + n[0] * out, A[1] + d[1] * s + n[2] * out];
    const boxL = (sa, sb, oa, ob, ya, yb, c) => { const p = pt(sa, oa), q = pt(sb, ob); T.box(Math.min(p[0], q[0]), ya, Math.min(p[1], q[1]), Math.max(p[0], q[0]), yb, Math.max(p[1], q[1]), c); };
    for (let k = 1; k < floors; k++) for (let bi = 0; bi < bays; bi++) {
      if (!rng.chance(0.4)) continue;
      const s0 = bi * BAY + 0.35, s1 = (bi + 1) * BAY - 0.35, y = yBase + k * FLOOR;
      boxL(s0, s1, 0, 1.0, y - 0.05, y + 0.12, '#e8e4dc');
      boxL(s0, s1, 0.94, 1.0, y + 0.12, y + 1.0, railColor);
      boxL(s0, s0 + 0.06, 0, 1.0, y + 0.12, y + 1.0, railColor); boxL(s1 - 0.06, s1, 0, 1.0, y + 0.12, y + 1.0, railColor);
      if (rng.chance(0.4)) { const c = pt((s0 + s1) / 2 + rng.range(-0.8, 0.8), 0.5); T.cyl(c[0], y + 0.35, c[1], 0.22, 0.45, '#b5651d', 8); T.geo(prim('sphere10'), xform(c[0], y + 0.75, c[1], 0, 0, 0, 0.7, 0.6, 0.7), rng.pick(['#3f9f4f', '#ff6fae', '#ffd626'])); }
    }
  }
  pitchedRoof(x0, z0, x1, z1, y, tint, rng) {
    const alongX = x1 - x0 >= z1 - z0, rise = 2.4, ov = 0.4, R = this.bucket('roofTile'), T = this.bucket('trim');
    const tileC = rng.pick(['#d0643a', '#b5523a', '#6a7a8a', '#4f5d6b', '#8a4a3a', '#3f6f5f']), [tw] = TILE.roofTile;
    if (alongX) {
      const zm = (z0 + z1) / 2, yr = y + rise, xa = x0 - ov, xb = x1 + ov;
      for (const [ze, zo] of [[z1 + ov, 1], [z0 - ov, -1]]) {
        const slopeLen = Math.hypot(Math.abs(ze - zm), rise + ov * 0.4);
        R.quad([xa, y - ov * 0.4, ze], [xb, y - ov * 0.4, ze], [xb, yr, zm], [xa, yr, zm], [0, Math.abs(ze - zm) / slopeLen, zo * rise / slopeLen], [[xa / tw, 0], [xb / tw, 0], [xb / tw, slopeLen / tw], [xa / tw, slopeLen / tw]], tileC);
      }
      for (const [xe, nx] of [[x0, -1], [x1, 1]]) this.bucket('trim').tri([xe, y, z0], [xe, y, z1], [xe, yr, zm], [nx, 0, 0], null, shade(tint, 0.95));
      T.box(xa, yr - 0.08, zm - 0.12, xb, yr + 0.12, zm + 0.12, shade(tileC, 0.8));
    } else {
      const xm = (x0 + x1) / 2, yr = y + rise, za = z0 - ov, zb = z1 + ov;
      for (const [xe, xo] of [[x1 + ov, 1], [x0 - ov, -1]]) {
        const slopeLen = Math.hypot(Math.abs(xe - xm), rise + ov * 0.4);
        R.quad([xe, y - ov * 0.4, za], [xe, y - ov * 0.4, zb], [xm, yr, zb], [xm, yr, za], [xo * rise / slopeLen, Math.abs(xe - xm) / slopeLen, 0], [[za / tw, 0], [zb / tw, 0], [zb / tw, slopeLen / tw], [za / tw, slopeLen / tw]], tileC);
      }
      for (const [ze, nz] of [[z0, -1], [z1, 1]]) this.bucket('trim').tri([x0, y, ze], [x1, y, ze], [xm, yr, ze], [0, 0, nz], null, shade(tint, 0.95));
      T.box(xm - 0.12, yr - 0.08, za, xm + 0.12, yr + 0.12, zb, shade(tileC, 0.8));
    }
    T.box(x0 - 0.05, y - 0.25, z0 - 0.05, x1 + 0.05, y, z1 + 0.05, '#ffffff'); // fascia
    if (rng.chance(0.6)) { const cx = rng.range(x0 + 1, x1 - 1.5), cz = rng.range(z0 + 1, z1 - 1.5); T.box(cx, y, cz, cx + 0.8, y + rise + 1.0, cz + 0.8, shade(tint, 0.7)); T.box(cx - 0.1, y + rise + 1.0, cz - 0.1, cx + 0.9, y + rise + 1.2, cz + 0.9, '#5a5a5a'); }
  }
  rooftop(x0, z0, x1, z1, y, style, tint, rng, finalTop) {
    const T = this.bucket('trim'), w = x1 - x0, d = z1 - z0, ry = y + 0.02;
    const spot = (mw, md) => [rng.range(x0 + 1 + mw / 2, Math.max(x0 + 1 + mw / 2, x1 - 1 - mw / 2)), rng.range(z0 + 1 + md / 2, Math.max(z0 + 1 + md / 2, z1 - 1 - md / 2))];
    if ((style === 'brick' || style === 'brickB') && w > 8 && d > 8 && rng.chance(0.5)) {
      const [cx, cz] = spot(4, 4), legH = 3.2, r = 1.7;
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) T.box(cx + lx * 1.2 - 0.1, ry, cz + lz * 1.2 - 0.1, cx + lx * 1.2 + 0.1, ry + legH, cz + lz * 1.2 + 0.1, IRON);
      T.obox(cx, ry + 1.4, cz, 0.06, 0.06, 3.4, Math.PI / 4, 0, IRON); T.obox(cx, ry + 1.4, cz, 0.06, 0.06, 3.4, -Math.PI / 4, 0, IRON);
      T.box(cx - 1.7, ry + legH, cz - 1.7, cx + 1.7, ry + legH + 0.15, cz + 1.7, WOOD);
      T.cyl(cx, ry + legH + 1.75, cz, r, 3.2, WOOD, 16);
      for (const k of [0.7, 2.6]) T.cyl(cx, ry + legH + k, cz, r + 0.04, 0.12, IRON, 12);
      T.geo(prim('cone12'), xform(cx, ry + legH + 3.35 + 0.6, cz, 0, 0, 0, r * 2.15, 1.2, r * 2.15), '#4a4f57');
      T.cyl(cx, ry + legH + 4.1, cz, 0.08, 0.5, IRON, 8);
    }
    const ac = rng.int(0, Math.min(4, Math.floor(w * d / 60)));
    for (let k = 0; k < ac; k++) {
      const [cx, cz] = spot(1.8, 1.4);
      T.box(cx - 0.9, ry, cz - 0.7, cx + 0.9, ry + 1.0, cz + 0.7, '#d7dde2');
      T.cyl(cx + 0.35, ry + 1.03, cz, 0.42, 0.06, '#3a3f47', 12);
    }
    for (let k = 0; k < rng.int(1, 3); k++) { const [cx, cz] = spot(0.6, 0.6); T.cyl(cx, ry + 0.6, cz, 0.18, 1.2, '#9aa3ab', 8); T.cyl(cx, ry + 1.25, cz, 0.3, 0.12, '#6a737b', 8); }
    if (w > 6 && d > 6 && rng.chance(0.5)) { const [cx, cz] = spot(2.6, 2.6); T.box(cx - 1.3, ry, cz - 1.3, cx + 1.3, ry + 2.6, cz + 1.3, shade(tint, 0.85)); T.box(cx - 1.4, ry + 2.6, cz - 1.4, cx + 1.4, ry + 2.8, cz + 1.4, '#6a6f75'); T.box(cx - 0.45, ry, cz + 1.3, cx + 0.45, ry + 2.1, cz + 1.33, '#4a4f57'); }
    if (rng.chance(0.3)) { const [cx, cz] = spot(1, 1); T.cyl(cx, ry + 2.5, cz, 0.06, 5, METAL, 8); T.geo(prim('dome12'), xform(cx + 0.4, ry + 1.2, cz, 0, -0.9, 0, 1.0, 0.4, 1.0), '#e8ecef'); }
    if (finalTop < 32 && w > 9 && rng.chance(0.18)) this.billboard(x0, z0, x1, z1, ry + 0.8, rng);
  }
  billboard(x0, z0, x1, z1, y, rng) {
    const T = this.bucket('trim'), alongX = x1 - x0 > z1 - z0, W = Math.min(10, (alongX ? x1 - x0 : z1 - z0) - 1.5), H = W / 2.6;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, row = rng.int(0, 1), v0 = row ? 0 : 0.5, v1 = v0 + 0.5, postH = 1.4;
    const facePos = rng.chance(0.5) ? 1 : -1;
    if (alongX) {
      const z = cz + facePos * 0.2;
      for (const dx of [-W / 3, W / 3]) T.box(cx + dx - 0.12, y - 0.8, cz - 0.12, cx + dx + 0.12, y + postH + H, cz + 0.12, IRON);
      T.box(cx - W / 2 - 0.15, y + postH - 0.15, cz - 0.15, cx + W / 2 + 0.15, y + postH + H + 0.15, cz + 0.15, '#2a2e35');
      const n = [0, 0, facePos], a = facePos > 0 ? cx - W / 2 : cx + W / 2, b = facePos > 0 ? cx + W / 2 : cx - W / 2;
      this.bucket('billboard').quad([a, y + postH, z], [b, y + postH, z], [b, y + postH + H, z], [a, y + postH + H, z], n, [[0, v0], [1, v0], [1, v1], [0, v1]], [1, 1, 1]);
      T.box(cx - W / 2, y + postH - 0.6, z + facePos * 0.05, cx + W / 2, y + postH - 0.5, z + facePos * 1.0, IRON);
    } else {
      const x = cx + facePos * 0.2;
      for (const dz of [-W / 3, W / 3]) T.box(cx - 0.12, y - 0.8, cz + dz - 0.12, cx + 0.12, y + postH + H, cz + dz + 0.12, IRON);
      T.box(cx - 0.15, y + postH - 0.15, cz - W / 2 - 0.15, cx + 0.15, y + postH + H + 0.15, cz + W / 2 + 0.15, '#2a2e35');
      const n = [facePos, 0, 0], a = facePos > 0 ? cz + W / 2 : cz - W / 2, b = facePos > 0 ? cz - W / 2 : cz + W / 2;
      this.bucket('billboard').quad([x, y + postH, a], [x, y + postH, b], [x, y + postH + H, b], [x, y + postH + H, a], n, [[0, v0], [1, v0], [1, v1], [0, v1]], [1, 1, 1]);
      T.box(x + facePos * 0.05, y + postH - 0.6, cz - W / 2, x + facePos * 1.0, y + postH - 0.5, cz + W / 2, IRON);
    }
  }

  /** Background skyline block: facade box with a roof and coping, no street detail. */
  skyline(cx, cz, w, h) {
    const rng = this.rng, style = rng.pick(['brick', 'concrete', 'glass', 'glass', 'concrete', 'brickB']), tint = this.wallTint(style);
    w = Math.max(1, Math.round(w / BAY)) * BAY;
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - w / 2, z1 = cz + w / 2, uOff = rng.int(0, 3) * 0.25;
    for (const f of [{ n: [0, 0, 1], a: [x0, z1], b: [x1, z1] }, { n: [0, 0, -1], a: [x1, z0], b: [x0, z0] }, { n: [1, 0, 0], a: [x1, z1], b: [x1, z0] }, { n: [-1, 0, 0], a: [x0, z0], b: [x0, z1] }])
      this.wall(style, TILE.facade, f.a, f.b, f.n, 0, h, tint, 0, uOff, 0);
    this.roof(x0, z0, x1, z1, h, '#a9a6a0');
    this.band(x0, z0, x1, z1, h - 0.2, 0.8, 0.15, style === 'glass' ? METAL : STONE);
  }
}

export { FACADE_STYLES };
