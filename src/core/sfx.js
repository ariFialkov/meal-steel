// Procedural sound effects for the special moves, synthesised on the fly from oscillators and filtered noise (no
// samples to download): servos and clanks for parts deploying, glugs and splashes for liquids, launches, booms,
// gunfire, gas, glass, firecrackers, and sustained loops (laser, flamethrower, jet, spinner) that follow their source.
// Each call is cheap (a handful of nodes that stop themselves); a per-sound rate limit and a voice cap keep rapid fire
// (a hundred eggs) from piling up.

const MAX_VOICES = 32;

export class Sfx {
  constructor(audio) { this.a = audio; this.last = {}; this.ends = []; this.buf = null; }
  get ctx() { return this.a.ctx; }
  ready() { return !!(this.a.ctx && this.a.unlocked && !this.a.muted); }

  // ------------------------------------------------------------------ building blocks
  noiseBuffer() {
    if (this.buf) return this.buf;
    const n = this.ctx.sampleRate * 2, b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return (this.buf = b);
  }
  /** a voice's output: gain (+ stereo pan) into the sfx bus, torn down after `dur` */
  out(vol, pan, dur) {
    const c = this.ctx, g = c.createGain(); g.gain.value = vol;
    let head = g;
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(this.a.sfxBus); }
    else g.connect(this.a.sfxBus);
    setTimeout(() => { try { head.disconnect(); } catch (e) { /* already gone */ } }, (dur + 0.3) * 1000);
    return g;
  }
  env(param, t, a, hold, rel, peak) {
    param.cancelScheduledValues(t); param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.max(0.003, a));
    if (hold > 0) param.setValueAtTime(Math.max(0.0002, peak), t + a + hold);
    param.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
  }
  /** filtered noise burst: o = { t, dur, vol, type, f, f2, q, a } */
  nz(dest, o) {
    const c = this.ctx, t = c.currentTime + (o.t || 0), dur = o.dur || 0.2;
    const s = c.createBufferSource(); s.buffer = this.noiseBuffer(); s.loop = true;
    const f = c.createBiquadFilter(); f.type = o.type || 'lowpass'; f.frequency.setValueAtTime(o.f || 1200, t); f.Q.value = o.q ?? 0.8;
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    const g = c.createGain(); this.env(g.gain, t, o.a ?? 0.005, o.hold || 0, dur, o.vol ?? 0.3);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 1.5); s.stop(t + (o.a ?? 0.005) + (o.hold || 0) + dur + 0.05);
  }
  /** oscillator: o = { t, dur, vol, type, f, f2, a, lp, vib: [rate, depth] } */
  os(dest, o) {
    const c = this.ctx, t = c.currentTime + (o.t || 0), dur = o.dur || 0.15;
    const osc = c.createOscillator(); osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(o.f || 440, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + (o.a ?? 0.005) + (o.hold || 0) + dur);
    let lfo = null;
    if (o.vib) { lfo = c.createOscillator(); lfo.frequency.value = o.vib[0]; const lg = c.createGain(); lg.gain.value = o.vib[1]; lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t); lfo.stop(t + dur + 0.2); }
    const g = c.createGain(); this.env(g.gain, t, o.a ?? 0.005, o.hold || 0, dur, o.vol ?? 0.2);
    let src = osc;
    if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); src = f; }
    src.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + (o.a ?? 0.005) + (o.hold || 0) + dur + 0.05);
  }

  // ------------------------------------------------------------------ playback
  /** play a one-shot by name; vol 0..1, pan -1..1 */
  play(name, vol = 1, pan = 0) {
    if (!this.ready() || vol < 0.02) return;
    const r = RECIPES[name]; if (!r) return;
    const now = this.ctx.currentTime;
    if (now - (this.last[name] ?? -1) < (r.gap ?? 0.05)) return;
    this.ends = this.ends.filter((e) => e > now);
    if (this.ends.length >= MAX_VOICES) return;
    this.last[name] = now; this.ends.push(now + r.len);
    r.play(this, this.out(vol * (r.vol ?? 1), pan, r.len));
  }
  /** a sustained sound; returns { set(vol, pan), stop() } (or a stub when audio is off) */
  loop(name, vol = 1, pan = 0) {
    const L = LOOPS[name];
    if (!this.ready() || !L) return { set() {}, stop() {} };
    const c = this.ctx, g = c.createGain(); g.gain.value = 0.0001;
    const p = c.createStereoPanner ? c.createStereoPanner() : null;
    if (p) { g.connect(p); p.connect(this.a.sfxBus); } else g.connect(this.a.sfxBus);
    const nodes = L(this, g);
    const h = {
      set: (v, pn = 0) => { const t = c.currentTime; g.gain.setTargetAtTime(Math.max(0.0001, v * (L.vol ?? 1)), t, 0.05); if (p) p.pan.setTargetAtTime(Math.max(-1, Math.min(1, pn)), t, 0.05); },
      stop: () => {
        if (h.dead) return; h.dead = true;
        const t = c.currentTime; g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0.0001, t, 0.08);
        setTimeout(() => { for (const n of nodes) { try { n.stop?.(); } catch (e) { /* stopped */ } } try { g.disconnect(); p?.disconnect(); } catch (e) { /* gone */ } }, 500);
      },
    };
    h.set(vol, pan);
    return h;
  }
}

