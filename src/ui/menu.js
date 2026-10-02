// Main menu: isometric turntable of the selected truck + mode & bet selection.
import * as THREE from 'three';
import { TRUCKS } from '../data/trucks.js';
import { MODES, BETS } from '../data/modes.js';
import { buildTruckMesh } from '../vehicles/truck.js';
import { fmtMoney } from '../core/math.js';
import { icon, mountIcons } from './icons.js';

export class Menu {
  constructor(renderer, audio, { onPlay }) {
    this.renderer = renderer; this.audio = audio; this.onPlay = onPlay;
    this.el = document.getElementById('menu');
    this.truckIdx = parseInt(localStorage.getItem('ms.truck') || '0', 10) % TRUCKS.length;
    this.modeId = localStorage.getItem('ms.mode') || 'race';
    this.bet = parseInt(localStorage.getItem('ms.bet') || '10', 10);
    this.bank = 0;
    // scene: just the truck on an invisible shadow-catcher, over the page's sky gradient
    this.scene = new THREE.Scene(); this.scene.background = null;
    const d = 5.6;
    this.camera = new THREE.OrthographicCamera(-d, d, d, -d, 0.1, 200);
    this.camera.position.set(24, 19.6, 24); this.camera.lookAt(0, 2.4, 0);
    this.scene.add(new THREE.HemisphereLight(0xdff3ff, 0x6a8fb5, 1.1));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const sun = new THREE.DirectionalLight(0xfff4dc, 1.6); sun.position.set(10, 22, 6); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.4;
    const sc = sun.shadow.camera; sc.left = sc.bottom = -10; sc.right = sc.top = 10; this.scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 48), new THREE.ShadowMaterial({ opacity: 0.22 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);
    this.truckMesh = null; this.spin = 0.6;
    // DOM
    const $ = (id) => document.getElementById(id);
    mountIcons(this.el);
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
    $('specialIconMenu').innerHTML = icon(t.special.icon); $('specialName').textContent = t.special.name; $('specialDesc').textContent = t.special.desc;
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
  resize(w, h) { const d = h < 480 ? 6.4 : 6.0; const a = w / h; this.camera.left = -d * a; this.camera.right = d * a; this.camera.top = d; this.camera.bottom = -d; this.camera.updateProjectionMatrix(); }
  update(dt) { this.spin += dt * 0.35; if (this.truckMesh) { this.truckMesh.rotation.y = this.spin; this.truckMesh.position.y = Math.sin(this.spin * 2) * 0.04; } }
  render() { this.renderer.render(this.scene, this.camera); }
}
