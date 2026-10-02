// In-game HUD: leaderboard, timer, minimap, gauges, announcements, touch controls.
import { icon, mountIcons } from './icons.js';
export class Hud {
  constructor(input, onQuit) {
    const $ = (id) => document.getElementById(id);
    this.el = $('hud'); this.board = $('board'); this.timer = $('timer'); this.sub = $('subInfo');
    this.minimap = $('minimap'); this.ctx = this.minimap.getContext('2d');
    this.turboBar = $('turboBar'); this.specialBar = $('specialBar'); this.speed = $('speed'); this.specialLabel = $('specialLabel'); this.specialIcon = $('specialIcon');
    this.announceEl = $('announce'); this.toasts = $('toasts');
    this.btnTurbo = $('btnTurbo'); this.btnSpecial = $('btnSpecial');
    mountIcons(this.el);
    input.bindTouch($('joystick'), $('stick'), this.btnTurbo, this.btnSpecial, $('btnBrake'));
    $('quitBtn').addEventListener('click', () => onQuit());
    this.boardT = 0; this.mapT = 0; this.announceTimer = null;
    const dpr = Math.min(2, window.devicePixelRatio || 1); this.minimap.width = 200 * dpr; this.minimap.height = 200 * dpr; this.ctx.scale(dpr, dpr);
  }
  show(game) {
    this.el.classList.remove('hidden'); this.toasts.innerHTML = ''; this.announceEl.className = 'announce';
    this.specialLabel.textContent = game.player.def.special.name.toUpperCase(); this.specialIcon.innerHTML = icon(game.player.def.special.icon);
    this.boardT = 1; this.mapT = 1;
  }
  hide() { this.el.classList.add('hidden'); this.announceEl.className = 'announce'; }
  announce(text, hold = false) {
    const el = this.announceEl;
    el.textContent = text; el.className = 'announce';
    void el.offsetWidth; // restart animation
    el.classList.add(hold ? 'hold' : 'show');
    if (!hold) { clearTimeout(this.announceTimer); this.announceTimer = setTimeout(() => { if (el.textContent === text) el.className = 'announce'; }, 1000); }
  }
  toast(text, cls = '') {
    if (!text) return;
    const d = document.createElement('div'); d.className = 'toast ' + cls; d.textContent = text;
    this.toasts.appendChild(d);
    while (this.toasts.children.length > 4) this.toasts.removeChild(this.toasts.firstChild);
    setTimeout(() => d.remove(), 1500);
  }
  update(game, dt) {
    const p = game.player;
    this.turboBar.style.width = (p.turboTime > 0 ? 100 : (1 - p.turboCd / p.turboCdMax) * 100) + '%';
    this.turboBar.style.background = p.turboCd <= 0 ? 'var(--orange2)' : 'rgba(255,176,42,0.45)';
    this.specialBar.style.width = (1 - p.spCd / p.spCdMax) * 100 + '%';
    this.specialBar.style.background = p.spCd <= 0 ? 'var(--blue)' : 'rgba(58,169,255,0.45)';
    this.btnTurbo.classList.toggle('cooling', p.turboCd > 0); this.btnSpecial.classList.toggle('cooling', p.spCd > 0);
    this.speed.textContent = Math.round(p.speed * 3.6);
    this.boardT += dt; this.mapT += dt;
    if (this.boardT > 0.2) { this.boardT = 0; const h = game.mode.hud(); if (h) { this.renderBoard(h.rows); this.timer.innerHTML = h.timer ?? ''; this.sub.textContent = h.sub ?? ''; } }
    if (this.mapT > 0.08) { this.mapT = 0; this.ctx.clearRect(0, 0, 200, 200); game.mode.drawMinimap(this.ctx, 200); }
  }
  renderBoard(rows) {
    let html = '';
    for (const r of rows) {
      if (r.header) { html += `<div class="team-hdr">${r.header}</div>`; continue; }
      html += `<div class="row${r.you ? ' you' : ''}${r.out ? ' out' : ''}"><span class="pos">${r.pos ?? ''}</span><span class="dot" style="background:${r.color}"></span><span class="nm">${r.you ? 'YOU · ' : ''}${r.name}</span><span class="sc">${r.score ?? ''}</span></div>`;
    }
    this.board.innerHTML = html;
  }
}
