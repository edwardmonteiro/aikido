/* LIMIAR — unified input: keyboard + gamepad + on-screen touch controls.
 *
 * Every source writes into one shared state (RR.Input). Game code reads
 * `held.x` for continuous input and `consume('punch')` for one-shot presses,
 * so it never cares which device the player is using.
 */
(function (global) {
  'use strict';

  const ACTIONS = ['left', 'right', 'up', 'down', 'punch', 'kick', 'block', 'special', 'start'];
  const Input = {
    held: {},
    _presses: {},
    touchVisible: false,
    _wantTouch: false,
    consume(a) {
      if (this._presses[a]) { this._presses[a] = 0; return true; }
      return false;
    },
    clear() { ACTIONS.forEach((a) => { this._presses[a] = 0; }); },
    press(a) { this._presses[a] = 1; },
    anyAction() { const r = ['punch', 'kick', 'block', 'special', 'start'].map((a) => this.consume(a)); return r.some(Boolean); },
    showTouch(v) { this._wantTouch = v; }
  };
  ACTIONS.forEach((a) => { Input.held[a] = false; Input._presses[a] = 0; });

  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    KeyJ: 'punch', KeyZ: 'punch',
    KeyK: 'kick', KeyX: 'kick',
    KeyL: 'block', KeyC: 'block', ShiftLeft: 'block', ShiftRight: 'block',
    KeyI: 'special', KeyV: 'special', Space: 'special',
    Enter: 'start', Escape: 'start'
  };
  const keyHeld = {};
  global.addEventListener('keydown', (e) => {
    const a = KEYMAP[e.code];
    if (!a) return;
    e.preventDefault();
    if (!keyHeld[e.code]) Input.press(a);
    keyHeld[e.code] = true;
  });
  global.addEventListener('keyup', (e) => { keyHeld[e.code] = false; });
  global.addEventListener('blur', () => { Object.keys(keyHeld).forEach((k) => { keyHeld[k] = false; }); });

  const isTouch = ('ontouchstart' in global) || (navigator.maxTouchPoints > 0);

  /** Overlay scene that draws and reads the virtual pad. Always on top. */
  class ControlsScene extends Phaser.Scene {
    constructor() { super({ key: 'Controls', active: false }); }

    create() {
      const Z = global.LIM.ZOOM || 1;
      this.cameras.main.setZoom(Z).setOrigin(0, 0);
      this.Z = Z;
      const W = this.scale.width / Z, H = this.scale.height / Z;
      this.W = W;
      this.input.addPointer(3);
      this.touchHeld = { left: false, right: false, up: false, down: false, punch: false, kick: false, block: false, special: false };
      this.padPointer = null;
      this.btnPointers = {};

      this.root = this.add.container(0, 0).setDepth(1000);
      // joystick
      this.padX = 62; this.padY = H - 62; this.padR = 40;
      this.padBase = this.add.circle(this.padX, this.padY, this.padR, 0x08060c, 0.35).setStrokeStyle(1, 0xe0aa5c, 0.5);
      this.padKnob = this.add.circle(this.padX, this.padY, 15, 0xe0aa5c, 0.3).setStrokeStyle(1, 0xffe2b0, 0.7);
      this.root.add([this.padBase, this.padKnob]);

      // action buttons (right side, arc layout)
      // losango: SOCO à esquerda, CHUTE à direita, DEFESA embaixo, ESPECIAL em cima
      const cx = W - 66, cy = H - 66, o = 34;
      const defs = [
        { a: 'punch', label: 'SOCO', x: cx - o, y: cy, color: 0xe0aa5c },
        { a: 'kick', label: 'CHUTE', x: cx + o, y: cy, color: 0xd42a2a },
        { a: 'block', label: 'DEFESA', x: cx, y: cy + o, color: 0x6a8ac8 },
        { a: 'special', label: 'ECO', x: cx, y: cy - o, color: 0x9a6ae0 }
      ];
      this.buttons = defs.map((d) => {
        const c = this.add.circle(d.x, d.y, 18, 0x08060c, 0.4).setStrokeStyle(1.2, d.color, 0.9);
        const t = this.add.text(d.x, d.y, d.label, { fontFamily: 'Inter, sans-serif', fontStyle: '700', fontSize: '6.5px', color: '#f4e6c8', resolution: 3 })
          .setOrigin(0.5).setAlpha(0.9);
        this.root.add([c, t]);
        return Object.assign({ circle: c, text: t, r: 21 }, d);
      });
      this.root.setVisible(false);

      this.input.on('pointerdown', this.onDown, this);
      this.input.on('pointermove', this.onMove, this);
      this.input.on('pointerup', this.onUp, this);
      this.input.on('pointerupoutside', this.onUp, this);
    }

    onDown(p) {
      if (!this.root.visible) return;
      const px = p.x / this.Z, py = p.y / this.Z;
      if (px < this.W * 0.42) {
        if (this.padPointer === null) { this.padPointer = p.id; this.onMove(p); }
        return;
      }
      for (const b of this.buttons) {
        if (Phaser.Math.Distance.Between(px, py, b.x, b.y) <= b.r) {
          this.btnPointers[p.id] = b.a;
          this.touchHeld[b.a] = true;
          Input.press(b.a);
          b.circle.setFillStyle(b.color, 0.55);
          if (navigator.vibrate) navigator.vibrate(12);
          return;
        }
      }
    }

    onMove(p) {
      if (p.id !== this.padPointer) return;
      let dx = p.x / this.Z - this.padX, dy = p.y / this.Z - this.padY;
      const len = Math.hypot(dx, dy);
      const max = this.padR;
      if (len > max) { dx = dx / len * max; dy = dy / len * max; }
      this.padKnob.setPosition(this.padX + dx, this.padY + dy);
      const dead = 10;
      const prev = Object.assign({}, this.touchHeld);
      this.touchHeld.left = dx < -dead && Math.abs(dx) > Math.abs(dy) * 0.4;
      this.touchHeld.right = dx > dead && Math.abs(dx) > Math.abs(dy) * 0.4;
      this.touchHeld.up = dy < -dead && Math.abs(dy) > Math.abs(dx) * 0.4;
      this.touchHeld.down = dy > dead && Math.abs(dy) > Math.abs(dx) * 0.4;
      ['left', 'right', 'up', 'down'].forEach((a) => { if (this.touchHeld[a] && !prev[a]) Input.press(a); });
    }

    onUp(p) {
      if (p.id === this.padPointer) {
        this.padPointer = null;
        this.padKnob.setPosition(this.padX, this.padY);
        ['left', 'right', 'up', 'down'].forEach((a) => { this.touchHeld[a] = false; });
      }
      const a = this.btnPointers[p.id];
      if (a) {
        delete this.btnPointers[p.id];
        this.touchHeld[a] = false;
        const b = this.buttons.find((x) => x.a === a);
        b.circle.setFillStyle(0x08060c, 0.4);
      }
    }

    update() {
      const show = isTouch && Input._wantTouch;
      if (show !== this.root.visible) {
        this.root.setVisible(show);
        if (!show) { Object.keys(this.touchHeld).forEach((k) => { this.touchHeld[k] = false; }); this.padPointer = null; this.btnPointers = {}; }
      }
      Input.touchVisible = show;

      // gamepad (standard mapping)
      const gp = (navigator.getGamepads && navigator.getGamepads()[0]) || null;
      const g = { left: false, right: false, up: false, down: false, punch: false, kick: false, block: false, special: false, start: false };
      if (gp) {
        const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
        const btn = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
        g.left = ax < -0.4 || btn(14); g.right = ax > 0.4 || btn(15);
        g.up = ay < -0.4 || btn(12); g.down = ay > 0.4 || btn(13);
        g.punch = btn(2); g.kick = btn(3); g.block = btn(1) || btn(4) || btn(5); g.special = btn(0); g.start = btn(9);
        this.prevGp = this.prevGp || {};
        Object.keys(g).forEach((a) => { if (g[a] && !this.prevGp[a]) Input.press(a); });
        this.prevGp = g;
      }

      const k = (a) => Object.keys(KEYMAP).some((code) => KEYMAP[code] === a && keyHeld[code]);
      ACTIONS.forEach((a) => { Input.held[a] = k(a) || !!this.touchHeld[a] || g[a]; });
    }
  }

  global.LIM = global.LIM || {};
  Object.assign(global.LIM, { Input, ControlsScene, isTouch });
})(window);
