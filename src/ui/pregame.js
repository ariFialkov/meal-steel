// Slot-style pre-game roller: lobby fills with "players", reels spin and lock one by one.
import { TRUCKS } from '../data/trucks.js';
import { MODES, NEIGHBOURHOODS, WEATHERS } from '../data/modes.js';
import { fmtMoney } from '../core/math.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const payoutStr = (w) => w.map((v) => Math.round(v * 100)).join(' / ') + '%';

export async function runPregame(params, outcome, bet, audio, playerDef, signal) {
  const el = document.getElementById('pregame'), lobby = document.getElementById('lobby'), roller = document.getElementById('roller'), foot = document.getElementById('rollerFoot');
  el.classList.remove('hidden'); lobby.innerHTML = ''; roller.innerHTML = ''; foot.textContent = 'FILLING LOBBY…';
  const mode = MODES[params.mode];
  const colors = TRUCKS.filter((t) => t.id !== playerDef.id).map((t) => '#' + t.body.toString(16).padStart(6, '0'));
  const slots = [];
  for (let i = 0; i < params.players; i++) { const s = document.createElement('div'); s.className = 'slot'; lobby.appendChild(s); slots.push(s); }
  slots[0].classList.add('filled', 'you'); slots[0].style.background = '#' + playerDef.body.toString(16).padStart(6, '0');
  // reels
  const reels = [
    { label: 'MODE', pool: Object.values(MODES).map((m) => m.icon + ' ' + m.name), final: mode.icon + ' ' + mode.name },
    { label: 'NEIGHBOURHOOD', pool: NEIGHBOURHOODS.map((n) => n.name), final: params.neighbourhood.name },
    { label: 'WEATHER', pool: WEATHERS.map((w) => w.name), final: params.weather.name },
    { label: 'PLAYERS', pool: ['4', '6', '8', '10', '12', '16'], final: String(params.players) + (mode.teams ? ` (${params.players / 2}v${params.players / 2})` : '') },
  ];
  if (params.time) reels.push({ label: 'TIME', pool: ['30s', '90s', '150s', '180s'], final: params.time + 's' });
  if (params.mode === 'chairs') reels.push({ label: 'ROUNDS', pool: ['4', '5'], final: String(params.rounds) });
  reels.push({ label: 'PAYOUT', pool: mode.winners.map(payoutStr).concat(mode.teams ? ['TEAM 2:1'] : []), final: mode.teams ? 'TEAM 2:1' : payoutStr(params.winners) });
  reels.push({ label: 'POT', pool: [50, 100, 240, 500, 800, 1600].map(fmtMoney), final: fmtMoney(outcome.pot) });
  const reelEls = reels.map((r) => {
    const d = document.createElement('div'); d.className = 'reel'; d.innerHTML = `<label>${r.label}</label><div class="win"><div class="val">${r.pool[0]}</div></div>`;
    roller.appendChild(d); return d;
  });
  const spinning = reels.map(() => true);
  const tick = (i) => { const r = reels[i]; const v = reelEls[i].querySelector('.val'); v.textContent = r.pool[Math.floor(Math.random() * r.pool.length)]; };
  let alive = true; signal.cancel = () => { alive = false; };
  const spinner = setInterval(() => { for (let i = 0; i < reels.length; i++) if (spinning[i]) tick(i); audio.tick(); }, 70);
  // lobby fill
  let filled = 1;
  const fill = async () => { while (filled < slots.length && alive) { await sleep(120 + Math.random() * 260); const s = slots[filled]; s.classList.add('filled'); s.style.background = colors[(filled - 1) % colors.length]; filled++; audio.tick(); } };
  const fillP = fill();
  // lock reels one by one
  for (let i = 0; i < reels.length && alive; i++) {
    await sleep(i === 0 ? 900 : 650);
    spinning[i] = false; reelEls[i].querySelector('.val').textContent = reels[i].final; reelEls[i].classList.add('locked'); audio.lock();
  }
  clearInterval(spinner);
  await fillP;
  if (!alive) { el.classList.add('hidden'); return false; }
  foot.textContent = `LOBBY FULL · ${mode.blurb}`;
  await sleep(1300);
  el.classList.add('hidden');
  return alive;
}
