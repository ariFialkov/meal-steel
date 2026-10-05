// Painted city textures, generated once on canvas and shared by every match.
// Each surface has four layers: colour, height (-> normal map), data (R = tint mask, G = roughness) and
// emissive (lit windows at night). Walls are painted in light neutral tones and tinted per building through
// vertex colours wherever the tint mask is set, so a handful of textures covers every colour scheme.
import * as THREE from 'three';

export const BAY = 3.6, FLOOR = 3.6, GROUND = 4.5;
/** World-space size (metres) covered by one repeat of each texture. */
export const TILE = {
  facade: [BAY * 4, FLOOR * 2], store: [BAY * 4, GROUND], roof: [8, 8], roofTile: [4, 4],
  asphalt: [14, 14], sidewalk: [6, 6], grass: [9, 9], awning: [2.4, 1],
};
export const FACADE_STYLES = ['brick', 'brickB', 'stucco', 'siding', 'concrete', 'glass'];
export const SIGN_COLS = 4, SIGN_ROWS = 8;
export const SHOP_NAMES = ['DONUT WORRY', 'WOK THIS WAY', 'SUB-LIME', 'LAUNDROMAT', 'PIZZA PALACE', 'BAGEL BOSS', 'TACO BOUT IT', 'BARBER',
  'BOOKS', 'NAIL\'D IT', 'CAFE CAFE', 'DELI', 'PAWN', 'GYM RAT', 'HOT SAUCE', 'TOYS', 'SUSHI GO', 'VINYL', 'FLOWERS', 'PHONES',
  'BURGER BARN', 'NOODLE NOOK', 'PET SHOP', 'DINER', 'BAKERY', 'ARCADE', 'TAILOR', 'CANDY', 'PHARMACY', 'BBQ PIT', 'KARAOKE', 'MARKET'];

function rand(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

class Layers {
  constructor(w, h, { rough = 220, mask = 255, height = 128 } = {}) {
    this.w = w; this.h = h;
    this.color = canvas(w, h); this.height = canvas(w, h); this.data = canvas(w, h); this.emis = canvas(w, h);
    this.cc = this.color.getContext('2d'); this.hc = this.height.getContext('2d', { willReadFrequently: true });
    this.dc = this.data.getContext('2d'); this.ec = this.emis.getContext('2d');
    this.hc.fillStyle = `rgb(${height},${height},${height})`; this.hc.fillRect(0, 0, w, h);
    this.dc.fillStyle = `rgb(${mask},${rough},0)`; this.dc.fillRect(0, 0, w, h);
    this.ec.fillStyle = '#000'; this.ec.fillRect(0, 0, w, h);
  }
  /** Fill a path on each layer that has a value. p: { c, h, mask, rough, e } */
  fill(shape, p) {
    const go = (ctx, style) => { ctx.fillStyle = style; ctx.beginPath(); shape(ctx); ctx.fill(); };
    if (p.c !== undefined) go(this.cc, p.c);
    if (p.h !== undefined) go(this.hc, `rgb(${p.h | 0},${p.h | 0},${p.h | 0})`);
    if (p.mask !== undefined || p.rough !== undefined) go(this.dc, `rgb(${p.mask ?? 255},${p.rough ?? 220},0)`);
    if (p.e !== undefined) go(this.ec, p.e);
  }
  rect(x, y, w, h, p) { this.fill((c) => c.rect(x, y, w, h), p); }
  ellipse(x, y, rx, ry, p) { this.fill((c) => c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2), p); }
  /** Per-pixel luminance noise on colour and height. */
  grain(r, cAmt, hAmt) {
    const ci = this.cc.getImageData(0, 0, this.w, this.h), hi = this.hc.getImageData(0, 0, this.w, this.h);
    const C = ci.data, H = hi.data;
    for (let i = 0; i < C.length; i += 4) {
      const n = (r() - 0.5);
      if (cAmt) { const k = n * cAmt; C[i] += k; C[i + 1] += k; C[i + 2] += k; }
      if (hAmt) { const k = n * hAmt; H[i] += k; H[i + 1] += k; H[i + 2] += k; }
    }
    this.cc.putImageData(ci, 0, 0); this.hc.putImageData(hi, 0, 0);
  }
}

