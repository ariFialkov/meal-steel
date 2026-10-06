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
import { loadTruckModel, loadTruckModels, onTruckModelLoaded, truckModelIds } from '../vehicles/models.js';
import { createTruckFx } from '../vehicles/truckfx.js';

export class Menu {
  constructor(renderer, audio, { onPlay, envMap }) {
    this.envMap = envMap;
    this.renderer = renderer; this.audio = audio; this.onPlay = onPlay;
    this.el = document.getElementById('menu');
    this.truckIdx = Math.max(0, TRUCKS.findIndex((t) => t.id === localStorage.getItem('ms.truckId')));
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
    // models: selected truck first, then everything else in the background; rebuild meshes as they arrive
    onTruckModelLoaded((id) => {
      if (id === this.truck.id) this.setTruck(this.truckIdx, false);
      for (const n of this.neighbours) if (n.def.id === id) this.placeNeighbour(n);
    });
    loadTruckModel(this.truck.id).then(() => loadTruckModels(truckModelIds()));
  }

  buildScene() {
    const rng = new RNG();
    const nb = rng.pick(NEIGHBOURHOODS);
    const weather = rng.pick(WEATHERS.filter((w) => !w.night && !w.rain && w.name !== 'Foggy'));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(weather.sky);
    this.scene.fog = new THREE.Fog(weather.fog, 90, 320);
    if (this.envMap) { this.scene.environment = this.envMap; this.scene.environmentIntensity = 0.6; }
    this.scene.add(new THREE.HemisphereLight(weather.hemi[0], weather.hemi[1], weather.ambient * 2.0));
    this.scene.add(new THREE.AmbientLight(0xffffff, weather.ambient * 0.5));
    const sun = new THREE.DirectionalLight(weather.sunColor, weather.sun); sun.position.set(40, 70, 30); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
    const sc = sun.shadow.camera; sc.left = sc.bottom = -45; sc.right = sc.top = 45; sc.near = 10; sc.far = 250; this.scene.add(sun);
    const plan = makeMenuPlan(rng);
    this.city = buildCity(this.scene, plan, nb, weather, rng);
    // a couple of parked neighbours along the kerb
    const spots = [[4.5, -22, 0], [-4.5, 24, Math.PI], [26, 4.5, Math.PI / 2]];
    this.neighbours = rng.shuffle(TRUCKS).slice(0, 3).map((def, k) => ({ def, spot: spots[k], mesh: null }));
    for (const n of this.neighbours) this.placeNeighbour(n);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 600);
    this.orbit = 0.8; this.truckMesh = null;
    this.updateCamera();
  }
  /** Low hero shot: close to the truck, camera near the ground looking up at it, slow orbit. */
  updateCamera() {
    const r = this.camR || 11.5, h = 1.15 + Math.sin(this.orbit * 0.7) * 0.15;
    this.camera.position.set(Math.sin(this.orbit) * r, h, Math.cos(this.orbit) * r);
    this.camera.lookAt(0, 2.25, 0);
  }
  placeNeighbour(n) {
    if (n.mesh) this.scene.remove(n.mesh);
    n.mesh = buildTruckMesh(n.def); n.mesh.position.set(n.spot[0], 0, n.spot[1]); n.mesh.rotation.y = n.spot[2];
    this.scene.add(n.mesh);
  }
  get truck() { return TRUCKS[this.truckIdx]; }
  setTruck(i, pop = true) {
    this.truckIdx = ((i % TRUCKS.length) + TRUCKS.length) % TRUCKS.length; localStorage.setItem('ms.truckId', this.truck.id);
    if (this.truckMesh) this.scene.remove(this.truckMesh);
    this.truckMesh = buildTruckMesh(this.truck); this.truckMesh.rotation.y = 0.55;
    this.truckFx = createTruckFx(null, this.truckMesh, this.truck.id); // idle animations (fries jiggle, jaw snaps, bar regulars)
    this.scene.add(this.truckMesh); this.refresh();
    if (pop) this.popT = 0.35;
    loadTruckModel(this.truck.id);
  }
  setBank(v) { this.bank = v; this.refresh(); }
  refresh() {
    const t = this.truck, $ = (id) => document.getElementById(id);
    $('truckName').textContent = t.name; $('truckFood').textContent = t.food;
    $('truckStats').innerHTML = ['speed', 'accel', 'handling', 'weight'].map((k) => `<div class="stat">${k.toUpperCase()}<div class="pips">${[1, 2, 3, 4, 5].map((n) => `<i class="${n <= t.stats[k] ? 'on' : ''}"></i>`).join('')}</div></div>`).join('');
    $('specialIconMenu').innerHTML = icon(t.light.icon); $('specialName').textContent = t.light.name; $('specialDesc').textContent = t.light.desc;
    $('heavyIconMenu').innerHTML = icon(t.heavy.icon); $('heavyName').textContent = t.heavy.name; $('heavyDesc').textContent = t.heavy.desc;
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
  resize(w, h) {
    const a = w / h, cam = this.camera;
    cam.aspect = a; cam.fov = h < 480 ? 36 : 32;
    // pull back a little on narrow screens so the whole truck still fits
    this.camR = a < 1.2 ? 17 : a < 1.5 ? 13.5 : h < 480 ? 9.6 : 11.5;
    // lens shift: the truck sits a little above centre (clear of the bottom UI) without tilting the camera down
    cam.setViewOffset(w, h, 0, h * (h < 480 ? 0.2 : 0.09), w, h);
    cam.updateProjectionMatrix(); this.updateCamera();
  }
  update(dt) {
    this.orbit += dt * 0.09; this.updateCamera();
    this.menuT = (this.menuT || 0) + dt; this.truckFx?.update(dt, this.menuT, null, false);
    if (this.truckMesh) {
      if (this.popT > 0) { this.popT -= dt; const s = 1 + Math.sin(Math.min(1, 1 - this.popT / 0.35) * Math.PI) * 0.12; this.truckMesh.scale.setScalar(s); } else this.truckMesh.scale.setScalar(1);
    }
    this.city.props.update(dt);
  }
  render() { this.city.props.cull(this.camera); this.renderer.render(this.scene, this.camera); }
}
