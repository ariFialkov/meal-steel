// Things splattered over the player's windscreen by special moves: procedural SVG blobs with drips and a glossy
// highlight (cheese whiz, fry oil, soup with noodles, tzatziki with dill, an egg, beer foam), a tortilla imprint, a
// dusting of cinnamon sugar, and full-screen hazes (hickory smoke, a laser glare). Each fades out after a while.
const KINDS = {
  cheese: { fill: '#ffa51f', edge: '#d97a00', hi: '#ffe08a', drips: 4 },
  oil: { fill: 'rgba(196,140,24,0.62)', edge: 'rgba(140,96,10,0.7)', hi: 'rgba(255,240,180,0.7)', drips: 5 },
  soup: { fill: 'rgba(224,122,42,0.78)', edge: '#b9561c', hi: '#ffd08a', drips: 5, noodles: true },
  tzatziki: { fill: '#f7f7ef', edge: '#d6d6c8', hi: '#ffffff', drips: 3, flecks: '#5aa84c' },
  egg: { fill: '#fffaf0', edge: '#e8e0cc', hi: '#ffffff', drips: 2, yolk: true },
  beer: { fill: 'rgba(255,190,60,0.6)', edge: 'rgba(200,130,20,0.7)', hi: '#fff8e6', drips: 4, foam: true },
  tortilla: { tortilla: true },
  sugar: { sugar: true },
  smoke: { full: 'radial-gradient(ellipse at center, rgba(70,66,62,0.35) 0%, rgba(50,46,43,0.85) 70%, rgba(30,28,26,0.95) 100%)' },
  laser: { full: 'radial-gradient(ellipse at center, rgba(255,154,209,0.15) 0%, rgba(255,95,162,0.45) 75%, rgba(111,216,255,0.5) 100%)' },
};

const rand = (a, b) => a + Math.random() * (b - a);

function blobPath(cx, cy, r, lobes, wob) {
  const n = 28, pts = [];
  const ph = Math.random() * 6.28, ph2 = Math.random() * 6.28;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + wob * Math.sin(a * lobes + ph) * 0.6 + wob * 0.4 * Math.sin(a * (lobes + 3) + ph2) + (Math.random() - 0.5) * wob * 0.5);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  // smooth closed curve through the points
  let d = `M${((pts[0][0] + pts[n - 1][0]) / 2).toFixed(1)},${((pts[0][1] + pts[n - 1][1]) / 2).toFixed(1)}`;
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; d += ` Q${p[0].toFixed(1)},${p[1].toFixed(1)} ${((p[0] + q[0]) / 2).toFixed(1)},${((p[1] + q[1]) / 2).toFixed(1)}`; }
  return d + 'Z';
}

