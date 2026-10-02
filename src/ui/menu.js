// Main menu: the hero truck parked in a real procedurally generated neighbourhood, slow orbit camera, UI overlaid.
import * as THREE from 'three';
import { TRUCKS } from '../data/trucks.js';
import { MODES, BETS, NEIGHBOURHOODS, WEATHERS } from '../data/modes.js';
import { buildTruckMesh } from '../vehicles/truck.js';
import { buildCity } from '../world/city.js';
import { makeMenuPlan } from '../world/layouts.js';
import { RNG } from '../core/rng.js';
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
    this.buildScene();
    // DOM
    const $ = (id) => document.getElementById(id);
    mountIcons(this.el);
    $('prevTruck').addEventListener('click', () => { this.setTruck(this.truckIdx - 1); this.audio.tick(); });
    $('nextTruck').addEventListener('click', () => { this.setTruck(this.truckIdx + 1); this.audio.tick(); });
    window.addEventListener('keydown', (e) => { if (this.el.classList.contains('hidden')) return; if (e.code === 'ArrowLeft') this.setTruck(this.truckIdx - 1); if (e.code === 'ArrowRight') this.setTruck(this.truckIdx + 1); if (e.code === 'Enter') this.play(); });
    for (const b of document.querySelectorAll('#modes .mode')) b.addEventListener('click', () => { this.modeId = b.dataset.mode; localStorage.setItem('ms.mode', this.modeId); this.refresh(); this.audio.tick(); });
    const bets = $('bets'); bets.innerHTML = '';
    for (const v of BETS) { const b = document.createElement('button'); b.innerHTML = `<span>$${v}</span>`; b.dataset.bet = v; b.addEventListener('click', () => { this.bet = v; localStorage.setItem('ms.bet', v); this.refresh(); this.audio.tick(); }); bets.appendChild(b); }
    $('playBtn').addEventListener('click', () => this.play());
    this.setTruck(this.truckIdx);
  }

  buildScene() {
    const rng = new RNG();
    const nb = rng.pick(NEIGHBOURHOODS);
    const weather = rng.pick(WEATHERS.filter((w) => !w.night && !w.rain && w.name !== 'Foggy'));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(weather.sky);
    this.scene.fog = new THREE.Fog(weather.fog, 90, 320);
    this.scene.add(new THREE.HemisphereLight(weather.hemi[0], weather.hemi[1], weather.ambient * 2.0));
    this.scene.add(new THREE.AmbientLight(0xffffff, weather.ambient * 0.5));
    const sun = new THREE.DirectionalLight(weather.sunColor, weather.sun); sun.position.set(40, 70, 30); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
    const sc = sun.shadow.camera; sc.left = sc.bottom = -45; sc.right = sc.top = 45; sc.near = 10; sc.far = 250; this.scene.add(sun);
    const plan = makeMenuPlan(rng);
    this.city = buildCity(this.scene, plan, nb, weather, rng);
    // a couple of parked neighbours along the kerb
    const others = rng.shuffle(TRUCKS).slice(0, 3);
    for (const [k, def] of others.entries()) {
      const m = buildTruckMesh(def);
      const spots = [[4.5, -22, 0], [-4.5, 24, Math.PI], [26, 4.5, Math.PI / 2]];
      m.position.set(spots[k][0], 0, spots[k][1]); m.rotation.y = spots[k][2];
      this.scene.add(m);
    }
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 600);
    this.orbit = 0.8; this.truckMesh = null;
    this.updateCamera();
  }
  updateCamera() {
    const r = 28, h = 10.5;
    this.camera.position.set(Math.sin(this.orbit) * r, h, Math.cos(this.orbit) * r);
    this.camera.lookAt(0, 2.4, 0);
  }
  get truck() { return TRUCKS[this.truckIdx]; }
  setTruck(i) {
    this.truckIdx = ((i % TRUCKS.length) + TRUCKS.length) % TRUCKS.length; localStorage.setItem('ms.truck', this.truckIdx);
    if (this.truckMesh) this.scene.remove(this.truckMesh);
    this.truckMesh = buildTruckMesh(this.truck); this.truckMesh.rotation.y = 0.55;
    this.scene.add(this.truckMesh); this.refresh();
    this.popT = 0.35;
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
  resize(w, h) { this.camera.aspect = w / h; this.camera.fov = h < 480 ? 34 : 30; this.camera.updateProjectionMatrix(); }
  update(dt) {
    this.orbit += dt * 0.11; this.updateCamera();
    if (this.truckMesh) {
      if (this.popT > 0) { this.popT -= dt; const s = 1 + Math.sin(Math.min(1, 1 - this.popT / 0.35) * Math.PI) * 0.12; this.truckMesh.scale.setScalar(s); } else this.truckMesh.scale.setScalar(1);
    }
    this.city.props.update(dt);
  }
  render() { this.renderer.render(this.scene, this.camera); }
}
