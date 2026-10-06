// Procedural WebAudio: engine hum, hits, boosts, coins, UI ticks and a chiptune loop for Musical Trucks.
// Every note is scheduled on the audio clock (never chained with setTimeout, which hosts embedding the game in an iframe
// may throttle), noise comes from one buffer made up front, and the context asks for the lowest output latency.
export class AudioSys {
  constructor() {
    this.ctx = null; this.master = null; this.engine = null; this.music = null; this.muted = false;
    this.unlocked = false;
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });
    window.addEventListener('touchstart', unlock, { once: false });
  }
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch { this.ctx = new AC(); }
      const n = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      // come back straight away after the tab or the host's frame was hidden, or another app took the audio device
      document.addEventListener('visibilitychange', () => { if (!document.hidden && this.ctx.state !== 'running') this.ctx.resume(); });
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master);
    }
    if (this.ctx.state !== 'running') this.ctx.resume();
    this.unlocked = true;
  }
  get t() { return this.ctx ? this.ctx.currentTime : 0; }
  _env(gain, t, a, d, peak = 1) {
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  /** a note `at` seconds from now */
  tone(freq, dur = 0.1, type = 'square', vol = 0.2, slide = 0, at = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.t + at, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    this._env(g, t, 0.005, dur, vol);
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }
  noise(dur = 0.2, vol = 0.3, lp = 1200, at = 0) { if (this.ctx && !this.muted) this.noiseAt(this.t + at, dur, vol, lp); }
  hit(strength = 1) { this.noise(0.12 + 0.15 * strength, 0.25 + 0.3 * Math.min(1, strength), 600 + 800 * strength); this.tone(90, 0.12, 'triangle', 0.3, -40); }
  crash() { this.noise(0.5, 0.6, 2500); this.tone(60, 0.4, 'sawtooth', 0.3, -40); }
  boost() { this.noise(0.6, 0.25, 3000); this.tone(200, 0.5, 'sawtooth', 0.12, 600); }
  special() { this.tone(520, 0.08, 'square', 0.15, 300); this.tone(780, 0.15, 'square', 0.15, 200, 0.07); }
  coin() { this.tone(988, 0.06, 'square', 0.15); this.tone(1319, 0.18, 'square', 0.15, 0, 0.06); }
  tick() { this.tone(1200, 0.03, 'square', 0.06); }
  lock() { this.tone(660, 0.08, 'square', 0.15); this.tone(990, 0.2, 'square', 0.15, 0, 0.08); }
  beep(high = false) { this.tone(high ? 880 : 440, high ? 0.5 : 0.15, 'square', 0.2); }
  whistle() { this.tone(2200, 0.35, 'square', 0.15, 200); }
  goal() { [0, 0.09, 0.18, 0.27].forEach((d, i) => this.tone(330 * Math.pow(1.26, i), 0.25, 'sawtooth', 0.18, 0, d)); this.noise(0.8, 0.3, 4000); }
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i === 3 ? 0.6 : 0.16, 'square', 0.18, 0, i * 0.13)); }
  sad() { [392, 349, 311, 262].forEach((f, i) => this.tone(f, i === 3 ? 0.7 : 0.22, 'triangle', 0.18, 0, i * 0.2)); }
  thud() { this.tone(70, 0.2, 'sine', 0.4, -30); this.noise(0.15, 0.3, 400); }
  swoosh() { this.noise(0.3, 0.2, 2000); }
  freeze() { this.tone(1500, 0.3, 'sine', 0.12, -900); }

  startEngine() {
    if (!this.ctx || this.engine) return;
    const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = 60; o2.frequency.value = 30.5;
    f.type = 'lowpass'; f.frequency.value = 400; g.gain.value = 0.0;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(this.master); o.start(); o2.start();
    this.engine = { o, o2, f, g };
  }
  setEngine(speedRatio, turbo) {
    if (!this.engine) return;
    const base = 55 + speedRatio * 140 + (turbo ? 40 : 0);
    this.engine.o.frequency.setTargetAtTime(base, this.t, 0.08);
    this.engine.o2.frequency.setTargetAtTime(base / 2 + 0.7, this.t, 0.08);
    this.engine.f.frequency.setTargetAtTime(300 + speedRatio * 900, this.t, 0.1);
    this.engine.g.gain.setTargetAtTime(this.muted ? 0 : 0.05 + speedRatio * 0.06, this.t, 0.1);
  }
  stopEngine() {
    if (!this.engine) return;
    this.engine.g.gain.setTargetAtTime(0, this.t, 0.1);
    const e = this.engine; setTimeout(() => { try { e.o.stop(); e.o2.stop(); } catch { /* noop */ } }, 400);
    this.engine = null;
  }

  // Chiptune loop for Musical Trucks
  startMusic() {
    if (!this.ctx || this.music) return;
    const bpm = 150, beat = 60 / bpm;
    const bass = [0, 0, 7, 7, 5, 5, 7, 7, 0, 0, 7, 7, 3, 3, 5, 5];
    const lead = [12, 16, 19, 16, 12, 16, 19, 23, 10, 14, 17, 14, 10, 14, 17, 21];
    const g = this.ctx.createGain(); g.gain.value = 0.22; g.connect(this.master);
    // look-ahead scheduling: every tick queues the notes due in the next 0.35 s at their exact beat times, so the beat
    // stays steady even when the host's page delays timers
    const state = { step: 0, timer: null, gain: g, next: this.t + 0.06 };
    const schedule = () => {
      if (state.next < this.t) state.next = this.t + 0.02; // timers stalled for a while: pick up from now
      while (state.next < this.t + 0.35) { this.musicStep(state, g, bass, lead, beat); state.next += beat / 2; }
    };
    schedule();
    state.timer = setInterval(schedule, 60);
    this.music = state;
  }
  musicStep(state, g, bass, lead, beat) {
    const t = state.next;
    const n = state.step % 16;
    const bf = 110 * Math.pow(2, bass[n] / 12), lf = 220 * Math.pow(2, lead[n] / 12);
    const mk = (f, type, dur, vol) => {
      const o = this.ctx.createOscillator(), eg = this.ctx.createGain();
      o.type = type; o.frequency.value = f; this._env(eg, t, 0.01, dur, vol);
      o.connect(eg); eg.connect(g); o.start(t); o.stop(t + dur + 0.05);
    };
    mk(bf, 'triangle', beat * 0.45, 0.7);
    if (n % 2 === 0 || Math.random() < 0.5) mk(lf, 'square', beat * 0.3, 0.35);
    if (n % 4 === 0) { this.noiseAt(t, 0.05, 0.3, 6000, g); }
    if (n % 4 === 2) { this.noiseAt(t, 0.08, 0.15, 3000, g); }
    state.step++;
  }
  /** a burst of filtered noise fading out over `dur`, starting at audio time t */
  noiseAt(t, dur, vol, lp, dest) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfxBus); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
  }
  stopMusic() {
    if (!this.music) return;
    clearInterval(this.music.timer);
    this.music.gain.gain.setTargetAtTime(0, this.t, 0.05);
    const m = this.music; setTimeout(() => m.gain.disconnect(), 500);
    this.music = null;
  }
}

