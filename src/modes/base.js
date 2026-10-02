// Shared mode plumbing: ranking helpers, minimap mapping, truck placement.
import { BotDriver } from '../ai/bot.js';
export class Mode {
  constructor(game) {
    this.game = game; this.rng = game.rng.fork(); this.finished = false; this.result = null; this.elapsed = 0;
    this.endTimer = -1;
  }
  get trucks() { return this.game.trucks; }
  get player() { return this.game.player; }
  get bots() { return this.game.bots; }
  setup() {}
  update(dt, t) { this.elapsed += dt; }
  onTruckHit(a, b, info) {}
  onSpecialHit(att, victim, kind, strength) {}
  onPropHit(truck, prop, how, strength) {}
  hud() {}
  drawMinimap(ctx, size) {}
  /** mapping helper: returns fn(x,z) => [px,py] for a square bounds */
  mapper(cx, cz, half, size) { const k = size / (2 * half); return (x, z) => [size / 2 + (x - cx) * k, size / 2 + (z - cz) * k]; }
  dot(ctx, px, py, color, r = 4, outline = false) {
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    if (outline) { ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); }
  }
  /** Lazily created driver for autopilot/demo mode. */
  playerDriver() { if (!this._pd) { this._pd = new BotDriver(this.player, this.rng); } return this._pd; }
  colorOf(tr) { return '#' + tr.def.body.toString(16).padStart(6, '0'); }
  /** Finish the mode: result = { place, ranking:[{truck, place, score}] } */
  finish(place, ranking, delay = 3) {
    if (this.finished) return;
    this.finished = true; this.result = { place, ranking };
    this.endTimer = delay;
  }
}