function heightToNormal(src, strength) {
  const w = src.width, h = src.height, s = src.getContext('2d').getImageData(0, 0, w, h).data;
  const out = canvas(w, h), oc = out.getContext('2d'), img = oc.createImageData(w, h), O = img.data;
  const k = strength / 255;
  for (let y = 0; y < h; y++) {
    const up = (y === 0 ? h - 1 : y - 1) * w, dn = (y === h - 1 ? 0 : y + 1) * w, row = y * w;
    for (let x = 0; x < w; x++) {
      const xl = x === 0 ? w - 1 : x - 1, xr = x === w - 1 ? 0 : x + 1;
      const dx = (s[(row + xr) * 4] - s[(row + xl) * 4]) * k, dy = (s[(up + x) * 4] - s[(dn + x) * 4]) * k;
      const il = 1 / Math.sqrt(dx * dx + dy * dy + 1), i = (row + x) * 4;
      O[i] = (0.5 - dx * il * 0.5) * 255; O[i + 1] = (0.5 - dy * il * 0.5) * 255; O[i + 2] = (0.5 + il * 0.5) * 255; O[i + 3] = 255;
    }
  }
  oc.putImageData(img, 0, 0);
  return out;
}
function tex(c, srgb, aniso = 8) {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t;
}
function finish(L, normalStrength, emissive = true) {
  return { map: tex(L.color, true), normalMap: tex(heightToNormal(L.height, normalStrength), false), dataMap: tex(L.data, false, 4), emissiveMap: emissive ? tex(L.emis, true, 4) : null };
}

// ---------------------------------------------------------------- windows
const GLASS = ['#2f4f6f', '#3b5d7a', '#2a4560', '#46698a'];
const CURTAINS = ['#e9d8a6', '#f2b5a0', '#b8d8be', '#c9b8e8', '#f7e3a1', '#ffffff'];
function archPath(x, y, w, h) { return (c) => { c.moveTo(x, y + h); c.lineTo(x, y + w / 2); c.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); c.lineTo(x + w, y + h); c.closePath(); }; }
function rectPath(x, y, w, h) { return (c) => c.rect(x, y, w, h); }

/** One window at (x, y) top-left, size w x h px. o: { arch, frame, stone, mull, lit, r } */
function windowUnit(L, x, y, w, h, o) {
  const r = o.r, shape = o.arch ? archPath : rectPath;
  if (o.stone) {
    L.rect(x - 9, y + h, w + 18, 11, { c: o.stone, h: 235, mask: 0, rough: 210 });
    if (o.arch) { L.fill(shape(x - 10, y - 10, w + 20, h + 10), { c: o.stone, h: 215, mask: 0, rough: 210 }); L.rect(x + w / 2 - 7, y - 12, 14, 16, { c: o.stone, h: 245, mask: 0 }); }
    else L.rect(x - 8, y - 15, w + 16, 15, { c: o.stone, h: 225, mask: 0, rough: 210 });
  }
  L.fill(shape(x - 3, y - 3, w + 6, h + 6), { c: '#1f232b', h: 35, mask: 0, rough: 200 });
  L.fill(shape(x, y, w, h), { c: o.frame, h: 190, mask: 0, rough: 140 });
  const ix = x + 7, iy = y + 7, iw = w - 14, ih = h - 14;
  const g = L.cc.createLinearGradient(ix, iy, ix + iw * 0.6, iy + ih);
  const base = GLASS[(r() * GLASS.length) | 0]; g.addColorStop(0, '#9cc9e8'); g.addColorStop(0.45, base); g.addColorStop(1, '#1b2a3a');
  const lit = o.lit && r() < 0.42;
  L.fill(shape(ix, iy, iw, ih), { c: g, h: 70, mask: 0, rough: 25, e: lit ? (r() < 0.75 ? '#ffcf7a' : '#cfe8ff') : undefined });
  const v = r();
  if (v < 0.25) { for (let k = iy + 6; k < iy + ih * 0.55; k += 7) L.rect(ix, k, iw, 3, { c: 'rgba(240,236,224,0.85)' }); }
  else if (v < 0.5) { const cc = CURTAINS[(r() * CURTAINS.length) | 0]; L.rect(ix, iy + (o.arch ? iw / 2 : 0), iw * 0.28, ih - (o.arch ? iw / 2 : 0), { c: cc }); L.rect(ix + iw * 0.72, iy + (o.arch ? iw / 2 : 0), iw * 0.28, ih - (o.arch ? iw / 2 : 0), { c: cc }); }
  else if (v < 0.6) { L.ellipse(ix + iw * 0.5, iy + ih - 10, iw * 0.25, 9, { c: '#3f8f4f' }); L.rect(ix + iw * 0.38, iy + ih - 8, iw * 0.24, 8, { c: '#b5651d' }); }
  L.cc.save(); L.cc.beginPath(); shape(ix, iy, iw, ih)(L.cc); L.cc.clip();
  L.cc.fillStyle = 'rgba(255,255,255,0.22)'; L.cc.beginPath(); L.cc.moveTo(ix, iy + ih * 0.55); L.cc.lineTo(ix + iw * 0.55, iy); L.cc.lineTo(ix + iw * 0.8, iy); L.cc.lineTo(ix, iy + ih * 0.9); L.cc.fill(); L.cc.restore();
  const m = { c: o.frame, h: 185, mask: 0, rough: 140 };
  if (o.mull === 'cross') { L.rect(x + w / 2 - 3, iy, 6, ih, m); L.rect(ix, y + h * 0.42, iw, 6, m); }
  else if (o.mull === 'hung') { L.rect(ix, y + h * 0.5 - 4, iw, 8, m); }
  else if (o.mull === 'grid') { for (let k = 1; k < 3; k++) L.rect(ix + (iw * k) / 3 - 2, iy, 4, ih, m); L.rect(ix, y + h * 0.5 - 2, iw, 4, m); }
}

