import { fmtMoney, ordinal } from '../core/math.js';

export function showResults(result, outcome, params, bank, { onAgain, onMenu }) {
  const $ = (id) => document.getElementById(id);
  const el = $('results'); el.classList.remove('hidden');
  const won = outcome.prize > 0;
  $('resTitle').textContent = params.mode === 'soccer' ? (won ? 'VICTORY' : 'DEFEAT') : 'FINAL STANDINGS';
  $('resPlace').textContent = params.mode === 'soccer' ? (won ? 'WIN' : 'LOSS') : ordinal(result.place);
  const prize = $('resPrize'); prize.textContent = won ? `+${fmtMoney(outcome.prize)}` : `-${fmtMoney(outcome.pot / params.players)}`; prize.className = 'res-prize' + (won ? '' : ' lost');
  $('resBoard').innerHTML = result.ranking.map((r) => `<div class="row${r.truck.isPlayer ? ' you' : ''}"><span>${r.place}</span><span>${r.truck.isPlayer ? 'YOU · ' : ''}${r.truck.name}</span><span>${r.score ?? ''}</span></div>`).join('');
  $('resBank').textContent = fmtMoney(bank);
  const again = $('againBtn'), menu = $('menuBtn');
  const a2 = again.cloneNode(true), m2 = menu.cloneNode(true); again.replaceWith(a2); menu.replaceWith(m2);
  a2.addEventListener('click', () => { el.classList.add('hidden'); onAgain(); });
  m2.addEventListener('click', () => { el.classList.add('hidden'); onMenu(); });
}
