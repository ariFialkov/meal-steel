// Unified input: keyboard (WASD/arrows, Shift turbo, Space/E light special, Q heavy special, C camera) + touch.
export class Input {
  constructor() {
    this.keys = new Set();
    this.steer = 0; this.throttle = 0; this.brake = false;
    this.turboPressed = false; this.specialPressed = false;
    this._turboQueued = false; this._specialQueued = false; this._heavyQueued = false; this._camQueued = false; this.camPressed = false; this.heavyPressed = false;
    this.joy = { active: false, id: null, cx: 0, cy: 0, x: 0, y: 0 };
    this.touchButtons = { brake: false };
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.enabled = false;
    this.onAnyInput = null;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this._turboQueued = true;
      if (e.code === 'Space' || e.code === 'KeyE') this._specialQueued = true;
      if (e.code === 'KeyQ') this._heavyQueued = true;
      if (e.code === 'KeyC') this._camQueued = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.onAnyInput?.();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    const releaseAll = () => { this.keys.clear(); this.joy.active = false; this.joy.x = 0; this.joy.y = 0; this.touchButtons.brake = false; };
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
    this.releaseAll = releaseAll;
  }

  /** Camera-switch button (soccer); works with touch and mouse. */
  bindCamButton(el) {
    const fire = (e) => { e.preventDefault(); e.stopPropagation(); this._camQueued = true; };
    el.addEventListener('touchstart', fire, { passive: false });
    el.addEventListener('mousedown', fire);
  }

  bindTouch(joyEl, stickEl, btnTurbo, btnSpecial, btnBrake, btnHeavy) {
    if (this.isTouch) document.body.classList.add('touch');
    const zone = joyEl;
    const start = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const t = e.changedTouches ? e.changedTouches[0] : e;
      const r = zone.getBoundingClientRect();
      this.joy.active = true; this.joy.id = t.identifier ?? 'mouse';
      this.joy.cx = r.left + r.width / 2; this.joy.cy = r.top + r.height / 2;
      move(e);
      this.onAnyInput?.();
    };
    const move = (e) => {
      if (!this.joy.active) return;
      e.preventDefault?.();
      let t = null;
      if (e.changedTouches) { for (const c of e.changedTouches) if (c.identifier === this.joy.id) t = c; if (!t) return; } else t = e;
      const dx = t.clientX - this.joy.cx, dy = t.clientY - this.joy.cy;
      const max = 48, d = Math.hypot(dx, dy), k = d > max ? max / d : 1;
      this.joy.x = (dx * k) / max; this.joy.y = (dy * k) / max;
      stickEl.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
    };
    const end = (e) => {
      if (e.changedTouches) { let found = false; for (const c of e.changedTouches) if (c.identifier === this.joy.id) found = true; if (!found) return; }
      this.joy.active = false; this.joy.x = 0; this.joy.y = 0;
      stickEl.style.transform = 'translate(-50%, -50%)';
    };
    zone.addEventListener('touchstart', start, { passive: false });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end); window.addEventListener('touchcancel', end);
    zone.addEventListener('mousedown', start);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);

    const press = (el, fn) => {
      el.addEventListener('touchstart', (e) => { e.preventDefault(); fn(true); this.onAnyInput?.(); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); fn(false); }, { passive: false });
      el.addEventListener('mousedown', () => { fn(true); });
      window.addEventListener('mouseup', () => fn(false));
    };
    press(btnTurbo, (d) => { if (d) this._turboQueued = true; });
    press(btnSpecial, (d) => { if (d) this._specialQueued = true; });
    if (btnHeavy) press(btnHeavy, (d) => { if (d) this._heavyQueued = true; });
    press(btnBrake, (d) => { this.touchButtons.brake = d; });
  }

  poll() {
    const k = this.keys;
    let steer = 0, thr = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) steer -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) steer += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) thr += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) thr -= 1;
    if (this.joy.active) {
      steer = this.joy.x;
      // forward unless pulling clearly back; joystick vertical controls throttle
      thr = -this.joy.y;
      if (Math.abs(this.joy.y) < 0.25 && Math.hypot(this.joy.x, this.joy.y) > 0.2) thr = 0.85;
    }
    if (this.touchButtons.brake) thr = -1;
    this.steer = Math.max(-1, Math.min(1, steer));
    this.throttle = Math.max(-1, Math.min(1, thr));
    this.brake = thr < -0.2;
    this.handbrake = k.has('KeyS') || k.has('ArrowDown') || this.touchButtons.brake;
    this.turboPressed = this._turboQueued; this._turboQueued = false;
    this.specialPressed = this._specialQueued; this._specialQueued = false;
    this.heavyPressed = this._heavyQueued; this._heavyQueued = false;
    this.camPressed = this._camQueued; this._camQueued = false;
    if (!this.enabled) { this.steer = 0; this.throttle = 0; this.brake = false; this.turboPressed = false; this.specialPressed = false; this.heavyPressed = false; }
    return this;
  }
}