// ---------------------------------------------------------------- facades (1024 x 512 = 4 bays x 2 floors)
const FW = 1024, FH = 512, PX = FW / TILE.facade[0];
function eachWindow(fn) { for (let f = 0; f < 2; f++) for (let b = 0; b < 4; b++) fn(b * 256, FH - (f + 1) * 256, f, b); }

function brickWall(L, r, light) {
  L.rect(0, 0, FW, FH, { c: light ? '#f3eee6' : '#ece4da', h: 110, mask: 255, rough: 235 });
  const bh = 9, bw = 26;
  for (let row = 0, y = 0; y < FH; row++, y += bh) {
    const off = row % 2 ? bw / 2 : 0;
    for (let x = -off; x < FW; x += bw) {
      const k = 0.78 + r() * 0.2, v = (light ? 238 : 226) * k;
      L.rect(x + 1, y + 1, bw - 2, bh - 2, { c: `rgb(${v | 0},${(v * 0.97) | 0},${(v * 0.95) | 0})`, h: 165 + r() * 25 });
    }
  }
}
function paintBrick(seed, arch) {
  const r = rand(seed), L = new Layers(FW, FH);
  brickWall(L, r, !arch);
  // soldier course + quoin band every floor
  for (let f = 0; f < 2; f++) L.rect(0, FH - f * 256 - 14, FW, 14, { c: '#e8dccb', h: 200, mask: 255 });
  eachWindow((x, y) => windowUnit(L, x + 128 - 45, y + 64, 90, arch ? 150 : 140, { arch, frame: arch ? '#f4efe3' : '#2d2f36', stone: '#efe6d6', mull: arch ? 'cross' : 'hung', lit: true, r }));
  L.grain(r, 10, 14);
  return finish(L, 3.2);
}
function paintStucco(seed) {
  const r = rand(seed), L = new Layers(FW, FH);
  L.rect(0, 0, FW, FH, { c: '#f4efe6', h: 130, mask: 255, rough: 240 });
  for (let k = 0; k < 900; k++) L.ellipse(r() * FW, r() * FH, 2 + r() * 9, 2 + r() * 6, { c: `rgba(${r() < 0.5 ? '255,255,255' : '200,190,175'},0.12)`, h: 120 + r() * 25 });
  const shutters = ['#3f7f6a', '#2f5f8f', '#a04545', '#c9a227', '#6a4f8f'];
  eachWindow((x, y, f, b) => {
    const wx = x + 128 - 40, wy = y + 70, sc = shutters[(r() * shutters.length) | 0];
    windowUnit(L, wx, wy, 80, 136, { frame: '#ffffff', stone: '#ffffff', mull: 'cross', lit: true, r });
    if (r() < 0.75) for (const sx of [wx - 40, wx + 84]) {
      L.rect(sx, wy - 2, 36, 140, { c: sc, h: 200, mask: 0, rough: 180 });
      for (let k = wy + 6; k < wy + 136; k += 9) L.rect(sx + 4, k, 28, 3, { c: 'rgba(0,0,0,0.25)', h: 170 });
    }
    if (r() < 0.45) { L.rect(wx - 6, wy + 140, 92, 16, { c: '#8a5a33', h: 230, mask: 0 }); for (let k = 0; k < 8; k++) L.ellipse(wx + 4 + k * 11, wy + 136, 6, 6, { c: ['#ff5c8a', '#ffd23f', '#ff8a3d', '#c86bff'][(r() * 4) | 0], h: 240, mask: 0 }); }
  });
  L.grain(r, 8, 10);
  return finish(L, 2.4);
}
function paintSiding(seed) {
  const r = rand(seed), L = new Layers(FW, FH);
  for (let y = 0; y < FH; y += 16) {
    const v = 236 + r() * 12;
    const g = L.cc.createLinearGradient(0, y, 0, y + 16); g.addColorStop(0, `rgb(${v},${v},${v - 4})`); g.addColorStop(1, `rgb(${v - 40},${v - 40},${v - 44})`);
    L.fill(rectPath(0, y, FW, 16), { c: g, h: 150, mask: 255, rough: 210 });
    L.rect(0, y + 13, FW, 3, { h: 60 });
  }
  eachWindow((x, y) => {
    const wx = x + 128 - 42, wy = y + 66;
    L.rect(wx - 14, wy - 14, 112, 172, { c: '#ffffff', h: 215, mask: 0, rough: 160 });
    windowUnit(L, wx, wy, 84, 144, { frame: '#ffffff', mull: 'hung', lit: true, r });
  });
  L.grain(r, 6, 6);
  return finish(L, 3.0);
}
function paintConcrete(seed) {
  const r = rand(seed), L = new Layers(FW, FH);
  L.rect(0, 0, FW, FH, { c: '#e6e4df', h: 140, mask: 255, rough: 235 });
  for (let x = 0; x < FW; x += 128) for (let y = 0; y < FH; y += 128) L.rect(x + 2, y + 2, 124, 124, { c: `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.05})`, h: 150 });
  for (let x = 0; x < FW; x += 128) L.rect(x, 0, 3, FH, { c: '#bdbab3', h: 70 });
  for (let f = 0; f < 2; f++) {
    const y = FH - (f + 1) * 256 + 54, h = 132;
    L.rect(0, y - 6, FW, h + 12, { c: '#222831', h: 50, mask: 0, rough: 200 });
    for (let x = 0; x < FW; x += 64) {
      const g = L.cc.createLinearGradient(x, y, x + 64, y + h); g.addColorStop(0, '#a9c8dd'); g.addColorStop(0.5, '#3e5f78'); g.addColorStop(1, '#1d2b38');
      const lit = r() < 0.35;
      L.fill(rectPath(x + 4, y, 56, h), { c: g, h: 80, mask: 0, rough: 20, e: lit ? '#e8f2ff' : undefined });
      if (r() < 0.3) L.rect(x + 4, y, 56, h * (0.2 + r() * 0.5), { c: 'rgba(235,235,225,0.8)' });
      L.rect(x, y, 4, h, { c: '#7d8792', h: 190, mask: 0, rough: 100 });
    }
    L.rect(0, y + h, FW, 8, { c: '#cfccc5', h: 220, mask: 255 });
  }
  L.grain(r, 7, 8);
  return finish(L, 2.6);
}
function paintGlass(seed) {
  const r = rand(seed), L = new Layers(FW, FH);
  for (let f = 0; f < 2; f++) {
    const y0 = FH - (f + 1) * 256;
    for (let x = 0; x < FW; x += 1024 / 12) {
      const g = L.cc.createLinearGradient(x, y0, x + 85, y0 + 200); const t = r();
      g.addColorStop(0, `rgb(${200 + t * 40},${225 + t * 20},245)`); g.addColorStop(0.5, '#6f9dbf'); g.addColorStop(1, '#2c4a66');
      const lit = r() < 0.3;
      L.fill(rectPath(x, y0, 86, 200), { c: g, h: 90, mask: 110, rough: 18, e: lit ? '#dff0ff' : undefined });
      if (r() < 0.25) L.rect(x + 4, y0 + 4, 78, 40 + r() * 80, { c: 'rgba(240,240,230,0.55)' });
    }
    L.rect(0, y0 + 200, FW, 56, { c: '#b9c0c8', h: 150, mask: 255, rough: 120 });
    L.rect(0, y0 + 200, FW, 6, { c: '#e3e8ec', h: 220, mask: 0, rough: 80 });
    L.rect(0, y0 + 96, FW, 4, { c: '#d6dce1', h: 200, mask: 0, rough: 80 });
    for (let x = 0; x < FW; x += 1024 / 12) L.rect(x - 3, y0, 6, 256, { c: '#dfe5ea', h: 215, mask: 0, rough: 70 });
  }
  L.cc.fillStyle = 'rgba(255,255,255,0.12)'; L.cc.beginPath(); L.cc.moveTo(0, FH * 0.7); L.cc.lineTo(FW * 0.5, 0); L.cc.lineTo(FW * 0.62, 0); L.cc.lineTo(0, FH * 0.95); L.cc.fill();
  return finish(L, 2.0);
}

