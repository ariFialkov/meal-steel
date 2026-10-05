// One InstancedMesh of small boxes handles confetti, sparks, smoke puffs, coins pickups, splashes.
import * as THREE from 'three';

const MAX = 900;
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();

export class Particles {
  constructor(scene) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: false }), MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.frustumCulled = false; this.mesh.castShadow = false;
    this.mesh.count = 0; // nothing alive yet (otherwise every instance draws at the origin until the first update)
    scene.add(this.mesh);
    this.ps = []; for (let i = 0; i < MAX; i++) this.ps.push({ alive: false });
    this.cursor = 0;
  }
  emit(n, fn) {
    for (let k = 0; k < n; k++) {
      const p = this.ps[this.cursor]; this.cursor = (this.cursor + 1) % MAX;
      p.alive = true; p.age = 0; p.life = 1; p.x = 0; p.y = 0; p.z = 0; p.vx = 0; p.vy = 0; p.vz = 0; p.size = 0.3; p.grow = 0; p.g = 20; p.drag = 0; p.rot = Math.random() * 6; p.spin = 0; p.color = 0xffffff; p.flat = false;
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
  update(dt) {
    let count = 0;
    for (let i = 0; i < MAX; i++) {
      const p = this.ps[i];
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) { p.alive = false; continue; }
      p.vy -= p.g * dt;
      if (p.drag) { const d = Math.exp(-p.drag * dt); p.vx *= d; p.vz *= d; p.vy *= d; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05 && p.g > 0) { p.y = 0.05; p.vy *= -0.3; p.vx *= 0.7; p.vz *= 0.7; }
      p.rot += p.spin * dt;
      const t = p.age / p.life, fade = t > 0.7 ? (1 - t) / 0.3 : 1;
      const s = (p.size + p.grow * p.age) * fade;
      _p.set(p.x, p.y, p.z); _e.set(p.rot, p.rot * 0.7, p.rot * 0.3); _q.setFromEuler(_e);
      _s.set(s, p.flat ? s * 0.15 : s, s);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(count, _m);
      _c.set(p.color); this.mesh.setColorAt(count, _c);
      count++;
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
