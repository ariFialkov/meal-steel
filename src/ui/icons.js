// Hand-drawn cartoon SVG icons (64x64). Flat fills, chunky navy outlines, used everywhere instead of emoji.
const INK = '#243b53';
const star = (cx, cy, n, ro, ri, rot = -Math.PI / 2) => {
  const pts = [];
  for (let i = 0; i < n * 2; i++) { const r = i % 2 ? ri : ro, a = rot + (i * Math.PI) / n; pts.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`); }
  return pts.join(' ');
};

const ICONS = {
  // ---- modes ----
  flag: `<path d="M14 6v52"/><path d="M14 9h40l-7 13 7 13H14z" fill="#fff"/>
    <path d="M14 9h10v9H14zM34 9h10v9H34zM24 18h10v8H24zM44 18h8l-1 4 1 4h-8zM14 26h10v9H14zM34 26h10v9H34z" fill="${INK}" stroke="none"/>`,
  burst: `<polygon points="${star(32, 32, 12, 29, 17)}" fill="#ff8a3d"/><polygon points="${star(32, 32, 8, 15, 8, -Math.PI / 2 + 0.3)}" fill="#ffd23f" stroke="none"/>`,
  ball: `<circle cx="32" cy="32" r="26" fill="#fff"/><polygon points="32,21 43,29 39,42 25,42 21,29" fill="${INK}" stroke="none"/>
    <path d="M32 21V7M43 29l12-4M39 42l8 10M25 42l-8 10M21 29L9 25"/>`,
  note: `<path d="M27 47V14l28-6v31" fill="none"/><path d="M27 14l28-6v10l-28 6z" fill="#3a9cff"/>
    <ellipse cx="19" cy="47" rx="9" ry="7" fill="#3a9cff"/><ellipse cx="47" cy="39" rx="9" ry="7" fill="#3a9cff"/>`,
  // ---- hud / menu ----
  flame: `<path d="M32 5c4 11 15 15 15 29a15 15 0 0 1-30 0c0-8 4-12 7-17 1 5 3 7 6 8-1-8 0-13 2-20z" fill="#ff8a3d"/>
    <path d="M32 30c3 5 8 7 8 13a8 8 0 0 1-16 0c0-5 3-7 5-10 1 2 2 3 3 3z" fill="#ffd23f" stroke="none"/>`,
  reverse: `<path d="M14 10l18 14 18-14v11L32 35 14 21z" fill="#fff"/><path d="M14 30l18 14 18-14v11L32 55 14 41z" fill="#fff"/>`,
  camera: `<rect x="6" y="18" width="40" height="30" rx="6" fill="#3a9cff"/><path d="M46 28l12-8v26l-12-8z" fill="#fff"/><circle cx="20" cy="12" r="6" fill="#fff"/><circle cx="34" cy="12" r="6" fill="#fff"/>`,
  close: `<path d="M16 16l32 32M48 16L16 48" stroke-width="8"/>`,
  rotate: `<path d="M50 34a18 18 0 1 1-7-14" fill="none" stroke-width="6"/><path d="M52 8v16H36z" fill="${INK}" stroke="none"/>`,
  coin: `<circle cx="32" cy="32" r="26" fill="#ffd23f"/><circle cx="32" cy="32" r="18" fill="none" stroke="#e0a800" stroke-width="3"/>
    <text x="32" y="43" font-size="30" font-weight="900" text-anchor="middle" fill="${INK}" stroke="none" font-family="Arial Black,Arial,sans-serif">$</text>`,
  arrowLeft: `<path d="M38 8L12 32l26 24V42h16V22H38z" fill="#fff"/>`,
  arrowRight: `<path d="M26 8l26 24-26 24V42H10V22h16z" fill="#fff"/>`,
  trophy: `<path d="M18 8h28v14a14 14 0 0 1-28 0z" fill="#ffd23f"/><path d="M18 14H8a10 10 0 0 0 10 10M46 14h10a10 10 0 0 1-10 10" fill="none"/>
    <path d="M26 36h12v8H26z" fill="#ffd23f"/><path d="M16 44h32v10H16z" fill="#ff8a3d"/>`,
  star: `<polygon points="${star(32, 33, 5, 28, 13)}" fill="#ffd23f"/>`,
  // ---- specials ----
  hotdog: `<g transform="rotate(-22 32 32)"><rect x="8" y="26" width="48" height="18" rx="9" fill="#e9b96e"/><rect x="5" y="19" width="54" height="14" rx="7" fill="#c8452c"/>
    <path d="M13 26c4-4 6 4 10 0s6 4 10 0 6 4 10 0 6 4 9 0" fill="none" stroke="#ffd23f" stroke-width="3"/></g>`,
  fries: `<path d="M20 30V10M28 30V6M36 30V8M44 30V12M23 30l-7-16M41 30l7-16" stroke-width="9"/>
    <path d="M20 30V10M28 30V6M36 30V8M44 30V12M23 30l-7-16M41 30l7-16" stroke="#ffd23f" stroke-width="5"/><path d="M13 30h38l-5 27H18z" fill="#ff5c5c"/>`,
  cheese: `<path d="M6 44L58 18v28H6z" fill="#ffd23f"/><path d="M6 44L58 18l-6-9L6 37z" fill="#ffe77a"/>
    <circle cx="22" cy="38" r="4" fill="#e0a800" stroke="none"/><circle cx="42" cy="30" r="3" fill="#e0a800" stroke="none"/><circle cx="36" cy="41" r="3" fill="#e0a800" stroke="none"/>`,
  burrito: `<g transform="rotate(-30 32 32)"><rect x="8" y="22" width="46" height="20" rx="10" fill="#d9d9d9"/><circle cx="50" cy="32" r="9" fill="#f9e4b7"/>
    <circle cx="48" cy="29" r="2.5" fill="#43d17a" stroke="none"/><circle cx="53" cy="34" r="2.5" fill="#ff5c5c" stroke="none"/><path d="M20 22v20M30 22v20" stroke-width="2"/></g>`,
  ramen: `<path d="M40 6L26 28M50 9L36 28"/><path d="M8 30h48a24 20 0 0 1-48 0z" fill="#ff5c5c"/><rect x="6" y="26" width="52" height="8" rx="4" fill="#fff"/>
    <path d="M14 26c0-8 4-8 4 0s4 8 4 0 4-8 4 0 4 8 4 0 4-8 4 0 4 8 4 0" fill="none" stroke="#ffd23f" stroke-width="3"/>`,
  chili: `<path d="M48 16c10 12 4 36-18 42C14 62 6 50 10 44c8 6 16 2 22-8 6-10 8-16 16-20z" fill="#ff5c5c"/><path d="M48 16c-1-7-8-10-14-7 5 0 10 3 14 7z" fill="#43d17a"/>`,
  churro: `<g transform="rotate(-35 32 32)"><rect x="6" y="26" width="52" height="12" rx="6" fill="#d98c3f"/><path d="M16 26v12M26 26v12M36 26v12M46 26v12" stroke-width="2"/></g>
    <g transform="rotate(35 32 32)"><rect x="6" y="26" width="52" height="12" rx="6" fill="#e39a4d"/><path d="M16 26v12M26 26v12M36 26v12M46 26v12" stroke-width="2"/></g>
    <circle cx="20" cy="14" r="2" fill="#fff" stroke="none"/><circle cx="46" cy="50" r="2" fill="#fff" stroke="none"/><circle cx="50" cy="12" r="2" fill="#fff" stroke="none"/>`,
  hoagie: `<rect x="6" y="28" width="52" height="18" rx="9" fill="#e9b96e"/><path d="M8 34c6-5 8 4 14 0s8 5 14 0 8 5 14 0" fill="none" stroke="#43d17a" stroke-width="5"/>
    <circle cx="20" cy="30" r="4" fill="#ff5c5c" stroke="none"/><circle cx="44" cy="30" r="4" fill="#ff5c5c" stroke="none"/><rect x="6" y="18" width="52" height="14" rx="7" fill="#f0c98a"/>`,
  icecream: `<path d="M20 30h24L32 58z" fill="#e9b96e"/><path d="M24 37h16M27 45h10" stroke-width="2"/><circle cx="32" cy="24" r="13" fill="#ff7eb6"/><circle cx="32" cy="14" r="9" fill="#fff"/><circle cx="35" cy="6" r="3" fill="#ff5c5c"/>`,
  gyro: `<circle cx="20" cy="24" r="7" fill="#43d17a"/><circle cx="32" cy="19" r="9" fill="#8b5a2b"/><circle cx="44" cy="24" r="7" fill="#ff5c5c"/><path d="M8 28h48a24 24 0 0 1-48 0z" fill="#e9b96e"/>`,
  pho: `<path d="M24 20c-3-4 3-6 0-10M34 18c-3-4 3-6 0-10M44 20c-3-4 3-6 0-10" fill="none" stroke-width="3" opacity=".8"/><path d="M54 4L40 28"/>
    <path d="M8 30h48a24 20 0 0 1-48 0z" fill="#7a3fb5"/><rect x="6" y="26" width="52" height="8" rx="4" fill="#fff"/><circle cx="38" cy="29" r="4" fill="#43d17a" stroke="none"/>`,
  egg: `<path d="M14 36c-4-14 10-26 24-22s20 14 14 26-16 14-26 8S16 44 14 36z" fill="#fff"/><circle cx="34" cy="34" r="9" fill="#ffd23f"/><circle cx="31" cy="31" r="3" fill="#fff" stroke="none"/>`,
  wrap: `<g transform="rotate(-30 32 32)"><rect x="8" y="22" width="48" height="20" rx="10" fill="#9fcb6f"/><path d="M20 22v20M30 22v20" stroke-width="2"/>
    <circle cx="50" cy="32" r="9" fill="#f9e4b7"/><path d="M50 32a4 4 0 1 1-4 0" fill="none" stroke="#ff5c5c" stroke-width="3"/></g>`,
  takeout: `<path d="M20 22c0-10 24-10 24 0" fill="none"/><path d="M14 24h36l-4 32H18z" fill="#fff"/><path d="M12 22h40v8H12z" fill="#fff"/>
    <path d="M24 36h16l-2 5H26zM22 42h20l-2 5H24z" fill="#ff5c5c" stroke="none"/>`,
  bbq: `<path d="M26 38L12 52" stroke-width="10"/><path d="M26 38L12 52" stroke="#fff" stroke-width="5"/><circle cx="10" cy="49" r="5" fill="#fff"/><circle cx="15" cy="54" r="5" fill="#fff"/>
    <ellipse cx="38" cy="26" rx="18" ry="14" fill="#c8452c"/><path d="M30 18l10 6M28 29l12 6" stroke-width="3"/>`,
  beer: `<rect x="12" y="20" width="32" height="36" rx="4" fill="#ffd23f"/><path d="M44 28h6a6 6 0 0 1 6 6v8a6 6 0 0 1-6 6h-6" fill="none"/>
    <path d="M20 30v18M28 30v18M36 30v18" stroke="#e0a800" stroke-width="3"/><circle cx="18" cy="18" r="7" fill="#fff"/><circle cx="30" cy="14" r="8" fill="#fff"/><circle cx="41" cy="18" r="6" fill="#fff"/>`,
};

/** Inline SVG markup for an icon. cls is appended to the svg class list. */
export function icon(name, cls = '') {
  const body = ICONS[name] || ICONS.star;
  return `<svg class="ico ${cls}" viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="${INK}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`;
}

/** Fill every element with a data-icon attribute. */
export function mountIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon);
}
