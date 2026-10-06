// Meal Steel entry point: renderer, screens, bank, state machine.
import '@fontsource/luckiest-guy';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/700.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RNG } from './core/rng.js';
import { Input } from './core/input.js';
import { AudioSys, installAudioDebug } from './core/audio.js';
import { rollGameParams, rollOutcome, pickLineup } from './data/modes.js';
import { loadTruckModels } from './vehicles/models.js';
import { Menu } from './ui/menu.js';
import { Hud } from './ui/hud.js';
import { runPregame } from './ui/pregame.js';
import { showResults } from './ui/results.js';
import { Game } from './game.js';
import { TRUCKS } from './data/trucks.js';

const canvas = document.getElementById('gl');
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance', alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;

const envMap = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const input = new Input();
const audio = new AudioSys();
installAudioDebug(audio); // ` key (or ?audiodebug): latency diagnostics
const BANK_KEY = 'ms.bank';
let bank = parseInt(localStorage.getItem(BANK_KEY) || '1000', 10);
if (!Number.isFinite(bank)) bank = 1000;
const saveBank = () => localStorage.setItem(BANK_KEY, String(bank));

let state = 'menu';
let game = null;
let last = { def: null, modeId: null, bet: null };
const pregameSignal = { cancel: null };

const fadeEl = document.getElementById('fade');
function flash(ms = 700) { fadeEl.style.transition = 'none'; fadeEl.style.opacity = '1'; requestAnimationFrame(() => requestAnimationFrame(() => { fadeEl.style.transition = `opacity ${ms}ms ease`; fadeEl.style.opacity = '0'; })); }
const hud = new Hud(input, () => quitGame());
const menu = new Menu(renderer, audio, { onPlay: (def, modeId, bet) => startMatch(def, modeId, bet), envMap });
menu.setBank(bank);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  menu.resize(w, h);
  document.getElementById('rotate').classList.toggle('hidden', !(isTouch && h > w * 1.15));
}
window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 200)); resize();

async function startMatch(def, modeId, bet) {
  if (state !== 'menu' && state !== 'results') return;
  if (bank < bet) return;
  last = { def, modeId, bet };
  bank -= bet; saveBank(); menu.setBank(bank);
  menu.hide();
  const rng = new RNG();
  const params = rollGameParams(modeId, rng);
  const outcome = rollOutcome(params, bet, rng);
  params.lineup = pickLineup(params, def.id);
  const modelsReady = loadTruckModels([def.id, ...params.lineup]);
  state = 'pregame';
  if (game) { game.dispose(); game = null; }
  const ok = await runPregame(params, outcome, bet, audio, def, pregameSignal, modelsReady);
  if (!ok || state !== 'pregame') return;
  state = 'game';
  flash(800);
  game = new Game({
    renderer, input, audio, hud, params, outcome, playerDef: def, envMap,
    onFinish: (result) => finishMatch(result, params, outcome),
  });
}

function finishMatch(result, params, outcome) {
  state = 'results';
  input.enabled = false;
  bank += outcome.prize; saveBank(); menu.setBank(bank);
  audio.stopEngine(); audio.stopMusic();
  hud.hide();
  showResults(result, outcome, params, bank, {
    onAgain: () => { if (game) { game.dispose(); game = null; } startMatch(last.def, last.modeId, Math.min(last.bet, bank) >= 5 ? last.bet <= bank ? last.bet : 5 : 5); },
    onMenu: () => { if (game) { game.dispose(); game = null; } state = 'menu'; menu.show(); flash(600); },
  });
}

function quitGame() {
  if (state !== 'game') return;
  // quitting forfeits the entry bet
  if (game) { game.dispose(); game = null; }
  input.enabled = false; state = 'menu'; menu.show(); flash(600);
}

// a broke player gets a free refill so the game stays playable
function checkRefill() { if (bank < 5) { bank = 250; saveBank(); menu.setBank(bank); } }
checkRefill();
document.getElementById('menuBtn').addEventListener('click', checkRefill);

let prev = performance.now();
// Adaptive quality: if frames run slow for a couple of seconds, lower the render resolution step by step,
// then drop shadows as a last resort. Never raises quality again within a session (avoids oscillating).
const MAX_PR = renderer.getPixelRatio(), MIN_PR = Math.min(MAX_PR, 0.65);
const quality = { win: 0, frames: 0, slow: 0, level: 0 };
function adaptQuality(dtMs) {
  if (document.hidden) return;
  quality.win += dtMs; quality.frames++;
  if (quality.win < 2000) return;
  const avg = quality.win / quality.frames; quality.win = 0; quality.frames = 0;
  quality.slow = avg > 30 ? quality.slow + 1 : 0;   // below ~33 fps for two windows in a row
  if (quality.slow < 2) return;
  quality.slow = 0;
  const pr = renderer.getPixelRatio();
  if (pr > MIN_PR + 0.01) { renderer.setPixelRatio(Math.max(MIN_PR, pr * 0.8)); resize(); quality.level++; }
  else if (renderer.shadowMap.enabled) {
    renderer.shadowMap.enabled = false; quality.level++;
    const scenes = [menu.scene, game?.scene].filter(Boolean);
    for (const sc of scenes) sc.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const raw = now - prev, dt = Math.min(0.1, raw / 1000); prev = now;
  if (state === 'menu' || state === 'game') adaptQuality(Math.min(raw, 1000));
  if (state === 'menu' || state === 'pregame') { menu.update(dt); menu.render(); }
  else if (game) { game.update(dt); game.render(); }
}
requestAnimationFrame(frame);

// debug / automation hook (harmless in production)
window.__ms = { quality, get game() { return game; }, get state() { return state; }, startMatch, get bank() { return bank; }, menu, input };
window.__TRUCKS = TRUCKS;