// ---------------------------------------------------------------- storefront (1024 x 320 = 14.4 m x 4.5 m, two shops)
function paintStore(seed) {
  const W = 1024, H = 320, r = rand(seed), L = new Layers(W, H);
  L.rect(0, 0, W, H, { c: '#f2f2f0', h: 150, mask: 255, rough: 180 });
  for (let s = 0; s < 2; s++) {
    const x0 = s * 512;
    L.rect(x0, 0, 24, H, { c: '#d9d6cf', h: 200, mask: 255 }); L.rect(x0 + 488, 0, 24, H, { c: '#d9d6cf', h: 200, mask: 255 });
    L.rect(x0 + 24, 0, 464, 64, { c: '#fbfbf9', h: 150, mask: 255 }); // sign band (sign geometry mounts here)
    L.rect(x0 + 24, 62, 464, 5, { c: '#a0a0a0', h: 210, mask: 255 });
    const doorLeft = r() < 0.5, dx = doorLeft ? x0 + 40 : x0 + 400;
    // transom
    for (let k = 0; k < 6; k++) { const tx = x0 + 34 + k * 74; L.rect(tx, 72, 68, 30, { c: '#456b88', h: 70, mask: 0, rough: 25, e: '#ffd99a' }); }
    // display window
    const wx = doorLeft ? x0 + 130 : x0 + 34, ww = 354, wy = 110, wh = 172;
    L.rect(wx - 6, wy - 6, ww + 12, wh + 12, { c: '#e9e9e9', h: 200, mask: 255, rough: 140 });
    const g = L.cc.createLinearGradient(wx, wy, wx + ww * 0.5, wy + wh); g.addColorStop(0, '#9ccbe6'); g.addColorStop(0.5, '#4d7088'); g.addColorStop(1, '#25384a');
    L.fill(rectPath(wx, wy, ww, wh), { c: g, h: 70, mask: 0, rough: 20, e: '#ffcf86' });
    // shelves and goods
    for (let sh = 0; sh < 3; sh++) {
      const sy = wy + 40 + sh * 46;
      L.rect(wx + 6, sy, ww - 12, 5, { c: 'rgba(90,60,40,0.8)', e: '#c98d4e' });
      for (let k = 0; k < 9; k++) { if (r() < 0.25) continue; const gx = wx + 16 + k * 37, gw = 14 + r() * 14, gh = 14 + r() * 22; L.rect(gx, sy - gh, gw, gh, { c: ['#ff5c5c', '#ffd23f', '#3fd46f', '#2f9bff', '#ff7eb6', '#ffffff', '#ff8a3d'][(r() * 7) | 0], e: '#ffb35c' }); }
    }
    L.cc.fillStyle = 'rgba(255,255,255,0.25)'; L.cc.beginPath(); L.cc.moveTo(wx, wy + wh * 0.7); L.cc.lineTo(wx + ww * 0.35, wy); L.cc.lineTo(wx + ww * 0.48, wy); L.cc.lineTo(wx, wy + wh); L.cc.fill();
    L.rect(wx + ww / 2 - 3, wy, 6, wh, { c: '#e9e9e9', h: 200, mask: 255 });
    L.rect(wx, wy + wh + 6, ww, H - wy - wh - 6, { c: '#b9b6ae', h: 175, mask: 255, rough: 200 }); // kick plate
    // door
    L.rect(dx - 6, 104, 82, H - 104, { c: '#e9e9e9', h: 205, mask: 255, rough: 140 });
    const dg = L.cc.createLinearGradient(dx, 112, dx + 70, H); dg.addColorStop(0, '#8fbedb'); dg.addColorStop(1, '#22364a');
    L.fill(rectPath(dx + 6, 112, 58, H - 150), { c: dg, h: 70, mask: 0, rough: 20, e: '#ffcf86' });
    L.rect(dx + (doorLeft ? 54 : 10), 210, 6, 34, { c: '#c9c9c9', h: 240, mask: 0, rough: 60 });
    L.rect(dx + 14, 150, 42, 20, { c: r() < 0.5 ? '#ff4d57' : '#3fd46f', mask: 0, e: '#ff6a6a' }); // OPEN sign
  }
  L.grain(r, 6, 6);
  return finish(L, 2.2);
}

