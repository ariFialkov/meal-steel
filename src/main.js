// Meal Steel entry point: renderer, screens, bank, state machine.
import * as THREE from 'three';
import { RNG } from './core/rng.js';
import { Input } from './core/input.js';
import { AudioSys } from './core/audio.js';
import { rollGameParams, rollOutcome } from './data/modes.js';
import { Menu } from './ui/menu.js';
import { Hud } from './ui/hud.js';
import { runPregame } from './ui/pregame.js';
import { showResults } from './ui/results.js';
import { Game } from './game.js';

const canvas = document.getElementById('gl');
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance', alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;

const input = new Input();
const audio = new AudioSys();
const BANK_KEY = 'ms.bank';
let bank = parseInt(localStorage.getItem(BANK_KEY) || '1000', 10);
if (!Number.isFinite(bank)) bank = 1000;
const saveBank = () => localStorage.setItem(BANK_KEY, String(bank));

let state = 'menu';
let game = null;
let last = { def: null, modeId: null, bet: null };
const pregameSignal = { cancel: null };

const hud = new Hud(input, () => quitGame());
const menu = new Menu(renderer, audio, { onPlay: (def, modeId, bet) => startMatch(def, modeId, bet) });
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
  state = 'pregame';
  if (game) { game.dispose(); game = null; }
  const ok = await runPregame(params, outcome, bet, audio, def, pregameSignal);
  if (!ok || state !== 'pregame') return;
  state = 'game';
  game = new Game({
    renderer, input, audio, hud, params, outcome, playerDef: def,
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
    onMenu: () => { if (game) { game.dispose(); game = null; } state = 'menu'; menu.show(); },
  });
}

function quitGame() {
  if (state !== 'game') return;
  // quitting forfeits the entry bet
  if (game) { game.dispose(); game = null; }
  input.enabled = false; state = 'menu'; menu.show();
}

// a broke player gets a free refill so the game stays playable
function checkRefill() { if (bank < 5) { bank = 250; saveBank(); menu.setBank(bank); } }
checkRefill();
document.getElementById('menuBtn').addEventListener('click', checkRefill);

let prev = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - prev) / 1000); prev = now;
  if (state === 'menu' || state === 'pregame') { menu.update(dt); menu.render(); }
  else if (game) { game.update(dt); game.render(); }
}
requestAnimationFrame(frame);

// debug / automation hook (harmless in production)
window.__ms = { get game() { return game; }, get state() { return state; }, startMatch, get bank() { return bank; }, menu, input };