// helpers for the loops: a looping noise source through a filter, an oscillator, an LFO onto a param
function noiseSrc(s, type, f, q = 0.8) {
  const c = s.ctx, src = c.createBufferSource(); src.buffer = s.noiseBuffer(); src.loop = true;
  const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; src.connect(fl); src.start(); return [src, fl];
}
function oscSrc(s, type, f) { const o = s.ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; }
function lfoTo(s, param, rate, depth, type = 'sine') { const l = s.ctx.createOscillator(); l.type = type; l.frequency.value = rate; const g = s.ctx.createGain(); g.gain.value = depth; l.connect(g); g.connect(param); l.start(); return l; }
function gainNode(s, v, dest) { const g = s.ctx.createGain(); g.gain.value = v; g.connect(dest); return g; }

const RECIPES = {
  // parts unfolding / folding away: a servo whine and a clank as it locks
  deploy: { len: 0.5, play: (s, d) => { s.os(d, { type: 'sawtooth', f: 160, f2: 420, dur: 0.32, vol: 0.12, a: 0.02, lp: 1400 }); s.os(d, { type: 'square', f: 80, f2: 190, dur: 0.32, vol: 0.05, a: 0.02, lp: 600 }); clank(s, d, 0.32); } },
  retract: { len: 0.5, play: (s, d) => { s.os(d, { type: 'sawtooth', f: 420, f2: 150, dur: 0.32, vol: 0.12, a: 0.02, lp: 1400 }); s.os(d, { type: 'square', f: 190, f2: 80, dur: 0.32, vol: 0.05, a: 0.02, lp: 600 }); clank(s, d, 0.33, 0.7); } },
  clank: { len: 0.2, play: (s, d) => clank(s, d, 0) },
  // a window / door flung open
  hatch: { len: 0.3, play: (s, d) => { s.nz(d, { type: 'bandpass', f: 700, f2: 300, q: 2, dur: 0.12, vol: 0.25 }); clank(s, d, 0.1, 0.6); } },
  // liquids
  pour: { len: 1.4, play: (s, d) => {
    s.nz(d, { type: 'bandpass', f: 650, f2: 320, q: 1.6, a: 0.12, hold: 0.6, dur: 0.5, vol: 0.35 });
    s.nz(d, { type: 'lowpass', f: 400, a: 0.1, hold: 0.5, dur: 0.5, vol: 0.25 });
    for (let k = 0; k < 7; k++) { const f = 160 + Math.random() * 160; s.os(d, { t: 0.1 + k * 0.14 + Math.random() * 0.05, type: 'sine', f, f2: f * 1.8, dur: 0.07, vol: 0.18 }); }
  } },
  splash: { len: 0.6, play: (s, d) => { s.nz(d, { type: 'lowpass', f: 2600, f2: 500, dur: 0.45, vol: 0.45 }); for (let k = 0; k < 4; k++) { const f = 300 + Math.random() * 300; s.os(d, { t: 0.05 + Math.random() * 0.2, f, f2: f * 1.7, dur: 0.05, vol: 0.12 }); } } },
  splat: { gap: 0.04, len: 0.25, play: (s, d) => { s.nz(d, { type: 'lowpass', f: 1100, f2: 300, dur: 0.16, vol: 0.45 }); s.os(d, { f: 150, f2: 60, dur: 0.12, vol: 0.25 }); } },
  sizzle: { len: 1.1, play: (s, d) => { s.nz(d, { type: 'highpass', f: 4200, a: 0.03, hold: 0.4, dur: 0.5, vol: 0.18 }); for (let k = 0; k < 8; k++) s.nz(d, { t: Math.random() * 0.9, type: 'highpass', f: 2500, dur: 0.02, vol: 0.25 }); } },
  fizz: { len: 1.2, play: (s, d) => { s.nz(d, { type: 'highpass', f: 5500, a: 0.05, hold: 0.6, dur: 0.4, vol: 0.12 }); for (let k = 0; k < 10; k++) s.nz(d, { t: Math.random(), type: 'bandpass', f: 3000 + Math.random() * 3000, q: 4, dur: 0.02, vol: 0.2 }); } },
  // air
  whoosh: { gap: 0.03, len: 0.4, play: (s, d) => s.nz(d, { type: 'bandpass', f: 500, f2: 2200, q: 1.2, a: 0.08, dur: 0.28, vol: 0.35 }) },
  throw: { gap: 0.03, len: 0.25, play: (s, d) => s.nz(d, { type: 'bandpass', f: 900, f2: 2400, q: 1.5, a: 0.03, dur: 0.15, vol: 0.28 }) },
  frisbee: { gap: 0.03, len: 0.4, play: (s, d) => { s.nz(d, { type: 'bandpass', f: 1400, f2: 900, q: 3, a: 0.04, dur: 0.3, vol: 0.25 }); s.os(d, { type: 'triangle', f: 300, f2: 260, dur: 0.3, vol: 0.04, vib: [16, 40] }); } },
  hiss: { len: 1.5, play: (s, d) => { s.nz(d, { type: 'bandpass', f: 3200, f2: 1800, q: 0.7, a: 0.04, hold: 0.5, dur: 0.8, vol: 0.4 }); s.nz(d, { type: 'lowpass', f: 300, dur: 0.4, vol: 0.4 }); } },
  squirt: { len: 0.4, play: (s, d) => { s.nz(d, { type: 'bandpass', f: 2200, f2: 500, q: 2, a: 0.01, dur: 0.25, vol: 0.45 }); s.os(d, { type: 'square', f: 220, f2: 90, dur: 0.12, vol: 0.06, lp: 800 }); } },
  // launches and impacts
  launch: { len: 1.1, play: (s, d) => { s.nz(d, { type: 'lowpass', f: 4000, dur: 0.08, vol: 0.5 }); s.nz(d, { type: 'bandpass', f: 700, f2: 2600, q: 0.9, a: 0.05, hold: 0.2, dur: 0.6, vol: 0.4 }); s.os(d, { type: 'sawtooth', f: 110, f2: 55, dur: 0.6, vol: 0.12, lp: 500 }); } },
  boing: { len: 0.7, play: (s, d) => { s.os(d, { type: 'triangle', f: 420, f2: 140, dur: 0.55, vol: 0.25, vib: [17, 70] }); s.nz(d, { type: 'lowpass', f: 600, dur: 0.06, vol: 0.3 }); } },
  pop: { gap: 0.03, len: 0.35, play: (s, d) => { s.os(d, { f: 180, f2: 50, dur: 0.25, vol: 0.45 }); s.nz(d, { type: 'lowpass', f: 2800, f2: 400, dur: 0.25, vol: 0.45 }); } },
  boom: { gap: 0.08, len: 1.4, play: (s, d) => {
    s.os(d, { f: 95, f2: 28, dur: 0.9, vol: 0.75 }); s.nz(d, { type: 'lowpass', f: 2200, f2: 160, dur: 1.1, vol: 0.7 });
    s.nz(d, { type: 'highpass', f: 2000, dur: 0.12, vol: 0.35 }); for (let k = 0; k < 6; k++) s.nz(d, { t: 0.1 + Math.random() * 0.6, type: 'bandpass', f: 1500 + Math.random() * 2000, q: 2, dur: 0.03, vol: 0.25 });
  } },
  cannon: { gap: 0.04, len: 0.3, play: (s, d) => { s.nz(d, { type: 'lowpass', f: 6000, f2: 1500, dur: 0.06, vol: 0.55 }); s.os(d, { type: 'square', f: 150, f2: 50, dur: 0.1, vol: 0.28, lp: 900 }); s.nz(d, { t: 0.04, type: 'bandpass', f: 1200, q: 1, dur: 0.14, vol: 0.18 }); } },
  pock: { gap: 0.045, len: 0.1, play: (s, d) => { s.os(d, { type: 'triangle', f: 900, f2: 450, dur: 0.045, vol: 0.18 }); s.nz(d, { type: 'highpass', f: 3500, dur: 0.02, vol: 0.12 }); } },
  crack: { gap: 0.04, len: 0.2, play: (s, d) => { s.nz(d, { type: 'highpass', f: 2600, dur: 0.04, vol: 0.3 }); s.nz(d, { t: 0.02, type: 'lowpass', f: 700, dur: 0.1, vol: 0.3 }); } },
  smack: { gap: 0.05, len: 0.25, play: (s, d) => { s.nz(d, { type: 'lowpass', f: 1600, f2: 400, dur: 0.12, vol: 0.55 }); s.os(d, { f: 190, f2: 80, dur: 0.12, vol: 0.35 }); } },
  thwap: { gap: 0.05, len: 0.25, play: (s, d) => { s.nz(d, { type: 'lowpass', f: 900, f2: 300, dur: 0.1, vol: 0.5 }); s.os(d, { f: 120, f2: 70, dur: 0.1, vol: 0.2 }); } },
  glass: { gap: 0.04, len: 0.5, play: (s, d) => { s.nz(d, { type: 'highpass', f: 4500, dur: 0.22, vol: 0.35 }); for (let k = 0; k < 6; k++) { const f = 2600 + Math.random() * 3800; s.os(d, { t: Math.random() * 0.12, type: 'sine', f, f2: f * 0.97, dur: 0.12 + Math.random() * 0.25, vol: 0.06 }); } } },
  crackers: { len: 0.6, play: (s, d) => { for (let k = 0; k < 7; k++) { const t = Math.random() * 0.45; s.nz(d, { t, type: 'highpass', f: 1200, dur: 0.035, vol: 0.5 }); s.os(d, { t, f: 420, f2: 120, dur: 0.04, vol: 0.12 }); } } },
  crunch: { gap: 0.05, len: 0.35, play: (s, d) => { s.nz(d, { type: 'bandpass', f: 900, q: 1.2, dur: 0.18, vol: 0.5 }); for (let k = 0; k < 5; k++) s.nz(d, { t: Math.random() * 0.12, type: 'highpass', f: 2000, dur: 0.015, vol: 0.35 }); } },
  stomp: { len: 1.0, play: (s, d) => { s.os(d, { f: 60, f2: 26, dur: 0.8, vol: 0.85 }); s.nz(d, { type: 'lowpass', f: 380, f2: 90, dur: 0.7, vol: 0.6 }); s.nz(d, { type: 'bandpass', f: 1100, dur: 0.12, vol: 0.3 }); } },
  rise: { len: 1.2, play: (s, d) => { s.nz(d, { type: 'lowpass', f: 220, a: 0.1, hold: 0.4, dur: 0.5, vol: 0.5 }); s.os(d, { type: 'sawtooth', f: 60, f2: 120, a: 0.1, dur: 0.8, vol: 0.08, lp: 400 }); for (let k = 0; k < 5; k++) s.nz(d, { t: 0.1 + Math.random() * 0.7, type: 'bandpass', f: 600 + Math.random() * 800, q: 3, dur: 0.05, vol: 0.2 }); } },
  freeze: { len: 1.0, play: (s, d) => { s.nz(d, { type: 'bandpass', f: 1800, f2: 4000, a: 0.08, dur: 0.6, vol: 0.3 }); s.os(d, { f: 1600, f2: 500, dur: 0.5, vol: 0.08 }); for (let k = 0; k < 9; k++) s.nz(d, { t: 0.1 + Math.random() * 0.7, type: 'highpass', f: 5000, dur: 0.02, vol: 0.3 }); } },
  zap: { len: 0.7, play: (s, d) => { s.os(d, { type: 'sawtooth', f: 180, f2: 1400, dur: 0.55, vol: 0.12, lp: 3000 }); s.os(d, { f: 360, f2: 2800, dur: 0.55, vol: 0.08 }); } },
  roar: { len: 1.2, play: (s, d) => { s.os(d, { type: 'sawtooth', f: 120, f2: 70, a: 0.06, dur: 0.9, vol: 0.25, lp: 900, vib: [9, 14] }); s.nz(d, { type: 'bandpass', f: 500, f2: 300, q: 1, a: 0.06, dur: 0.8, vol: 0.3 }); } },
  rev: { len: 1.3, play: (s, d) => { s.os(d, { type: 'sawtooth', f: 70, f2: 260, a: 0.05, dur: 1.1, vol: 0.18, lp: 1500 }); s.os(d, { type: 'square', f: 35, f2: 130, a: 0.05, dur: 1.1, vol: 0.06, lp: 500 }); } },
  beep: { gap: 0.08, len: 0.12, play: (s, d) => s.os(d, { type: 'square', f: 1250, dur: 0.06, vol: 0.12 }) },
  net: { len: 0.4, play: (s, d) => { s.nz(d, { type: 'bandpass', f: 600, f2: 1800, q: 1, a: 0.04, dur: 0.25, vol: 0.3 }); s.os(d, { type: 'triangle', f: 140, f2: 90, dur: 0.2, vol: 0.12 }); } },
  wrap: { len: 0.35, play: (s, d) => { s.nz(d, { type: 'lowpass', f: 1000, f2: 300, dur: 0.18, vol: 0.45 }); s.os(d, { type: 'triangle', f: 90, f2: 60, dur: 0.25, vol: 0.2, vib: [22, 10] }); } },
  ignite: { len: 0.8, play: (s, d) => { s.nz(d, { type: 'lowpass', f: 300, f2: 1600, a: 0.05, dur: 0.5, vol: 0.55 }); s.nz(d, { type: 'highpass', f: 3000, a: 0.1, dur: 0.4, vol: 0.12 }); } },
  crackle: { gap: 0.2, len: 0.5, play: (s, d) => { for (let k = 0; k < 5; k++) s.nz(d, { t: Math.random() * 0.35, type: 'bandpass', f: 1500 + Math.random() * 2500, q: 3, dur: 0.02, vol: 0.35 }); s.nz(d, { type: 'lowpass', f: 500, dur: 0.3, vol: 0.15 }); } },
};
function clank(s, d, t, k = 1) {
  s.os(d, { t, type: 'square', f: 520 * k, dur: 0.07, vol: 0.08, lp: 2600 }); s.os(d, { t, type: 'square', f: 787 * k, dur: 0.05, vol: 0.06, lp: 3000 });
  s.nz(d, { t, type: 'highpass', f: 3000, dur: 0.03, vol: 0.2 });
}