// ---------------------------------------------------------------- roofs and ground
function paintRoof(seed) {
  const W = 512, r = rand(seed), L = new Layers(W, W, { rough: 245 });
  L.rect(0, 0, W, W, { c: '#c9c7c2', h: 128 });
  for (let k = 0; k < 6000; k++) { const v = 150 + r() * 100; L.rect(r() * W, r() * W, 2 + r() * 3, 2 + r() * 3, { c: `rgb(${v},${v},${v - 6})`, h: 100 + r() * 90 }); }
  for (let x = 0; x < W; x += 128) L.rect(x, 0, 3, W, { c: '#9a9893', h: 200 });
  return finish(L, 2.0, false);
}
function paintRoofTile(seed) {
  const W = 512, r = rand(seed), L = new Layers(W, W, { rough: 200 });
  L.rect(0, 0, W, W, { c: '#efe2d8', h: 90 });
  for (let row = 0, y = 0; y < W; row++, y += 32) {
    const off = row % 2 ? 24 : 0;
    for (let x = -off; x < W + 48; x += 48) {
      const k = 0.85 + r() * 0.15, v = 245 * k;
      const g = L.cc.createLinearGradient(0, y, 0, y + 32); g.addColorStop(0, `rgb(${v * 0.85},${v * 0.82},${v * 0.8})`); g.addColorStop(1, `rgb(${v},${v * 0.97},${v * 0.95})`);
      L.fill((c) => { c.moveTo(x, y); c.lineTo(x + 46, y); c.lineTo(x + 46, y + 22); c.arc(x + 23, y + 22, 23, 0, Math.PI); c.closePath(); }, { c: g, h: 200 });
    }
  }
  return finish(L, 3.0, false);
}
function paintAsphalt(seed) {
  const W = 512, r = rand(seed), L = new Layers(W, W, { rough: 235, mask: 0 });
  L.rect(0, 0, W, W, { c: '#4a4b50', h: 128 });
  for (let k = 0; k < 9000; k++) { const v = 55 + r() * 45; L.rect(r() * W, r() * W, 1 + r() * 2.5, 1 + r() * 2.5, { c: `rgb(${v},${v},${v + 4})`, h: 90 + r() * 90 }); }
  for (let k = 0; k < 7; k++) L.ellipse(r() * W, r() * W, 30 + r() * 60, 20 + r() * 40, { c: `rgba(${r() < 0.5 ? '30,30,34' : '95,95,100'},0.35)`, h: 120 });
  L.cc.strokeStyle = 'rgba(20,20,22,0.8)'; L.cc.lineWidth = 1.5;
  for (let k = 0; k < 6; k++) { let x = r() * W, y = r() * W; L.cc.beginPath(); L.cc.moveTo(x, y); for (let s = 0; s < 8; s++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; L.cc.lineTo(x, y); } L.cc.stroke(); }
  return finish(L, 1.6, false);
}
function paintSidewalk(seed) {
  const W = 512, r = rand(seed), L = new Layers(W, W, { rough: 230 });
  L.rect(0, 0, W, W, { c: '#ebe8e1', h: 150 });
  for (let x = 0; x < W; x += 128) for (let y = 0; y < W; y += 128) {
    const v = 225 + r() * 25; L.rect(x + 3, y + 3, 122, 122, { c: `rgb(${v},${v - 2},${v - 6})`, h: 160 });
    if (r() < 0.2) L.ellipse(x + r() * 128, y + r() * 128, 8 + r() * 16, 6 + r() * 10, { c: 'rgba(120,110,100,0.15)' });
  }
  for (let k = 0; k < 4000; k++) L.rect(r() * W, r() * W, 1.5, 1.5, { c: `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},0.12)`, h: 140 + r() * 30 });
  return finish(L, 2.2, false);
}
function paintGrass(seed) {
  const W = 512, r = rand(seed), L = new Layers(W, W, { rough: 250, mask: 0 });
  L.rect(0, 0, W, W, { c: '#5aa346', h: 128 });
  for (let k = 0; k < 30; k++) L.ellipse(r() * W, r() * W, 30 + r() * 70, 30 + r() * 70, { c: `rgba(${r() < 0.5 ? '120,190,80' : '60,130,50'},0.25)` });
  L.cc.lineWidth = 1.6;
  for (let k = 0; k < 9000; k++) {
    const x = r() * W, y = r() * W, g = 130 + r() * 90; L.cc.strokeStyle = `rgb(${g * 0.45},${g},${g * 0.35})`;
    L.cc.beginPath(); L.cc.moveTo(x, y); L.cc.lineTo(x + (r() - 0.5) * 4, y - 4 - r() * 6); L.cc.stroke();
    L.hc.fillStyle = 'rgb(180,180,180)'; L.hc.fillRect(x, y - 3, 1.5, 3);
  }
  for (let k = 0; k < 120; k++) L.ellipse(r() * W, r() * W, 2.5, 2.5, { c: ['#ffffff', '#ffe066', '#ff9ad5'][(r() * 3) | 0] });
  return finish(L, 1.5, false);
}
function paintAwning() {
  const W = 256, H = 128, L = new Layers(W, H, { rough: 200 });
  for (let k = 0; k < 4; k++) L.rect(k * 64, 0, 64, H, k % 2 ? { c: '#ffffff', mask: 0, h: 140 } : { c: '#f6f6f6', mask: 255, h: 160 });
  for (let y = 0; y < H; y += 4) L.rect(0, y, W, 2, { c: 'rgba(0,0,0,0.04)' });
  const g = L.cc.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(255,255,255,0.15)'); g.addColorStop(1, 'rgba(0,0,0,0.12)'); L.fill(rectPath(0, 0, W, H), { c: g });
  return finish(L, 1.0, false);
}

