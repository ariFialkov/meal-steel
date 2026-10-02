// Main menu: isometric turntable of the selected truck + mode & bet selection.
import * as THREE from 'three';
import { TRUCKS } from '../data/trucks.js';
import { MODES, BETS } from '../data/modes.js';
import { buildTruckMesh } from '../vehicles/truck.js';
import { fmtMoney } from '../core/math.js';

export class Menu {
  constructor(renderer, audio, { onPlay }) {
    this.renderer = renderer; this.audio = audio; this.onPlay = onPlay;
    this.el = document.getElementById('menu');
    this.truckIdx = parseInt(localStorage.getItem('ms.truck') || '0', 10) % TRUCKS.length;
    this.modeId = localStorage.getItem('ms.mode') || 'race';
    this.bet = parseInt(localStorage.getItem('ms.bet') || '10', 10);
    this.bank = 0;
    // scene
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x2a1f4d);
    this.scene.fog = new THREE.Fog(0x2a1f4d, 30, 80);
    const aspect = 1; const d = 9;
    this.camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 0.1, 200);
    this.camera.position.set(20, 16.3, 20); this.camera.lookAt(0, 1.5, 0);
    this.scene.add(new THREE.HemisphereLight(0xffe9c9, 0x3a2a66, 0.9));
    const sun = new THREE.DirectionalLight(0xfff2d0, 1.3); sun.position.set(12, 20, 8); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.4;
    const sc = sun.shadow.camera; sc.left = sc.bottom = -12; sc.right = sc.top = 12; this.scene.add(sun);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.5, 0.6, 40), new THREE.MeshLambertMaterial({ color: 0x3a2a66 })); disc.position.y = -0.3; disc.receiveShadow = true; this.scene.add(disc);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 7.6, 0.25, 40), new THREE.MeshLambertMaterial({ color: 0xff6a2a })); stripe.position.y = -0.6; this.scene.add(stripe);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: 0x241a44 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.7; floor.receiveShadow = true; this.scene.add(floor);
    // some backdrop blocks
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, r = 22 + (i % 3) * 6, h = 4 + (i * 7) % 11; const b = new THREE.Mesh(new THREE.BoxGeometry(5, h, 5), new THREE.MeshLambertMaterial({ color: [0x3a2a66, 0x4a3a7a, 0x2f2458][i % 3] })); b.position.set(Math.cos(a) * r, h / 2 - 0.7, Math.sin(a) * r); this.scene.add(b); }
    this.truckMesh = null; this.spin = 0;
    // DOM
    const $ = (id) => document.getElementById(id);
    $('prevTruck').addEventListener('click', () => { this.setTruck(this.truckIdx - 1); this.audio.tick(); });
    $('nextTruck').addEventListener('click', () => { this.setTruck(this.truckIdx + 1); this.audio.tick(); });
    window.addEventListener('keydown', (e) => { if (this.el.classList.contains('hidden')) return; if (e.code === 'ArrowLeft') this.setTruck(this.truckIdx - 1); if (e.code === 'ArrowRight') this.setTruck(this.truckIdx + 1); if (e.code === 'Enter') this.play(); });
    for (const b of document.querySelectorAll('#modes .mode')) b.addEventListener('click', () => { this.modeId = b.dataset.mode; localStorage.setItem('ms.mode', this.modeId); this.refresh(); this.audio.tick(); });
    const bets = $('bets'); bets.innerHTML = '';
    for (const v of BETS) { const b = document.createElement('button'); b.textContent = '$' + v; b.dataset.bet = v; b.addEventListener('click', () => { this.bet = v; localStorage.setItem('ms.bet', v); this.refresh(); this.audio.tick(); }); bets.appendChild(b); }
    $('playBtn').addEventListener('click', () => this.play());
    this.setTruck(this.truckIdx);
  }
  get truck() { return TRUCKS[this.truckIdx]; }
  setTruck(i) {
    this.truckIdx = ((i % TRUCKS.length) + TRUCKS.length) % TRUCKS.length; localStorage.setItem('ms.truck', this.truckIdx);
    if (this.truckMesh) this.scene.remove(this.truckMesh);
    this.truckMesh = buildTruckMesh(this.truck);
    this.scene.add(this.truckMesh); this.refresh();
  }
  setBank(v) { this.bank = v; this.refresh(); }
  refresh() {
    const t = this.truck, $ = (id) => document.getElementById(id);
    $('truckName').textContent = t.name; $('truckFood').textContent = t.food;
    $('truckStats').innerHTML = ['speed', 'accel', 'handling', 'weight'].map((k) => `<div class="stat">${k.toUpperCase()}<div class="pips">${[1, 2, 3, 4, 5].map((n) => `<i class="${n <= t.stats[k] ? 'on' : ''}"></i>`).join('')}</div></div>`).join('');
    $('specialName').textContent = `${t.special.icon} ${t.special.name}`; $('specialDesc').textContent = t.special.desc;
    for (const b of document.querySelectorAll('#modes .mode')) b.classList.toggle('selected', b.dataset.mode === this.modeId);
    for (const b of document.querySelectorAll('#bets button')) { const v = parseInt(b.dataset.bet, 10); b.classList.toggle('selected', v === this.bet); b.disabled = v > this.bank; }
    if (this.bet > this.bank) { const ok = BETS.filter((v) => v <= this.bank); if (ok.length) this.bet = ok[ok.length - 1]; }
    $('bankValue').textContent = this.bank.toLocaleString('en-US');
    const play = $('playBtn');
    play.disabled = this.bank < BETS[0];
    play.textContent = this.bank < BETS[0] ? 'BROKE' : `PLAY ${MODES[this.modeId].name.toUpperCase()} · ${fmtMoney(this.bet)}`;
  }
  play() { if (this.bank < this.bet) return; this.audio.lock(); this.onPlay(this.truck, this.modeId, this.bet); }
  show() { this.el.classList.remove('hidden'); this.refresh(); }
  hide() { this.el.classList.add('hidden'); }
  resize(w, h) { const d = Math.max(9, 9 * (h / w) * 1.2); const a = w / h; this.camera.left = -d * a; this.camera.right = d * a; this.camera.top = d; this.camera.bottom = -d; this.camera.updateProjectionMatrix(); }
  update(dt) { this.spin += dt * 0.5; if (this.truckMesh) { this.truckMesh.rotation.y = this.spin; this.truckMesh.position.y = Math.sin(this.spin * 2) * 0.05; } }
  render() { this.renderer.render(this.scene, this.camera); }
}