function svgFor(kind) {
  const K = KINDS[kind] || KINDS.cheese;
  let s = '<svg viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg">';
  if (K.tortilla) {
    s += `<path d="${blobPath(100, 110, 78, 7, 0.05)}" fill="#e8c88d" stroke="#c9a062" stroke-width="3"/>`;
    for (let k = 0; k < 26; k++) s += `<circle cx="${rand(40, 160).toFixed(0)}" cy="${rand(50, 170).toFixed(0)}" r="${rand(2, 7).toFixed(1)}" fill="rgba(${rand(110, 150) | 0},${rand(60, 90) | 0},30,${rand(0.35, 0.8).toFixed(2)})"/>`;
    return s + '</svg>';
  }
  if (K.sugar) {
    for (let k = 0; k < 70; k++) s += `<circle cx="${rand(5, 195).toFixed(0)}" cy="${rand(5, 235).toFixed(0)}" r="${rand(1, 3.5).toFixed(1)}" fill="${Math.random() < 0.5 ? '#fff6e0' : '#c68a4e'}"/>`;
    return s + '</svg>';
  }
  // drips run down from the blob
  for (let k = 0; k < K.drips; k++) {
    const x = rand(55, 145), w = rand(7, 14), len = rand(40, 110);
    s += `<path d="M${x - w / 2},100 L${x - w / 2},${100 + len} a${w / 2},${w / 2} 0 0 0 ${w},0 L${x + w / 2},100Z" fill="${K.fill}" stroke="${K.edge}" stroke-width="2"/>`;
  }
  s += `<path d="${blobPath(100, 95, 62, 5 + (Math.random() * 3 | 0), 0.32)}" fill="${K.fill}" stroke="${K.edge}" stroke-width="3"/>`;
  for (let k = 0; k < 5; k++) s += `<circle cx="${rand(20, 180).toFixed(0)}" cy="${rand(20, 170).toFixed(0)}" r="${rand(4, 10).toFixed(1)}" fill="${K.fill}" stroke="${K.edge}" stroke-width="2"/>`;
  if (K.noodles) for (let k = 0; k < 5; k++) { const y = rand(65, 125), x = rand(55, 95); s += `<path d="M${x},${y} q12,-14 24,0 t24,0 t24,0" fill="none" stroke="#f2c94c" stroke-width="5" stroke-linecap="round"/>`; }
  if (K.noodles) for (let k = 0; k < 6; k++) s += `<circle cx="${rand(60, 140).toFixed(0)}" cy="${rand(60, 130).toFixed(0)}" r="3.5" fill="#4caf50"/>`;
  if (K.flecks) for (let k = 0; k < 16; k++) s += `<rect x="${rand(55, 145).toFixed(0)}" y="${rand(55, 135).toFixed(0)}" width="${rand(2, 6).toFixed(1)}" height="2" fill="${K.flecks}" transform="rotate(${rand(0, 180) | 0} 100 100)"/>`;
  if (K.yolk) s += `<circle cx="${rand(90, 110).toFixed(0)}" cy="${rand(88, 102).toFixed(0)}" r="24" fill="#ffc21a" stroke="#e8a300" stroke-width="3"/><ellipse cx="94" cy="86" rx="8" ry="5" fill="#fff3b0"/>`;
  if (K.foam) for (let k = 0; k < 14; k++) s += `<circle cx="${rand(50, 150).toFixed(0)}" cy="${rand(45, 90).toFixed(0)}" r="${rand(6, 14).toFixed(1)}" fill="#fff8e6" stroke="#eadfc6" stroke-width="1.5"/>`;
  s += `<ellipse cx="78" cy="68" rx="18" ry="9" fill="${K.hi}" opacity="0.75" transform="rotate(-25 78 68)"/><circle cx="104" cy="60" r="4" fill="${K.hi}" opacity="0.8"/>`;
  return s + '</svg>';
}

export class Splats {
  constructor(parent) {
    this.el = document.createElement('div'); this.el.className = 'splats'; parent.appendChild(this.el);
    this.full = {};
  }
  clear() { this.el.innerHTML = ''; this.full = {}; }
  /** amount scales the size (repeated hits make ever bigger splats); secs is how long it stays */
  add(kind, amount = 1, secs = 2) {
    const K = KINDS[kind] || KINDS.cheese;
    if (K.full) {
      let f = this.full[kind];
      if (!f || !f.isConnected) { f = document.createElement('div'); f.className = 'splat-full'; f.style.background = K.full; this.el.appendChild(f); this.full[kind] = f; }
      f.style.opacity = Math.min(1, 0.35 + amount * 0.5); f.style.transition = 'none';
      clearTimeout(f._t); f._t = setTimeout(() => { f.style.transition = 'opacity .7s'; f.style.opacity = 0; }, secs * 1000);
      return;
    }
    while (this.el.querySelectorAll('.splat').length > 14) this.el.querySelector('.splat').remove();
    const d = document.createElement('div'); d.className = 'splat';
    const size = Math.min(85, 24 * Math.pow(Math.max(0.3, amount), 0.75));
    d.style.width = size + 'vmin'; d.style.left = rand(8, 92 - size * 0.6) + '%'; d.style.top = rand(8, 60) + '%';
    d.style.transform = `translate(-10%, -10%) rotate(${rand(-30, 30).toFixed(0)}deg)`;
    d.innerHTML = svgFor(kind);
    this.el.appendChild(d);
    requestAnimationFrame(() => d.classList.add('in'));
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 800); }, Math.max(0.4, secs) * 1000);
  }
}