// ---------------------------------------------------------------- signs and billboards (atlases; text needs the display font)
function drawSigns(c) {
  const ctx = c.getContext('2d'), cw = c.width / SIGN_COLS, ch = c.height / SIGN_ROWS, r = rand(77);
  const boards = ['#ff4d57', '#2f9bff', '#3fd46f', '#ffd626', '#b56cff', '#ff7a1a', '#ff6fae', '#22304a', '#ffffff', '#1aa39a'];
  SHOP_NAMES.forEach((name, i) => {
    const x = (i % SIGN_COLS) * cw, y = Math.floor(i / SIGN_COLS) * ch, bg = boards[i % boards.length];
    ctx.fillStyle = '#22304a'; ctx.fillRect(x, y, cw, ch);
    ctx.fillStyle = bg; ctx.fillRect(x + 8, y + 8, cw - 16, ch - 16);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x + 8, y + 8, cw - 16, (ch - 16) * 0.35);
    const fg = bg === '#ffffff' || bg === '#ffd626' ? '#22304a' : '#ffffff';
    let size = 56; ctx.font = `${size}px "Luckiest Guy", "Arial Black", sans-serif`;
    while (ctx.measureText(name).width > cw - 40 && size > 22) { size -= 2; ctx.font = `${size}px "Luckiest Guy", "Arial Black", sans-serif`; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = 8; ctx.strokeStyle = fg === '#ffffff' ? '#22304a' : '#ffffff'; ctx.strokeText(name, x + cw / 2, y + ch / 2 + 4);
    ctx.fillStyle = fg; ctx.fillText(name, x + cw / 2, y + ch / 2 + 4);
    for (let k = 0; k < 10; k++) { ctx.fillStyle = r() < 0.5 ? '#fff6d6' : '#ffd626'; ctx.beginPath(); ctx.arc(x + 14 + (k * (cw - 28)) / 9, y + 14, 3.5, 0, Math.PI * 2); ctx.fill(); }
  });
}
function drawBillboards(c) {
  const ctx = c.getContext('2d'), W = c.width, H = c.height / 2;
  const ads = [
    { bg: ['#ffd626', '#ff7a1a'], big: 'MEAL STEEL', small: 'TONIGHT · BRING AN APPETITE', fg: '#ffffff' },
    { bg: ['#2f9bff', '#b56cff'], big: 'EAT. RAM. REPEAT.', small: 'FOOD TRUCK MAYHEM LEAGUE', fg: '#ffd626' },
  ];
  ads.forEach((ad, i) => {
    const y = i * H, g = ctx.createLinearGradient(0, y, W, y + H); g.addColorStop(0, ad.bg[0]); g.addColorStop(1, ad.bg[1]);
    ctx.fillStyle = g; ctx.fillRect(0, y, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; for (let k = 0; k < 12; k++) { ctx.beginPath(); ctx.moveTo(W * 0.15, y + H / 2); ctx.arc(W * 0.15, y + H / 2, W, (k / 12) * Math.PI * 2, (k / 12 + 1 / 24) * Math.PI * 2); ctx.fill(); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.font = '120px "Luckiest Guy", "Arial Black", sans-serif'; ctx.lineWidth = 14; ctx.strokeStyle = '#22304a'; ctx.strokeText(ad.big, W * 0.55, y + H * 0.45); ctx.fillStyle = ad.fg; ctx.fillText(ad.big, W * 0.55, y + H * 0.45);
    ctx.font = '40px "Luckiest Guy", "Arial Black", sans-serif'; ctx.lineWidth = 8; ctx.strokeText(ad.small, W * 0.55, y + H * 0.8); ctx.fillStyle = '#ffffff'; ctx.fillText(ad.small, W * 0.55, y + H * 0.8);
    ctx.fillStyle = '#c8452c'; ctx.beginPath(); ctx.ellipse(W * 0.12, y + H * 0.5, 80, 34, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e9b96e'; ctx.beginPath(); ctx.ellipse(W * 0.12, y + H * 0.58, 92, 30, -0.4, 0, Math.PI); ctx.fill();
    ctx.strokeStyle = '#22304a'; ctx.lineWidth = 6; ctx.strokeRect(3, y + 3, W - 6, H - 6);
  });
}
function atlas(w, h, draw) {
  const c = canvas(w, h); draw(c);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const redraw = () => { draw(c); t.needsUpdate = true; };
  if (document.fonts) document.fonts.load('48px "Luckiest Guy"').then(redraw).catch(() => {});
  return t;
}

let CACHE = null;
/** All city textures, painted once and shared by every match. */
export function getCityTextures() {
  if (CACHE) return CACHE;
  CACHE = {
    facade: { brick: paintBrick(11, true), brickB: paintBrick(23, false), stucco: paintStucco(31), siding: paintSiding(41), concrete: paintConcrete(53), glass: paintGlass(61) },
    store: paintStore(71), roof: paintRoof(81), roofTile: paintRoofTile(91),
    asphalt: paintAsphalt(101), sidewalk: paintSidewalk(111), grass: paintGrass(121), awning: paintAwning(),
    signs: atlas(1024, 1024, drawSigns), billboard: atlas(1024, 512, drawBillboards),
  };
  return CACHE;
}
