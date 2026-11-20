/* Ring Riot — scenes: boot, title, select, match, champion. */
(function (global) {
  'use strict';
  const RR = global.RR;
  const W = 480, H = 270;
  const FONT = '"Press Start 2P", monospace';

  // ---- shared helpers ----------------------------------------------------------
  function txt(scene, x, y, str, size, color, opts) {
    const o = opts || {};
    const t = scene.add.text(x, y, str, {
      fontFamily: FONT, fontSize: (size || 8) + 'px', color: color || '#ffffff',
      stroke: o.stroke || '#140818', strokeThickness: o.thick != null ? o.thick : Math.max(2, Math.round((size || 8) / 3)),
      align: o.align || 'center'
    });
    t.setOrigin(o.ox != null ? o.ox : 0.5, o.oy != null ? o.oy : 0.5);
    return t;
  }

  function button(scene, x, y, label, onClick, color) {
    const w = Math.max(84, label.length * 9 + 24);
    const bg = scene.add.rectangle(x, y, w, 24, color || 0xd02a50).setStrokeStyle(2, 0xffffff);
    const t = txt(scene, x, y + 1, label, 8, '#ffffff');
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => { bg.setFillStyle(0xffffff); t.setColor('#140818'); });
    bg.on('pointerout', () => { bg.setFillStyle(color || 0xd02a50); t.setColor('#ffffff'); });
    bg.on('pointerup', () => { bg.setFillStyle(color || 0xd02a50); t.setColor('#ffffff'); RR.SFX.select(); onClick(); });
    return { bg, t, destroy() { bg.destroy(); t.destroy(); }, setDepth(d) { bg.setDepth(d); t.setDepth(d + 1); return this; } };
  }

  /** Draws the arena (crowd, ropes, ring). Returns handles for animation. */
  function buildArena(scene) {
    const crowd = scene.add.image(0, -42, 'crowd0').setOrigin(0).setScale(2).setDepth(0);
    scene.add.image(0, 136, 'ring').setOrigin(0).setScale(2).setDepth(1);
    const g = scene.add.graphics().setDepth(1);
    // back posts + ropes
    const post = (x, top, bot, d) => {
      const pg = d ? scene.add.graphics().setDepth(d) : g;
      pg.fillStyle(0x14141c); pg.fillRect(x - 4, top, 8, bot - top);
      pg.fillStyle(0xc8c8d8); pg.fillRect(x - 3, top, 6, bot - top);
      pg.fillStyle(0xffffff); pg.fillRect(x - 3, top, 2, bot - top);
      return pg;
    };
    post(22, 86, 150); post(458, 86, 150);
    const rope = (gr, y, color) => {
      gr.fillStyle(0x14141c); gr.fillRect(14, y - 1, W - 28, 5);
      gr.fillStyle(color); gr.fillRect(14, y, W - 28, 3);
      gr.fillStyle(0xffffff, 0.5); gr.fillRect(14, y, W - 28, 1);
    };
    rope(g, 98, 0xe02040); rope(g, 114, 0xf0f0f0); rope(g, 130, 0x3050e0);
    // front ropes (drawn over fighters)
    const fg = scene.add.graphics().setDepth(400);
    const fl = post(8, 200, 262, 401); post(472, 200, 262, 401);
    fg.setAlpha(0.92);
    rope(fg, 222, 0xe02040); rope(fg, 237, 0xf0f0f0); rope(fg, 252, 0x3050e0);
    void fl;
    return { crowd };
  }

  function animateCrowd(scene, arena, dt, excite) {
    scene._crowdT = (scene._crowdT || 0) + dt;
    const interval = excite > 0.4 ? 0.16 : 0.55;
    if (scene._crowdT > interval) {
      scene._crowdT = 0;
      scene._crowdF = 1 - (scene._crowdF || 0);
      arena.crowd.setTexture('crowd' + scene._crowdF);
    }
    // camera flashes in the stands
    if (Math.random() < dt * (2 + excite * 14)) {
      const s = scene.add.image(Phaser.Math.Between(10, W - 10), Phaser.Math.Between(40, 120), 'spark')
        .setDepth(0.5).setScale(0.4).setAlpha(1);
      scene.tweens.add({ targets: s, scale: 1.4, alpha: 0, duration: 260, onComplete: () => s.destroy() });
    }
  }

  // ---- Boot ----------------------------------------------------------------------
  class Boot extends Phaser.Scene {
    constructor() { super('Boot'); }
    create() {
      RR.buildTextures(this);
      RR.createAnims(this);
      this.scene.launch('Controls');
      this.scene.start('Title');
    }
  }

  // ---- Title ---------------------------------------------------------------------
  class Title extends Phaser.Scene {
    constructor() { super('Title'); }
    create() {
      RR.Input.showTouch(false);
      RR.Input.clear();
      this.arena = buildArena(this);
      this.add.rectangle(0, 0, W, H, 0x000000, 0.35).setOrigin(0).setDepth(2);

      const left = this.add.sprite(70, 232, 'f-duke').setScale(2).setOrigin(0.5, RR.FOOT_Y / RR.FH).setDepth(300).play('duke-win');
      const right = this.add.sprite(410, 232, 'f-grizz').setScale(2).setOrigin(0.5, RR.FOOT_Y / RR.FH).setDepth(300).setFlipX(true).play('grizz-idle');
      void left; void right;

      const logo = txt(this, W / 2, 62, 'RING RIOT', 36, '#ffd23c', { stroke: '#d02a50', thick: 8 }).setDepth(500);
      this.tweens.add({ targets: logo, y: 58, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      txt(this, W / 2, 98, 'ARCADE  WRESTLING', 10, '#ffffff').setDepth(500);
      const start = txt(this, W / 2, 140, RR.isTouch ? 'TAP TO START' : 'PRESS ENTER', 12, '#ffffff').setDepth(500);
      this.tweens.add({ targets: start, alpha: 0.2, duration: 500, yoyo: true, repeat: -1 });

      const snd = button(this, W / 2 - 60, 176, RR.SFX.isMuted() ? 'SOUND OFF' : 'SOUND ON', () => {
        const m = RR.SFX.toggleMute(); snd.t.setText(m ? 'SOUND OFF' : 'SOUND ON');
      }, 0x3050e0).setDepth(500);
      button(this, W / 2 + 60, 176, 'FULLSCREEN', () => goFullscreen(this), 0x3050e0).setDepth(500);
      txt(this, W / 2, 262, 'PHASER 3 (MIT)  -  PRESS START 2P (OFL)  -  ART & SFX GENERATED IN CODE', 5, '#a0a0c8', { thick: 2 }).setDepth(500);

      // tap anywhere outside the buttons starts the game
      this.input.on('pointerup', (p, over) => { if (!over.length) this.go(); });
    }
    go() {
      if (this.leaving) return;
      this.leaving = true;
      RR.SFX.unlock(); RR.SFX.select();
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Select'));
    }
    update(_, delta) {
      animateCrowd(this, this.arena, delta / 1000, 0.2);
      if (RR.Input.consume('start') || RR.Input.consume('punch') || RR.Input.consume('jump')) this.go();
    }
  }

  function goFullscreen(scene) {
    if (scene.scale.isFullscreen) { scene.scale.stopFullscreen(); return; }
    scene.scale.startFullscreen();
    try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* not supported */ }
  }

  // ---- Character select ------------------------------------------------------------
  class Select extends Phaser.Scene {
    constructor() { super('Select'); }
    create() {
      RR.Input.showTouch(false);
      RR.Input.clear();
      this.cameras.main.fadeIn(250);
      this.arena = buildArena(this);
      this.add.rectangle(0, 0, W, H, 0x0a0818, 0.7).setOrigin(0).setDepth(2);
      txt(this, W / 2, 20, 'SELECT YOUR WRESTLER', 12, '#ffd23c').setDepth(10);

      this.sel = 0;
      this.cards = RR.ROSTER.map((c, i) => {
        const x = W / 2 + (i - 1.5) * 106, y = 84;
        const frame = this.add.rectangle(x, y, 86, 100, 0x1c1438).setStrokeStyle(2, 0x5a5a8a).setDepth(10);
        const img = this.add.image(x, y - 10, 'p-' + c.id).setScale(3).setDepth(11);
        const name = txt(this, x, y + 38, c.name.replace(' ', '\n'), 6, '#ffffff', { thick: 2 }).setDepth(11);
        frame.setInteractive({ useHandCursor: true });
        frame.on('pointerup', () => { if (this.sel === i) this.confirm(); else this.pick(i); });
        return { frame, img, name };
      });

      this.preview = this.add.sprite(78, 250, 'f-duke').setScale(2).setOrigin(0.5, RR.FOOT_Y / RR.FH).setDepth(12);
      this.info = txt(this, 150, 150, '', 8, '#ffffff', { ox: 0, oy: 0, align: 'left' }).setDepth(12);
      this.stats = this.add.graphics().setDepth(12);
      this.statLabels = ['POWER', 'SPEED', 'STAMINA'].map((s, i) => txt(this, 150, 200 + i * 13, s, 7, '#a0c8ff', { ox: 0, thick: 2 }).setDepth(12));
      button(this, W - 66, 244, 'FIGHT!', () => this.confirm(), 0xd02a50).setDepth(20);
      txt(this, W - 66, 222, RR.isTouch ? 'TAP TWICE' : '<- -> / ENTER', 5, '#a0a0c8', { thick: 2 }).setDepth(20);
      this.pick(0, true);
    }
    pick(i, silent) {
      this.sel = (i + RR.ROSTER.length) % RR.ROSTER.length;
      if (!silent) RR.SFX.select();
      const c = RR.ROSTER[this.sel];
      this.cards.forEach((cd, k) => {
        cd.frame.setStrokeStyle(k === this.sel ? 3 : 2, k === this.sel ? 0xffd23c : 0x5a5a8a);
        cd.frame.setFillStyle(k === this.sel ? 0x3a2a6a : 0x1c1438);
      });
      this.preview.play(c.id + '-idle');
      this.info.setText(c.name + '\n' + c.from.toUpperCase() + '\n' + c.blurb.toUpperCase());
      this.info.setLineSpacing(4);
      this.info.setStyle({ fontSize: '8px' });
      const g = this.stats; g.clear();
      [c.stats.power, c.stats.speed, c.stats.stamina].forEach((v, k) => {
        for (let s = 0; s < 5; s++) {
          g.fillStyle(s < v ? 0xffd23c : 0x3a3a5a);
          g.fillRect(222 + s * 14, 196 + k * 13, 11, 8);
        }
      });
    }
    confirm() {
      if (this.leaving) return;
      this.leaving = true;
      RR.SFX.unlock(); RR.SFX.bell();
      const player = RR.ROSTER[this.sel];
      const others = Phaser.Utils.Array.Shuffle(RR.ROSTER.filter((c) => c.id !== player.id));
      this.registry.set('run', { player: player.id, opponents: others.map((c) => c.id), stage: 0 });
      this.cameras.main.fadeOut(300, 255, 255, 255);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Match'));
    }
    update(_, delta) {
      animateCrowd(this, this.arena, delta / 1000, 0.3);
      const I = RR.Input;
      if (I.consume('left')) this.pick(this.sel - 1);
      if (I.consume('right')) this.pick(this.sel + 1);
      if (I.consume('start') || I.consume('punch') || I.consume('jump')) this.confirm();
    }
  }

  // ---- Match ---------------------------------------------------------------------
  const LEVELS = [0.3, 0.6, 0.9];
  const MATCH_TIME = 120;

  class Match extends Phaser.Scene {
    constructor() { super('Match'); }

    create() {
      const run = this.registry.get('run');
      this.run = run;
      const byId = (id) => RR.ROSTER.find((c) => c.id === id);
      this.cameras.main.fadeIn(300, 255, 255, 255);
      RR.Input.clear();
      RR.Input.showTouch(true);

      this.arena = buildArena(this);
      this.excite = 0.2;
      this.hitstop = 0;
      this.pin = null;
      this.timeLeft = MATCH_TIME;
      this.phase = 'intro';
      this.phaseT = 0;
      this.paused = false;

      const level = LEVELS[Math.min(run.stage, LEVELS.length - 1)];
      this.p1 = new RR.Fighter(this, byId(run.player), 150, 204, 1, { cpu: false });
      this.p2 = new RR.Fighter(this, byId(run.opponents[run.stage]), 330, 204, -1, { cpu: true, level });
      this.p1.opp = this.p2; this.p2.opp = this.p1;

      this.buildHud();
      this.banner(`STAGE ${run.stage + 1}`, 18, '#ffffff', 900);
      this.time.delayedCall(950, () => { this.banner('FIGHT!', 28, '#ffd23c', 700); RR.SFX.bell(); RR.SFX.cheer(); });
      this.time.delayedCall(1300, () => { this.phase = 'fight'; RR.Input.clear(); });
    }

    // ---- HUD --------------------------------------------------------------------
    buildHud() {
      const D = 600;
      this.hud = this.add.graphics().setDepth(D);
      const mk = (f, right) => {
        const px = right ? W - 26 : 26;
        this.add.image(px, 24, 'p-' + f.def.id).setScale(1.5).setDepth(D).setFlipX(right);
        txt(this, right ? W - 48 : 48, 12, f.def.name, 8, '#ffffff', { ox: right ? 1 : 0, thick: 3 }).setDepth(D);
        txt(this, right ? W - 48 : 48, 42, right ? 'CPU' : '1P', 6, right ? '#ff8a9a' : '#8ad8ff', { ox: right ? 1 : 0, thick: 2 }).setDepth(D);
        f.lagHp = f.hp;
      };
      mk(this.p1, false); mk(this.p2, true);
      txt(this, W / 2, 12, `${this.run.stage + 1}/${this.run.opponents.length}`, 7, '#ffd23c', { thick: 2 }).setDepth(D);
      this.timerText = txt(this, W / 2, 256, '2:00', 16, '#ffb02a', { stroke: '#d02a50', thick: 4 }).setDepth(D);
      this.pinText = txt(this, W / 2, 104, '', 40, '#ffffff', { stroke: '#d02a50', thick: 8 }).setDepth(D + 5).setVisible(false);
      this.mashText = txt(this, W / 2, 150, 'MASH BUTTONS!', 10, '#ffd23c').setDepth(D + 5).setVisible(false);

      const pauseBtn = txt(this, W / 2, 34, 'II', 10, '#ffffff', { thick: 3 }).setDepth(D).setInteractive({ useHandCursor: true });
      pauseBtn.on('pointerup', () => this.togglePause());
    }

    drawBars() {
      const g = this.hud; g.clear();
      const bar = (f, x, right) => {
        const w = 150, h = 9, y = 22;
        const pct = f.hp / f.maxHp;
        f.lagHp = Math.max(f.hp, (f.lagHp || f.hp) - 30 * this.dtSec);
        const lag = f.lagHp / f.maxHp;
        g.fillStyle(0x140818); g.fillRect(x - 2, y - 2, w + 4, h + 4);
        g.fillStyle(0x3a2a4a); g.fillRect(x, y, w, h);
        const fillW = (p) => Math.round(w * p);
        g.fillStyle(0xff3a3a);
        if (right) g.fillRect(x + w - fillW(lag), y, fillW(lag), h); else g.fillRect(x, y, fillW(lag), h);
        const col = pct > 0.5 ? 0x4ce05a : pct > 0.25 ? 0xffd23c : 0xff6a2a;
        g.fillStyle(col);
        if (right) g.fillRect(x + w - fillW(pct), y, fillW(pct), h); else g.fillRect(x, y, fillW(pct), h);
        g.fillStyle(0xffffff, 0.35); g.fillRect(x, y, w, 2);
      };
      bar(this.p1, 48, false);
      bar(this.p2, W - 48 - 150, true);
      if (this.pin && !this.pin.d.isCpu && this.pin.need < 99) {
        const p = Math.min(1, this.pin.mash / this.pin.need);
        g.fillStyle(0x140818); g.fillRect(W / 2 - 52, 160, 104, 10);
        g.fillStyle(0xffd23c); g.fillRect(W / 2 - 50, 162, Math.round(100 * p), 6);
      }
    }

    banner(str, size, color, ms) {
      const t = txt(this, W / 2, 110, str, size, color, { stroke: '#d02a50', thick: 6 }).setDepth(700).setScale(2).setAlpha(0);
      this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 180, ease: 'Back.out' });
      this.tweens.add({ targets: t, alpha: 0, delay: ms, duration: 200, onComplete: () => t.destroy() });
      return t;
    }

    // ---- input -------------------------------------------------------------------
    playerInput() {
      const I = RR.Input;
      return {
        mx: (I.held.right ? 1 : 0) - (I.held.left ? 1 : 0),
        my: (I.held.down ? 1 : 0) - (I.held.up ? 1 : 0),
        punch: I.consume('punch'), grab: I.consume('grab'), jump: I.consume('jump')
      };
    }

    cpuInput(f, dt) {
      const o = f.opp, ai = f.ai, L = f.level;
      const inp = { mx: 0, my: 0, punch: false, grab: false, jump: false };
      const rnd = Math.random;
      ai.timer -= dt;

      if (f.state === 'grabbed') { if (rnd() < dt * (2 + L * 9)) inp.punch = true; return inp; }
      if (f.state === 'grabbing') {
        if (!ai.grabChoice) ai.grabChoice = rnd() < 0.45 ? 'jump' : rnd() < 0.6 ? 'grab' : 'punch';
        if (f.t > 0.45 - L * 0.2) { inp[ai.grabChoice] = true; if (ai.grabChoice !== 'punch') ai.grabChoice = null; }
        return inp;
      }
      ai.grabChoice = null;
      if (f.state === 'jump') { if (Math.abs(o.x - f.x) < 52) inp.punch = true; return inp; }
      if (!f.canAct()) return inp;

      const dx = o.x - f.x, dy = o.y - f.y, adx = Math.abs(dx), ady = Math.abs(dy);

      // Opponent on the mat: go for the pin when it makes sense
      if (o.isDown()) {
        if (ai.pinFor !== o.downId) { ai.pinFor = o.downId; ai.wantPin = o.hp <= 0 || rnd() < (1 - o.hp / o.maxHp) * (0.6 + L); }
        if (ai.wantPin) {
          if (adx < 30 && ady < 12 && o.t > 0.35) { inp.grab = true; return inp; }
          inp.mx = Math.sign(dx); inp.my = ady > 4 ? Math.sign(dy) : 0;
          return inp;
        }
        inp.mx = adx < 70 ? -Math.sign(dx) : 0;
        return inp;
      }

      if (ai.timer <= 0) {
        ai.timer = 0.62 - L * 0.4 + rnd() * 0.25;
        const threat = (o.state === 'punch' || o.state === 'kick') && adx < 50;
        if (threat && rnd() < L * 0.6) ai.intent = 'evade';
        else if (adx > 50 && adx < 95 && ady < 10 && rnd() < 0.12 + L * 0.15) ai.intent = 'jumpkick';
        else if (adx < 34 && ady < 10) {
          const r = rnd();
          ai.intent = r < 0.5 ? 'punch' : r < 0.82 ? 'grab' : 'retreat';
        } else ai.intent = 'approach';
      }

      switch (ai.intent) {
        case 'punch': inp.punch = true; ai.intent = 'approach'; ai.timer = Math.max(ai.timer, 0.15); break;
        case 'grab':
          if (adx < 28 && ady < 10) { inp.grab = true; ai.intent = 'approach'; }
          else { inp.mx = Math.sign(dx); inp.my = ady > 3 ? Math.sign(dy) : 0; }
          break;
        case 'jumpkick': inp.jump = true; inp.mx = Math.sign(dx); ai.intent = 'approach'; break;
        case 'evade': inp.my = f.y > 200 ? -1 : 1; inp.mx = -Math.sign(dx) * 0.5; break;
        case 'retreat': inp.mx = -Math.sign(dx); break;
        default: {
          const targetX = o.x - Math.sign(dx || 1) * 22;
          if (Math.abs(targetX - f.x) > 4) inp.mx = Math.sign(targetX - f.x);
          if (ady > 3) inp.my = Math.sign(dy);
          // slower CPUs walk a bit less decisively
          if (rnd() > 0.55 + L * 0.45) { inp.mx = 0; inp.my = 0; }
        }
      }
      return inp;
    }

    // ---- combat callbacks ---------------------------------------------------------
    scaleDmg(a, d, base) {
      const cpuMult = a.isCpu ? 0.65 + 0.35 * a.level : 1;
      return base * a.power * d.toughness * cpuMult;
    }

    onHit(a, d, base, kind) {
      d.takeDamage(this.scaleDmg(a, d, base));
      const now = this.time.now / 1000;
      d.combo = now - d.lastHit < 0.9 ? d.combo + 1 : 1;
      d.lastHit = now;
      d.facing = -a.facing;
      const airborne = d.z > 0;
      const big = kind === 'knock' || d.combo >= 3 || airborne || d.hp <= 0;
      if (big) {
        d.setState('knock'); d.vx = a.facing * 150; d.vz = 170; d.combo = 0;
        this.hitstop = 0.1;
        this.cameras.main.shake(140, 0.008);
        RR.SFX.bigHit();
        this.excite = 1;
      } else {
        d.setState('hurt'); d.stun = 0.34; d.vx = a.facing * 70;
        this.hitstop = 0.055;
        RR.SFX.hit();
        this.excite = Math.min(1, this.excite + 0.15);
      }
      this.spark(d.x - a.facing * 6, d.y - d.z - 50 + Phaser.Math.Between(-6, 6), big ? 1.6 : 1);
    }

    onHeadbutt(a, d, base) {
      d.takeDamage(this.scaleDmg(a, d, base));
      this.hitstop = 0.06;
      RR.SFX.hit();
      this.spark((a.x + d.x) / 2, a.y - 64, 1.1);
      this.excite = Math.min(1, this.excite + 0.2);
      if (d.hp <= 0) { a.release(); d.setState('knock'); d.vx = a.facing * 120; d.vz = 150; }
    }

    onLand(f, base, attacker, thrown) {
      if (base && attacker) f.takeDamage(this.scaleDmg(attacker, f, base));
      f.setState('down');
      f.downId = (f.downId || 0) + 1;
      f.vx = thrown ? 0 : f.vx * 0.3;
      f.downTime = f.hp <= 0 ? Infinity : thrown ? 1.35 : 1.0;
      f.combo = 0;
      this.dust(f.x, f.y, thrown ? 10 : 5);
      this.cameras.main.shake(thrown ? 220 : 120, thrown ? 0.014 : 0.006);
      RR.SFX.slam();
      if (thrown) { this.hitstop = 0.08; RR.SFX.cheer(); this.excite = 1; }
      if (f.hp <= 0) this.banner('K.O.!', 24, '#ff4a5a', 800);
    }

    startPin(a, d) {
      if (this.pin) return;
      a.setState('pinning');
      a.facing = d.facing === 0 ? 1 : -d.facing;
      a.x = d.x + d.facing * -2;
      a.y = d.y + 2;
      d.setState('pinned');
      const hpPct = d.hp / d.maxHp;
      this.pin = {
        a, d, t: 0, count: 0, mash: 0, kickAt: null,
        need: d.hp <= 0 ? 99 : 5 + Math.round((1 - hpPct) * 16)
      };
      this.mashText.setVisible(!d.isCpu && d.hp > 0);
      RR.SFX.grab();
    }

    updatePin(dt) {
      const p = this.pin;
      p.t += dt;
      if (!p.d.isCpu) {
        const I = RR.Input;
        if (I.consume('punch') || I.consume('grab') || I.consume('jump')) p.mash += 1;
        p.mash = Math.max(0, p.mash - dt * 1.6);
        if (p.mash >= p.need) { this.kickOut(); return; }
      } else if (p.kickAt != null && p.t >= p.kickAt) { this.kickOut(); return; }

      if (p.t >= 0.85) {
        p.t = 0;
        p.count++;
        RR.SFX.count();
        this.pinText.setText(String(p.count)).setVisible(true).setScale(1.6);
        this.tweens.add({ targets: this.pinText, scale: 1, duration: 160 });
        if (p.count >= 3) { this.mashText.setVisible(false); this.endMatch(p.a, 'PINFALL'); return; }
        if (p.d.isCpu && p.d.hp > 0) {
          const hp = p.d.hp / p.d.maxHp;
          const chance = Math.min(0.97, hp * 1.7 + 0.04) * (p.count === 1 ? 1 : 0.75);
          if (Math.random() < chance) p.kickAt = 0.25 + Math.random() * 0.5;
        }
      }
    }

    kickOut() {
      const { a, d } = this.pin;
      this.pin = null;
      this.pinText.setVisible(false);
      this.mashText.setVisible(false);
      d.setState('getup');
      a.setState('hurt'); a.stun = 0.45; a.vx = -a.facing * 120;
      this.banner('KICK OUT!', 14, '#ffffff', 600);
      RR.SFX.whiff();
      this.excite = 1;
    }

    endMatch(winner, reason) {
      if (this.phase === 'over') return;
      this.phase = 'over';
      this.pin = null;
      RR.Input.showTouch(false);
      RR.SFX.bell(); RR.SFX.cheer();
      this.excite = 1;
      const loser = winner ? winner.opp : null;
      if (winner) {
        winner.setState('win');
        if (loser.state !== 'pinned' && loser.state !== 'down') loser.setState('lose');
        winner.x = Phaser.Math.Clamp(winner.x, 80, 400);
      }
      const youWin = winner === this.p1;
      this.time.delayedCall(700, () => {
        this.pinText.setVisible(false);
        const title = !winner ? 'DRAW' : youWin ? 'YOU WIN!' : 'YOU LOSE';
        txt(this, W / 2, 92, reason, 10, '#ffffff').setDepth(700);
        const t = txt(this, W / 2, 118, title, 26, youWin ? '#ffd23c' : '#ff6a7a', { stroke: '#140818', thick: 6 }).setDepth(700).setScale(0.2);
        this.tweens.add({ targets: t, scale: 1, duration: 300, ease: 'Back.out' });
      });
      this.time.delayedCall(1700, () => this.showResultButtons(youWin, !winner));
    }

    showResultButtons(youWin, draw) {
      const run = this.run;
      const last = run.stage >= run.opponents.length - 1;
      const restart = () => this.scene.restart();
      const toMenu = () => this.scene.start('Title');
      let primary;
      if (youWin) {
        primary = () => {
          if (last) { this.scene.start('Champion'); return; }
          run.stage++; this.registry.set('run', run); restart();
        };
        button(this, W / 2, 160, last ? 'CLAIM BELT' : 'NEXT MATCH', primary).setDepth(720);
      } else {
        primary = restart;
        button(this, W / 2 - 60, 160, draw ? 'REMATCH' : 'RETRY', restart).setDepth(720);
        button(this, W / 2 + 60, 160, 'MENU', toMenu, 0x3050e0).setDepth(720);
      }
      txt(this, W / 2, 184, RR.isTouch ? '' : 'ENTER = ' + (youWin ? 'NEXT' : 'RETRY') + (youWin ? '' : '   K = MENU'), 6, '#a0a0c8', { thick: 2 }).setDepth(720);
      RR.Input.clear();
      this.resultKeys = { primary, secondary: youWin ? null : toMenu };
    }

    // ---- pause ---------------------------------------------------------------------
    togglePause() {
      if (this.phase !== 'fight') return;
      this.paused = !this.paused;
      if (this.paused) {
        RR.Input.showTouch(false);
        const D = 800;
        const items = [
          this.add.rectangle(0, 0, W, H, 0x000000, 0.6).setOrigin(0).setDepth(D).setInteractive(),
          txt(this, W / 2, 70, 'PAUSED', 20, '#ffd23c').setDepth(D + 1)
        ];
        const resume = button(this, W / 2, 112, 'RESUME', () => this.togglePause()).setDepth(D + 1);
        const snd = button(this, W / 2, 144, RR.SFX.isMuted() ? 'SOUND OFF' : 'SOUND ON', () => {
          snd.t.setText(RR.SFX.toggleMute() ? 'SOUND OFF' : 'SOUND ON');
        }, 0x3050e0).setDepth(D + 1);
        const quit = button(this, W / 2, 176, 'QUIT', () => { this.paused = false; this.scene.start('Title'); }, 0x3050e0).setDepth(D + 1);
        this.pauseItems = { items, buttons: [resume, snd, quit] };
        RR.Input.clear();
      } else {
        this.pauseItems.items.forEach((i) => i.destroy());
        this.pauseItems.buttons.forEach((b) => b.destroy());
        RR.Input.showTouch(true);
        RR.Input.clear();
      }
    }

    // ---- effects -----------------------------------------------------------------
    spark(x, y, s) {
      const img = this.add.image(x, y, 'spark').setDepth(500).setScale(s * 1.2).setRotation(Math.random());
      this.tweens.add({ targets: img, scale: s * 2.6, alpha: 0, duration: 200, onComplete: () => img.destroy() });
    }
    dust(x, y, n) {
      for (let i = 0; i < n; i++) {
        const d = this.add.image(x + Phaser.Math.Between(-20, 20), y - 2, 'dust').setDepth(y + 11).setAlpha(0.8).setScale(1);
        this.tweens.add({
          targets: d, x: d.x + Phaser.Math.Between(-24, 24), y: y - Phaser.Math.Between(6, 22),
          alpha: 0, scale: 2.2, duration: 420, onComplete: () => d.destroy()
        });
      }
    }

    separate() {
      const a = this.p1, b = this.p2;
      const solid = (f) => f.grounded() && (f.state === 'idle' || f.state === 'walk' || f.state === 'punch' || f.state === 'recover' || f.state === 'whiff' || f.state === 'hurt');
      if (!solid(a) || !solid(b)) return;
      const dx = b.x - a.x, dy = b.y - a.y;
      if (Math.abs(dx) < 18 && Math.abs(dy) < 9) {
        const push = (18 - Math.abs(dx)) / 2, s = Math.sign(dx) || 1;
        a.x -= s * push; b.x += s * push;
      }
    }

    // ---- main loop -----------------------------------------------------------------
    update(_, delta) {
      const dt = Math.min(delta / 1000, 1 / 30);
      this.dtSec = dt;
      this.excite = Math.max(0.15, this.excite - dt * 0.35);
      animateCrowd(this, this.arena, dt, this.excite);

      if (this.phase === 'fight' && RR.Input.consume('start')) this.togglePause();
      if (this.paused) return;

      if (this.hitstop > 0) { this.hitstop -= dt; this.drawBars(); return; }

      const none = { mx: 0, my: 0, punch: false, grab: false, jump: false };
      if (this.phase === 'fight') {
        this.timeLeft = Math.max(0, this.timeLeft - dt);
        if (this.pin) this.updatePin(dt);
        const pi = this.pin ? none : this.playerInput();
        const ci = this.pin ? none : this.cpuInput(this.p2, dt);
        this.p1.update(dt, pi);
        this.p2.update(dt, ci);
        this.separate();
        if (this.timeLeft <= 0 && !this.pin && this.phase === 'fight') {
          const a = this.p1.hp / this.p1.maxHp, b = this.p2.hp / this.p2.maxHp;
          this.endMatch(Math.abs(a - b) < 0.001 ? null : a > b ? this.p1 : this.p2, 'TIME UP - DECISION');
        }
      } else {
        this.p1.update(dt, none);
        this.p2.update(dt, none);
        if (this.phase === 'over' && this.resultKeys) {
          const I = RR.Input;
          if (I.consume('start') || I.consume('punch') || I.consume('jump')) { const f = this.resultKeys.primary; this.resultKeys = null; f(); return; }
          if (this.resultKeys.secondary && I.consume('grab')) { const f = this.resultKeys.secondary; this.resultKeys = null; f(); return; }
        }
      }
      this.p1.render(); this.p2.render();

      const s = Math.ceil(this.timeLeft);
      this.timerText.setText(Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'));
      this.timerText.setColor(s <= 10 ? '#ff4a5a' : '#ffb02a');
      this.drawBars();
    }
  }

  // ---- Champion ----------------------------------------------------------------------
  class Champion extends Phaser.Scene {
    constructor() { super('Champion'); }
    create() {
      RR.Input.showTouch(false);
      RR.Input.clear();
      this.cameras.main.fadeIn(400, 255, 255, 255);
      this.arena = buildArena(this);
      const run = this.registry.get('run');
      const c = RR.ROSTER.find((r) => r.id === run.player);
      this.add.sprite(W / 2, 220, 'f-' + c.id).setScale(3).setOrigin(0.5, RR.FOOT_Y / RR.FH).setDepth(300).play(c.id + '-win');
      const t = txt(this, W / 2, 50, 'CHAMPION!', 30, '#ffd23c', { stroke: '#d02a50', thick: 8 }).setDepth(700);
      this.tweens.add({ targets: t, scale: 1.08, duration: 500, yoyo: true, repeat: -1 });
      txt(this, W / 2, 84, c.name + ' HOLDS THE BELT', 8, '#ffffff').setDepth(700);
      button(this, W / 2, 252, 'PLAY AGAIN', () => this.scene.start('Select')).setDepth(700);
      RR.SFX.bell(); RR.SFX.cheer();
      const colors = [0xffd23c, 0xff4a5a, 0x3ac8ff, 0x4ce05a, 0xffffff];
      this.time.addEvent({
        delay: 60, loop: true, callback: () => {
          const d = this.add.rectangle(Phaser.Math.Between(0, W), -4, 3, 5, Phaser.Utils.Array.GetRandom(colors)).setDepth(650);
          this.tweens.add({ targets: d, y: H + 10, x: d.x + Phaser.Math.Between(-40, 40), angle: 540, duration: Phaser.Math.Between(1600, 2600), onComplete: () => d.destroy() });
        }
      });
    }
    update(_, delta) {
      animateCrowd(this, this.arena, delta / 1000, 1);
      if (RR.Input.consume('start') || RR.Input.consume('punch')) this.scene.start('Select');
    }
  }

  // ---- launch -----------------------------------------------------------------------
  function start() {
    // eslint-disable-next-line no-new
    global.RR.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      width: W, height: H,
      backgroundColor: '#000000',
      pixelArt: true,
      roundPixels: true,
      input: { activePointers: 4 },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, fullscreenTarget: 'game' },
      scene: [Boot, Title, Select, Match, Champion, RR.ControlsScene]
    });
  }

  const fontReady = document.fonts && document.fonts.load ? document.fonts.load('16px "Press Start 2P"') : Promise.resolve();
  Promise.race([fontReady, new Promise((r) => setTimeout(r, 1500))]).then(start, start);
})(window);