/**
 * A small audio diagnostics panel, toggled with the ` (backquote) key or opened by adding ?audiodebug to the URL:
 * whether the game runs inside another site's frame, whether the browser's audio API has been wrapped by the host
 * page, the audio clock state and the output latency the browser reports, plus the frame rate.
 */
export function installAudioDebug(audio) {
  let el = null, timer = null, frames = 0, last = performance.now(), fps = 0;
  const native = (f) => { try { return typeof f === 'function' && /\[native code\]/.test(Function.prototype.toString.call(f)); } catch { return false; } };
  const framed = (() => { try { return window.self !== window.top; } catch { return true; } })();
  const count = () => { frames++; const now = performance.now(); if (now - last >= 1000) { fps = (frames * 1000) / (now - last); frames = 0; last = now; } if (el) requestAnimationFrame(count); };
  const render = () => {
    const c = audio.ctx, ms = (s) => (typeof s === 'number' ? `${Math.round(s * 1000)} ms` : 'n/a');
    const wrapped = !native(window.AudioContext || window.webkitAudioContext) || !native(AudioNode.prototype.connect) || (c && !native(c.createGain));
    el.textContent = [
      'AUDIO DEBUG  (` to close)',
      `in a host frame: ${framed ? 'yes' : 'no'}`,
      `audio API: ${wrapped ? 'WRAPPED by the page' : 'native'}`,
      `context: ${c ? `${c.state}, ${c.sampleRate} Hz` : 'not started (tap or press a key)'}`,
      `base latency: ${ms(c?.baseLatency)}   output latency: ${ms(c?.outputLatency)}`,
      `total output delay: ${c ? ms((c.baseLatency || 0) + (c.outputLatency || 0)) : 'n/a'}`,
      `frame rate: ${fps.toFixed(0)} fps`,
    ].join('\n');
  };
  const toggle = () => {
    if (el) { el.remove(); el = null; clearInterval(timer); return; }
    el = document.createElement('pre');
    el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;margin:0;padding:8px 10px;font:12px/1.45 ui-monospace,Menlo,monospace;color:#e8ffe8;background:rgba(10,20,10,.85);border-radius:6px;pointer-events:none;white-space:pre';
    document.body.appendChild(el); render(); timer = setInterval(render, 500); requestAnimationFrame(count);
  };
  window.addEventListener('keydown', (e) => { if (e.code === 'Backquote') toggle(); });
  if (/[?&]audiodebug\b/.test(location.search)) toggle();
}
