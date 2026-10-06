// One InstancedMesh of small puffs handles confetti, sparks, smoke puffs, coins pickups, splashes.
import * as THREE from 'three';

const MAX_DEFAULT = 900;
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
const _qz = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1);

/** a lumpy round puff: a soft radial falloff with a few overlapping lobes, so a cloud doesn't read as discs */
const TEX = {};
function canvasTex(key, w, h, draw) {
  if (TEX[key]) return TEX[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (TEX[key] = t);
}
const lobe = (g, x, y, r, a, lit = 255, shade = 255) => {
  // lit at the top-left, shaded underneath: a billow with some volume to it
  const gr = g.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
  gr.addColorStop(0, `rgba(${lit},${lit},${lit},${a})`); gr.addColorStop(0.6, `rgba(${(lit + shade) >> 1},${(lit + shade) >> 1},${(lit + shade) >> 1},${a * 0.75})`); gr.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
};
const TEXTURES = {
  puff: () => canvasTex('puff', 64, 64, (g) => { lobe(g, 32, 32, 30, 0.85); lobe(g, 22, 26, 16, 0.5); lobe(g, 42, 28, 15, 0.45); lobe(g, 30, 42, 15, 0.45); }),
  // a cauliflower of shaded lobes: big rolling smoke
  billow: () => canvasTex('billow', 128, 128, (g) => {
    const L = [[64, 80, 40, 0.75], [40, 74, 28, 0.8], [88, 74, 28, 0.8], [52, 52, 30, 0.85], [78, 50, 28, 0.85], [64, 34, 24, 0.9], [34, 56, 18, 0.8], [96, 56, 18, 0.8], [64, 62, 30, 0.6]];
    for (const [x, y, r, a] of L) lobe(g, x, y, r, a, 255, 120);
  }),
  // a flame tongue, base at the bottom, tip at the top: bright core, dimmer rim (tinted by colour)
  flame: () => canvasTex('flame', 64, 128, (g) => {
    const L = [[32, 98, 26, 0.9], [32, 82, 22, 0.9], [33, 66, 17, 0.85], [31, 51, 13, 0.8], [33, 37, 9, 0.7], [31, 25, 6, 0.6], [32, 15, 4, 0.5]];
    for (const [x, y, r, a] of L) { const gr = g.createRadialGradient(x, y + r * 0.2, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.5, `rgba(235,235,235,${a * 0.8})`); gr.addColorStop(1, 'rgba(150,150,150,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  }),
};
// flames cool from a white-yellow core through orange to deep red and soot
const RAMP = [[0, 1, 0.9, 0.45], [0.2, 1, 0.66, 0.12], [0.5, 0.98, 0.38, 0.04], [0.78, 0.78, 0.16, 0.03], [1, 0.32, 0.06, 0.03]]; // (sRGB)
function ramp(t, out) {
  for (let i = 1; i < RAMP.length; i++) if (t <= RAMP[i][0]) { const a = RAMP[i - 1], b = RAMP[i], k = (t - a[0]) / (b[0] - a[0]); return out.setRGB(a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k, THREE.SRGBColorSpace); }
  return out.setRGB(0.32, 0.06, 0.03, THREE.SRGBColorSpace);
}
const _up = new THREE.Vector3(), _toCam = new THREE.Vector3(), _rt = new THREE.Vector3(), _nm = new THREE.Vector3(), _c2 = new THREE.Color();

export class Particles {
  /**
   * opts.additive: glowing particles (fire, lasers, flashes) drawn with additive blending, unlit.
   * opts.soft: billboarded puffs with a soft round edge that thin out as they age (clouds of smoke, frost, sugar, dust);
   * update() then wants the camera. With opts.unlit they glow at their own colour. opts.texture: 'puff' | 'billow'.
   */
  constructor(scene, opts = {}) {
    const MAX = this.max = opts.max || MAX_DEFAULT;
    // opts.flame: flame tongues stretched along their motion (rising fire, a jet of flame), coloured by age
    this.flame = !!opts.flame;
    this.soft = !!opts.soft || this.flame;
    // rounded low-poly puff (reads as smoke, sparks or confetti once scaled; boxes looked like rubble)
    const geo = this.flame ? new THREE.PlaneGeometry(1, 2) : this.soft ? new THREE.PlaneGeometry(1.5, 1.5) : new THREE.IcosahedronGeometry(0.62, 1);
    let material;
    if (opts.additive) material = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    else if (this.soft) {
      const map = TEXTURES[this.flame ? 'flame' : opts.texture || 'puff']();
      // opts.unlit: self-lit puffs (flame bodies) that keep their colour instead of adding up to white like additive glow
      material = opts.unlit || this.flame ? new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })
        : new THREE.MeshLambertMaterial({ map, transparent: true, depthWrite: false });
      // per-particle opacity, so a cloud thins out instead of shrinking
      this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1); this.alpha.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('instanceAlpha', this.alpha);
      material.onBeforeCompile = (sh) => {
        sh.vertexShader = 'attribute float instanceAlpha;\nvarying float vAlpha;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = instanceAlpha;');
        sh.fragmentShader = 'varying float vAlpha;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= vAlpha;');
      };
    } else material = new THREE.MeshLambertMaterial({ vertexColors: false });
    this.mesh = new THREE.InstancedMesh(geo, material, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.frustumCulled = false; this.mesh.castShadow = false;
    this.mesh.count = 0; // nothing alive yet (otherwise every instance draws at the origin until the first update)
    scene.add(this.mesh);
    this.ps = []; for (let i = 0; i < MAX; i++) this.ps.push({ alive: false });
    if (opts.additive) this.mesh.renderOrder = 5;
    if (this.soft) this.mesh.renderOrder = 4;
    this.cursor = 0;
  }
  emit(n, fn) {
    for (let k = 0; k < n; k++) {
      const p = this.ps[this.cursor]; this.cursor = (this.cursor + 1) % this.max;
      p.alive = true; p.age = 0; p.life = 1; p.x = 0; p.y = 0; p.z = 0; p.vx = 0; p.vy = 0; p.vz = 0; p.size = 0.3; p.grow = 0; p.g = 20; p.drag = 0; p.rot = Math.random() * 6; p.spin = 0; p.color = 0xffffff; p.flat = false; p.alpha = 0.85; p.stretch = 1;
      fn(p, k);
    }
  }
  sparks(x, y, z, n = 10, color = 0xffd166) {
    this.emit(n, (p) => { p.x = x; p.y = y; p.z = z; const a = Math.random() * 6.28, s = 4 + Math.random() * 10; p.vx = Math.cos(a) * s; p.vz = Math.sin(a) * s; p.vy = 3 + Math.random() * 7; p.size = 0.2 + Math.random() * 0.2; p.life = 0.4 + Math.random() * 0.4; p.color = color; p.spin = 10; });
  }
  smoke(x, y, z, n = 6, color = 0x777777, size = 0.8) {
    this.emit(n, (p) => { p.x = x + (Math.random() - 0.5); p.y = y; p.z = z + (Math.random() - 0.5); p.vx = (Math.random() - 0.5) * 2; p.vz = (Math.random() - 0.5) * 2; p.vy = 2 + Math.random() * 2; p.size = size; p.grow = 1.6; p.life = 0.8 + Math.random() * 0.6; p.g = -1; p.color = color; p.spin = 1; });
  }
  debris(x, y, z, n = 8, color = 0x8d6e63) {
    this.emit(n, (p) => { p.x = x; p.y = y; p.z = z; const a = Math.random() * 6.28, s = 3 + Math.random() * 6; p.vx = Math.cos(a) * s; p.vz = Math.sin(a) * s; p.vy = 4 + Math.random() * 6; p.size = 0.25 + Math.random() * 0.3; p.life = 0.9 + Math.random() * 0.5; p.color = color; p.spin = 8; });
  }
  confetti(x, y, z, n = 120, spread = 8) {
    const cols = [0xff6a2a, 0xffb02a, 0x3ad17c, 0x3aa9ff, 0xef3b4b, 0xffffff, 0xd36cff];
    this.emit(n, (p) => { p.x = x + (Math.random() - 0.5) * spread; p.y = y; p.z = z + (Math.random() - 0.5) * spread; p.vx = (Math.random() - 0.5) * 8; p.vz = (Math.random() - 0.5) * 8; p.vy = 8 + Math.random() * 14; p.size = 0.35; p.flat = true; p.life = 2.5 + Math.random() * 1.5; p.g = 6; p.drag = 1.2; p.color = cols[Math.floor(Math.random() * cols.length)]; p.spin = 6 + Math.random() * 6; });
  }
  splash(x, y, z, color, n = 14) {
    this.emit(n, (p) => { p.x = x; p.y = y; p.z = z; const a = Math.random() * 6.28, s = 2 + Math.random() * 7; p.vx = Math.cos(a) * s; p.vz = Math.sin(a) * s; p.vy = 4 + Math.random() * 6; p.size = 0.3 + Math.random() * 0.4; p.life = 0.6 + Math.random() * 0.5; p.color = color; p.spin = 4; });
  }
  ring(x, y, z, color, radius = 8, n = 40) {
    this.emit(n, (p, k) => { const a = (k / n) * 6.28; p.x = x + Math.cos(a) * 1.5; p.y = y; p.z = z + Math.sin(a) * 1.5; p.vx = Math.cos(a) * radius * 1.5; p.vz = Math.sin(a) * radius * 1.5; p.vy = 1; p.g = 0; p.drag = 2.5; p.size = 0.5; p.life = 0.7; p.color = color; });
  }
  update(dt, camera) {
    let count = 0;
    const face = this.soft && camera ? camera.quaternion : null;
    for (let i = 0; i < this.max; i++) {
      const p = this.ps[i];
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) { p.alive = false; continue; }
      p.vy -= p.g * dt;
      if (p.drag) { const d = Math.exp(-p.drag * dt); p.vx *= d; p.vz *= d; p.vy *= d; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05 && p.g > 0) { p.y = 0.05; p.vy *= -0.3; p.vx *= 0.7; p.vz *= 0.7; }
      p.rot += p.spin * dt;
      const t = p.age / p.life;
      if (this.flame && camera) {
        // a tongue of flame: long axis along its motion, turned about that axis to face the camera, flickering
        const sp = Math.hypot(p.vx, p.vy, p.vz);
        if (sp > 0.4) _up.set(p.vx / sp, p.vy / sp, p.vz / sp); else _up.set(0, 1, 0);
        _toCam.set(camera.position.x - p.x, camera.position.y - p.y, camera.position.z - p.z).normalize();
        _rt.crossVectors(_up, _toCam); if (_rt.lengthSq() < 1e-4) _rt.set(1, 0, 0); _rt.normalize(); _nm.crossVectors(_rt, _up);
        const s = (p.size + p.grow * p.age) * (t > 0.6 ? 1 - (t - 0.6) * 0.8 : 1), flick = 0.8 + Math.random() * 0.4;
        _m.makeBasis(_rt.multiplyScalar(s * flick), _up.multiplyScalar(s * p.stretch * (1.3 - 0.3 * flick)), _nm);
        _m.setPosition(p.x, p.y, p.z);
        this.alpha.setX(count, Math.min(1, t / 0.08) * (t > 0.5 ? Math.max(0, (1 - t) / 0.5) : 1) * (p.alpha ?? 0.85));
        this.mesh.setMatrixAt(count, _m);
        _c.set(p.color); ramp(t, _c2); _c.multiply(_c2); this.mesh.setColorAt(count, _c);
        count++;
        continue;
      }
      if (this.soft) {
        // fade in quickly, thin out over the back half of its life; spin only about the view axis
        const a = Math.min(1, t / 0.12) * (t > 0.45 ? Math.max(0, (1 - t) / 0.55) : 1) * (p.alpha ?? 0.85);
        this.alpha.setX(count, a);
        const s = p.size + p.grow * p.age;
        // kept clear of the ground so it never cuts a puff off hard
        _p.set(p.x, Math.max(p.y, s * 0.6), p.z); _q.copy(face || _q.identity()); _q.multiply(_qz.setFromAxisAngle(_z, p.rot * 0.3));
        _s.set(s, s, s);
      } else {
        const fade = t > 0.7 ? (1 - t) / 0.3 : 1;
        const s = (p.size + p.grow * p.age) * fade;
        _p.set(p.x, p.y, p.z); _e.set(p.rot, p.rot * 0.7, p.rot * 0.3); _q.setFromEuler(_e);
        _s.set(s, p.flat ? s * 0.15 : s, s);
      }
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(count, _m);
      _c.set(p.color); this.mesh.setColorAt(count, _c);
      count++;
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (this.alpha) this.alpha.needsUpdate = true;
  }
}
