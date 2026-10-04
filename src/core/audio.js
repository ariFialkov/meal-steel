// Procedural WebAudio: engine hum, hits, boosts, coins, UI ticks and a chiptune loop for Musical Trucks.
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
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.unlocked = true;
  }
  get t() { return this.ctx ? this.ctx.currentTime : 0; }
  _env(gain, t, a, d, peak = 1) {
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  tone(freq, dur = 0.1, type = 'square', vol = 0.2, slide = 0) {
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, this.t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), this.t + dur);
    this._env(g, this.t, 0.005, dur, vol);
    o.connect(g); g.connect(this.sfxBus); o.start(); o.stop(this.t + dur + 0.05);
  }
  noise(dur = 0.2, vol = 0.3, lp = 1200) {
    if (!this.ctx || this.muted) return;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this.sfxBus); s.start();
  }
  hit(strength = 1) { this.noise(0.12 + 0.15 * strength, 0.25 + 0.3 * Math.min(1, strength), 600 + 800 * strength); this.tone(90, 0.12, 'triangle', 0.3, -40); }
  crash() { this.noise(0.5, 0.6, 2500); this.tone(60, 0.4, 'sawtooth', 0.3, -40); }
  boost() { this.noise(0.6, 0.25, 3000); this.tone(200, 0.5, 'sawtooth', 0.12, 600); }
  special() { this.tone(520, 0.08, 'square', 0.15, 300); setTimeout(() => this.tone(780, 0.15, 'square', 0.15, 200), 70); }
  coin() { this.tone(988, 0.06, 'square', 0.15); setTimeout(() => this.tone(1319, 0.18, 'square', 0.15), 60); }
  tick() { this.tone(1200, 0.03, 'square', 0.06); }
  lock() { this.tone(660, 0.08, 'square', 0.15); setTimeout(() => this.tone(990, 0.2, 'square', 0.15), 80); }
  beep(high = false) { this.tone(high ? 880 : 440, high ? 0.5 : 0.15, 'square', 0.2); }
  whistle() { this.tone(2200, 0.35, 'square', 0.15, 200); }
  goal() { [0, 90, 180, 270].forEach((d, i) => setTimeout(() => this.tone(330 * Math.pow(1.26, i), 0.25, 'sawtooth', 0.18), d)); this.noise(0.8, 0.3, 4000); }
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, i === 3 ? 0.6 : 0.16, 'square', 0.18), i * 130)); }
  sad() { [392, 349, 311, 262].forEach((f, i) => setTimeout(() => this.tone(f, i === 3 ? 0.7 : 0.22, 'triangle', 0.18), i * 200)); }
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
    const state = { step: 0, timer: null, gain: g };
    const schedule = () => {
      const t = this.t + 0.05;
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
    };
    state.timer = setInterval(schedule, beat * 1000 / 2);
    this.music = state;
  }
  noiseAt(t, dur, vol, lp, dest) {
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(dest || this.sfxBus); s.start(t);
  }
  stopMusic() {
    if (!this.music) return;
    clearInterval(this.music.timer);
    this.music.gain.gain.setTargetAtTime(0, this.t, 0.05);
    const m = this.music; setTimeout(() => m.gain.disconnect(), 500);
    this.music = null;
  }
}