// sustained sounds: build the graph into `out`, return the nodes to stop
const LOOPS = {
  // a pink laser: buzzing saw and square, a fast tremolo and a shimmering high whine
  laser: Object.assign((s, out) => {
    const a = oscSrc(s, 'sawtooth', 110), b = oscSrc(s, 'square', 221), w = oscSrc(s, 'sine', 1760);
    const f = s.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400; f.connect(out);
    const trem = s.ctx.createGain(); trem.gain.value = 0.7; trem.connect(f);
    a.connect(gainNode(s, 0.25, trem)); b.connect(gainNode(s, 0.12, trem)); w.connect(gainNode(s, 0.05, f));
    const l = lfoTo(s, trem.gain, 31, 0.3), v = lfoTo(s, w.frequency, 6, 40);
    return [a, b, w, l, v];
  }, { vol: 0.6 }),
  // a roaring jet of flame: rumble plus a breathy hiss that surges
  flame: Object.assign((s, out) => {
    const [n1, f1] = noiseSrc(s, 'lowpass', 700), [n2, f2] = noiseSrc(s, 'bandpass', 2200, 0.6);
    const g1 = gainNode(s, 0.9, out), g2 = gainNode(s, 0.3, out); f1.connect(g1); f2.connect(g2);
    const l = lfoTo(s, g1.gain, 7, 0.25, 'triangle'), l2 = lfoTo(s, f1.frequency, 3, 250);
    return [n1, n2, l, l2];
  }, { vol: 0.7 }),
  // a jet engine: whine plus exhaust roar
  jet: Object.assign((s, out) => {
    const w = oscSrc(s, 'sawtooth', 640), [n, f] = noiseSrc(s, 'bandpass', 1300, 0.7);
    const wf = s.ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 2200; w.connect(wf); wf.connect(gainNode(s, 0.06, out));
    f.connect(gainNode(s, 0.55, out)); const v = lfoTo(s, w.frequency, 5, 12);
    return [w, n, v];
  }, { vol: 0.7 }),
  // the churro spinner: a whirring "whup-whup" rotor
  spinner: Object.assign((s, out) => {
    const [n, f] = noiseSrc(s, 'bandpass', 380, 1.2), m = oscSrc(s, 'sawtooth', 55);
    const g = gainNode(s, 0.5, out); f.connect(g); const mf = s.ctx.createBiquadFilter(); mf.type = 'lowpass'; mf.frequency.value = 300; m.connect(mf); mf.connect(gainNode(s, 0.12, out));
    const l = lfoTo(s, g.gain, 11, 0.45, 'square');
    return [n, m, l];
  }, { vol: 0.8 }),
  // smoke pouring out: a broad hiss
  smoke: Object.assign((s, out) => { const [n, f] = noiseSrc(s, 'bandpass', 900, 0.5); f.connect(gainNode(s, 0.5, out)); const l = lfoTo(s, f.frequency, 0.7, 300); return [n, l]; }, { vol: 0.5 }),
};
