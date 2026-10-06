// One InstancedMesh of small puffs handles confetti, sparks, smoke puffs, coins pickups, splashes.
import * as THREE from 'three';

const MAX_DEFAULT = 900;
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
const _qz = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1);

/** a lumpy round puff: a soft radial falloff with a few overlapping lobes, so a cloud doesn't read as discs */
let PUFF = null;
function puffTexture() {
  if (PUFF) return PUFF;
  const n = 64, c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d');
  const lobe = (x, y, r, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.55, `rgba(255,255,255,${a * 0.55})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, n, n); };
  lobe(32, 32, 30, 0.85); lobe(22, 26, 16, 0.5); lobe(42, 28, 15, 0.45); lobe(30, 42, 15, 0.45);
  PUFF = new THREE.CanvasTexture(c); PUFF.colorSpace = THREE.SRGBColorSpace;
  return PUFF;
}

export class Particles {
  /**
   * opts.additive: glowing particles (fire, lasers, flashes) drawn with additive blending, unlit.
   * opts.soft: billboarded puffs with a soft round edge that thin out as they age (clouds of smoke, frost, sugar, dust);
   * update() then wants the camera. With opts.unlit they glow at their own colour (flames).
   */
  constructor(scene, opts = {}) {
    const MAX = this.max = opts.max || MAX_DEFAULT;
    this.soft = !!opts.soft;
    // rounded low-poly puff (reads as smoke, sparks or confetti once scaled; boxes looked like rubble)
    const geo = this.soft ? new THREE.PlaneGeometry(1.5, 1.5) : new THREE.IcosahedronGeometry(0.62, 1);
    let material;
    if (opts.additive) material = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    else if (this.soft) {
      // opts.unlit: self-lit puffs (flame bodies) that keep their colour instead of adding up to white like additive glow
      material = opts.unlit ? new THREE.MeshBasicMaterial({ map: puffTexture(), transparent: true, depthWrite: false, toneMapped: false })
        : new THREE.MeshLambertMaterial({ map: puffTexture(), transparent: true, depthWrite: false });
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
      p.alive = true; p.age = 0; p.life = 1; p.x = 0; p.y = 0; p.z = 0; p.vx = 0; p.vy = 0; p.vz = 0; p.size = 0.3; p.grow = 0; p.g = 20; p.drag = 0; p.rot = Math.random() * 6; p.spin = 0; p.color = 0xffffff; p.flat = false; p.alpha = 0.85;
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
      if (this.soft) {
        // fade in quickly, thin out over the back half of its life; spin only about the view axis
        const a = Math.min(1, t / 0.12) * (t > 0.45 ? Math.max(0, (1 - t) / 0.55) : 1) * (p.alpha ?? 0.85);
        this.alpha.setX(count, a);
        const s = p.size + p.grow * p.age;
        _p.set(p.x, Math.max(p.y, s * 0.6), p.z); _q.copy(face || _q.identity()); // kept clear of the ground so it never cuts a puff off hard _q.multiply(_qz.setFromAxisAngle(_z, p.rot * 0.3));
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
