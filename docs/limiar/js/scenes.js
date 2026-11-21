/* LIMIAR — cenas: Boot, Título, Abertura, Mapa, Fase (corredor ou chefe), Fim de Ato. */
(function (global) {
  'use strict';
  const LIM = global.LIM;
  const W = 480, H = 270;
  const FONT = '"Press Start 2P", monospace';
  const AMBER = '#e0aa5c';
  const SPEAKERS = {
    aren: ['AREN', 'pt-aren'], courier: ['MENSAGEIRO', 'pt-courier'], narrador: ['NARRADOR', 'pt-narrador'],
    vigia: ['VIGIA DE BRONZE', 'pt-vigia'], eco: ['ECO DE AREN', 'pt-eco'], lira: ['LIRA', 'pt-lira']
  };

  // A fonte Press Start 2P não tem maiúsculas acentuadas: normaliza só essas.
  const CAPS = { Á: 'A', À: 'A', Â: 'A', Ã: 'A', É: 'E', Ê: 'E', Í: 'I', Ó: 'O', Ô: 'O', Õ: 'O', Ú: 'U', Ç: 'C' };
  const fixCaps = (s) => String(s).replace(/[ÁÀÂÃÉÊÍÓÔÕÚÇ]/g, (c) => CAPS[c]);
  LIM.fixCaps = fixCaps;
  const origSetText = Phaser.GameObjects.Text.prototype.setText;
  Phaser.GameObjects.Text.prototype.setText = function (v) {
    return origSetText.call(this, Array.isArray(v) ? v.map(fixCaps) : (v == null ? v : fixCaps(v)));
  };

  function txt(scene, x, y, s, size, color, o) {
    o = o || {};
    const t = scene.add.text(x, y, fixCaps(s), {
      fontFamily: FONT, fontSize: (size || 8) + 'px', color: color || '#f4e6c8',
      stroke: o.stroke || '#08060c', strokeThickness: o.thick != null ? o.thick : Math.max(2, Math.round((size || 8) / 3)),
      align: o.align || 'center', wordWrap: o.wrap ? { width: o.wrap } : undefined, lineSpacing: o.ls || 3
    });
    return t.setOrigin(o.ox != null ? o.ox : 0.5, o.oy != null ? o.oy : 0.5);
  }

  function button(scene, x, y, label, cb, opts) {
    opts = opts || {};
    const w = opts.w || Math.max(96, label.length * 7 + 26);
    const col = opts.color || 0x2a1c2c;
    const bg = scene.add.rectangle(x, y, w, 22, col, 0.92).setStrokeStyle(1, opts.disabled ? 0x5a5060 : 0xe0aa5c);
    const t = txt(scene, x, y + 1, label, 6, opts.disabled ? '#7a7080' : '#f4e6c8', { thick: 2 });
    if (!opts.disabled) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => bg.setFillStyle(0x4a2c2c));
      bg.on('pointerout', () => bg.setFillStyle(col));
      bg.on('pointerup', () => { LIM.SFX.select(); cb(); });
    }
    const api = { bg, t, destroy() { bg.destroy(); t.destroy(); }, depth(d) { bg.setDepth(d); t.setDepth(d + 1); return api; }, fixed() { bg.setScrollFactor(0); t.setScrollFactor(0); return api; } };
    return api;
  }

  function parallax(scene, theme) {
    const sky = scene.add.image(0, 0, 'bg-' + theme + '-sky').setOrigin(0).setScale(2).setScrollFactor(0).setDepth(0);
    const far = scene.add.tileSprite(0, -10, 240, 135, 'bg-' + theme + '-far').setOrigin(0).setScale(2).setScrollFactor(0).setDepth(1);
    const mid = scene.add.tileSprite(0, -12, 240, 135, 'bg-' + theme + '-mid').setOrigin(0).setScale(2).setScrollFactor(0).setDepth(2);
    const ground = scene.add.tileSprite(0, 180, 240, 45, 'bg-' + theme + '-ground').setOrigin(0).setScale(2).setScrollFactor(0).setDepth(2.5);
    return {
      sky, far, mid, ground,
      update(sx) { far.tilePositionX = sx * 0.1; mid.tilePositionX = sx * 0.25; ground.tilePositionX = sx * 0.5; }
    };
  }

  function goFullscreen(scene) {
    if (scene.scale.isFullscreen) { scene.scale.stopFullscreen(); return; }
    scene.scale.startFullscreen();
    try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* não suportado */ }
  }

  function fadeTo(scene, key, data) {
    if (scene._leaving) return;
    scene._leaving = true;
    scene.cameras.main.fadeOut(350, 0, 0, 0);
    scene.cameras.main.once('camerafadeoutcomplete', () => scene.scene.start(key, data));
  }

  // ---- Boot ---------------------------------------------------------------------------------
  class Boot extends Phaser.Scene {
    constructor() { super('Boot'); }
    create() {
      LIM.buildArt(this);
      this.scene.launch('Controls');
      this.scene.start('Title');
    }
  }

  // ---- Título ----------------------------------------------------------------------------------
  class Title extends Phaser.Scene {
    constructor() { super('Title'); }
    limits() { return { x0: 0, x1: W }; }
    create() {
      this._leaving = false; this.now = 0; this.wind = -20;
      LIM.Input.showTouch(false); LIM.Input.clear();
      this.cameras.main.fadeIn(500);
      this.bg = parallax(this, 'gate');
      this.add.rectangle(0, 0, W, H, 0x000000, 0.3).setOrigin(0).setDepth(3);
      this.hero = new LIM.Actor(this, 'aren', 110, 236, 1);
      this.hero.sprite.setDepth(300);
      this.add.text(0, 0, '').setVisible(false);
      const logo = txt(this, 300, 58, 'LIMIAR', 34, AMBER, { stroke: '#2a0c10', thick: 7 }).setDepth(500);
      txt(this, 300, 90, 'A ÚLTIMA SOMBRA', 9, '#f4e6c8').setDepth(500);
      this.tweens.add({ targets: logo, alpha: 0.85, duration: 1400, yoyo: true, repeat: -1 });
      const has = LIM.Save.exists() && (LIM.Save.data.unlocked > 1 || Object.keys(LIM.Save.data.done).length);
      let y = 126;
      if (has) { button(this, 300, y, 'CONTINUAR', () => fadeTo(this, 'Map'), { w: 150 }).depth(500); y += 28; }
      button(this, 300, y, 'NOVO JOGO', () => { LIM.SFX.unlock(); LIM.Save.reset(); fadeTo(this, 'Intro'); }, { w: 150 }).depth(500); y += 28;
      const snd = button(this, 262, y, LIM.SFX.isMuted() ? 'SOM: NÃO' : 'SOM: SIM', () => { snd.t.setText(LIM.SFX.toggleMute() ? 'SOM: NÃO' : 'SOM: SIM'); }, { w: 74 }).depth(500);
      button(this, 338, y, 'TELA CHEIA', () => goFullscreen(this), { w: 74 }).depth(500);
      txt(this, W / 2, 262, 'PHASER 3 (MIT) · PRESS START 2P (OFL) · ARTE E SOM GERADOS EM CÓDIGO', 5, '#8a7a8a', { thick: 2 }).setDepth(500);
      this.input.once('pointerdown', () => LIM.SFX.unlock());
    }
    update(_, d) {
      const dt = Math.min(d / 1000, 1 / 30); this.now += dt;
      this.hero.t += dt; this.hero.play('idle'); this.hero.finish(dt); this.hero.render();
      this.bg.update(this.now * 8);
      if (LIM.Input.consume('start')) fadeTo(this, LIM.Save.data.unlocked > 1 ? 'Map' : 'Intro');
    }
  }

  // ---- Diálogo (componente reutilizável) -----------------------------------------------------
  class Dialogue {
    constructor(scene) {
      this.scene = scene; this.active = false;
      const D = 950;
      this.box = scene.add.rectangle(0, 200, W, 70, 0x08060c, 0.9).setOrigin(0).setScrollFactor(0).setDepth(D).setStrokeStyle(1, 0xe0aa5c);
      this.pt = scene.add.image(26, 228, 'pt-aren').setScale(1.4).setScrollFactor(0).setDepth(D + 1);
      this.name = txt(scene, 52, 208, '', 6, AMBER, { ox: 0, thick: 2 }).setScrollFactor(0).setDepth(D + 1);
      this.body = txt(scene, 52, 220, '', 7, '#f4e6c8', { ox: 0, oy: 0, align: 'left', wrap: 410, thick: 2, ls: 5 }).setScrollFactor(0).setDepth(D + 1);
      this.hint = txt(scene, W - 10, 262, '>>', 6, AMBER, { ox: 1, thick: 2 }).setScrollFactor(0).setDepth(D + 1);
      this.set(false);
      scene.input.on('pointerup', () => { if (this.active) this.advance(); });
    }
    set(v) { [this.box, this.pt, this.name, this.body, this.hint].forEach((o) => o.setVisible(v)); this.active = v; }
    open(lines, done) {
      this.lines = lines.slice(); this.done = done; this.idx = -1;
      this.set(true); LIM.Input.showTouch(false); LIM.Input.clear();
      this.next();
    }
    next() {
      this.idx++;
      if (this.idx >= this.lines.length) {
        this.set(false); LIM.Input.clear();
        const d = this.done; this.done = null;
        if (d) d();
        return;
      }
      const [who, text] = this.lines[this.idx];
      const sp = SPEAKERS[who] || [who.toUpperCase(), 'pt-narrador'];
      this.name.setText(sp[0]); this.pt.setTexture(sp[1]);
      this.full = text; this.shown = 0; this.body.setText('');
    }
    advance() {
      if (this.shown < this.full.length) { this.shown = this.full.length; this.body.setText(this.full); }
      else this.next();
    }
    update(dt) {
      if (!this.active) return;
      if (this.shown < this.full.length) {
        const before = Math.floor(this.shown);
        this.shown = Math.min(this.full.length, this.shown + dt * 48);
        if (Math.floor(this.shown) !== before && before % 3 === 0) LIM.SFX.blip();
        this.body.setText(this.full.slice(0, Math.floor(this.shown)));
      }
      this.hint.setAlpha(Math.floor(this.scene.time.now / 300) % 2 ? 1 : 0.2);
      if (LIM.Input.anyAction()) this.advance();
    }
  }

  // ---- Abertura cinematográfica ---------------------------------------------------------------
  class Intro extends Phaser.Scene {
    constructor() { super('Intro'); }
    create() {
      this._leaving = false;
      LIM.Input.showTouch(false); LIM.Input.clear();
      this.cameras.main.fadeIn(600);
      this.layer = this.add.container(0, 0);
      this.dlg = new Dialogue(this);
      button(this, W - 40, 14, 'PULAR', () => this.finish(), { w: 60 }).depth(990);
      this.screen(0);
    }
    screen(i) {
      this.layer.removeAll(true);
      const add = (o) => { this.layer.add(o); return o; };
      if (i === 0) {
        add(this.add.image(0, 0, 'bg-street-sky').setOrigin(0).setScale(2));
        add(this.add.image(0, -10, 'bg-street-far').setOrigin(0).setScale(2));
        add(txt(this, W / 2, 30, 'ARCOS · O ÚLTIMO AMANHECER', 8, AMBER));
        const dark = add(this.add.rectangle(0, 0, W, H, 0x000000, 0).setOrigin(0));
        this.tweens.add({ targets: dark, fillAlpha: 0.55, duration: 4000 });
        this.dlg.open([['narrador', 'Na noite em que o sol parou, não perdemos a luz. Perdemos o que nos ligava uns aos outros.']], () => this.screen(1));
      } else if (i === 1) {
        add(this.add.rectangle(0, 0, W, H, 0x0a0810).setOrigin(0));
        add(this.add.rectangle(300, 70, 70, 90, 0x3a2440));
        add(this.add.rectangle(300, 70, 62, 82, 0xd6a65a, 0.25));
        add(this.add.sprite(200, 180, 'c-aren', 'sit').setScale(2).setOrigin(0.5, 1));
        add(this.add.rectangle(206, 152, 10, 4, 0xd42a2a));
        add(this.add.rectangle(250, 176, 12, 8, 0xf4e6c8));
        add(txt(this, W / 2, 30, 'UM QUARTO VAZIO', 8, AMBER));
        this.dlg.open([['aren', '"Encontre Lira antes que o céu abra..." Fui eu quem escreveu isto?']], () => this.screen(2));
      } else {
        add(this.add.image(0, 0, 'bg-street-sky').setOrigin(0).setScale(2));
        add(this.add.image(0, -12, 'bg-street-mid').setOrigin(0).setScale(2));
        add(this.add.image(0, 180, 'bg-street-ground').setOrigin(0).setScale(2));
        add(this.add.sprite(240, 230, 'c-courier', 'sit').setScale(2).setOrigin(0.5, 1));
        add(this.add.sprite(180, 232, 'c-errante', 'tele').setScale(2).setOrigin(0.5, 1));
        add(this.add.sprite(300, 232, 'c-errante', 'tele').setScale(2).setOrigin(0.5, 1).setFlipX(true));
        add(txt(this, W / 2, 30, 'A PRIMEIRA RUA', 8, AMBER));
        this.dlg.open([['narrador', 'Um mensageiro é cercado por sombras. A luta começa.']], () => this.finish());
      }
    }
    finish() { if (this._leaving) return; this.dlg.set(false); fadeTo(this, 'Stage', { id: 1 }); }
    update(_, d) { this.dlg.update(Math.min(d / 1000, 1 / 30)); }
  }

  // ---- Mapa do Ato -----------------------------------------------------------------------------
  class MapScene extends Phaser.Scene {
    constructor() { super('Map'); }
    create() {
      this._leaving = false;
      LIM.Input.showTouch(false); LIM.Input.clear();
      this.cameras.main.fadeIn(350);
      const S = LIM.Save.data, act = LIM.DATA.acts[0];
      this.add.image(0, 0, 'bg-street-sky').setOrigin(0).setScale(2);
      this.add.image(0, -10, 'bg-street-far').setOrigin(0).setScale(2).setAlpha(0.6);
      this.add.rectangle(0, 0, W, H, 0x08060c, 0.55).setOrigin(0);
      txt(this, 14, 14, 'ATO I — ' + act.name.toUpperCase(), 8, AMBER, { ox: 0 });
      txt(this, W - 12, 14, `AÇO ${S.steel}   ECO ${S.eco}   MEMÓRIAS ${S.memories.length}/3`, 5, '#f4e6c8', { ox: 1, thick: 2 });
      txt(this, 14, 30, act.environment, 5, '#a89aa8', { ox: 0, thick: 2 });

      const nodes = [[70, 112], [180, 82], [290, 112], [400, 82]];
      const g = this.add.graphics();
      g.lineStyle(2, 0x5a4a5a, 1);
      for (let i = 0; i < 3; i++) g.lineBetween(nodes[i][0], nodes[i][1], nodes[i + 1][0], nodes[i + 1][1]);
      this.sel = Math.min(S.unlocked, 4) - 1;
      this.nodes = nodes.map(([x, y], i) => {
        const id = i + 1, lvl = LIM.DATA.levels[i];
        const done = !!S.done[id], open = id <= S.unlocked;
        const c = this.add.circle(x, y, id === 4 ? 15 : 12, done ? 0xe0aa5c : open ? 0x2a1c2c : 0x18141c).setStrokeStyle(2, open ? 0xf4e6c8 : 0x3a3440);
        txt(this, x, y + 1, String(id).padStart(2, '0'), 7, done ? '#140a08' : open ? '#f4e6c8' : '#5a5060', { thick: 0 });
        txt(this, x, y + 24, lvl.name.toUpperCase(), 5, open ? '#f4e6c8' : '#5a5060', { thick: 2, wrap: 100 });
        if (open) { c.setInteractive({ useHandCursor: true }); c.on('pointerup', () => { if (this.sel === i) this.play(); else this.pick(i); }); }
        return { c, id, open };
      });
      this.ring = this.add.circle(0, 0, 18).setStrokeStyle(2, 0xe0aa5c);
      this.tweens.add({ targets: this.ring, scale: 1.15, duration: 500, yoyo: true, repeat: -1 });
      this.info = txt(this, 14, 142, '', 6, '#f4e6c8', { ox: 0, oy: 0, align: 'left', wrap: 300, thick: 2, ls: 5 });
      this.playBtn = button(this, 400, 170, 'JOGAR', () => this.play(), { w: 110 });
      // atos seguintes
      LIM.DATA.acts.slice(1).forEach((a, k) => {
        txt(this, 14 + (k % 3) * 156, 222 + Math.floor(k / 3) * 11, `ATO ${['II', 'III', 'IV', 'V', 'VI'][k]} · ${a.name.toUpperCase()}`, 4, '#5a5060', { ox: 0, thick: 1 });
      });
      txt(this, W / 2 + 30, 250, S.done[4] ? 'ATO I CONCLUÍDO · VIGIA: ' + (S.choices.boss_bronze === 'vincular' ? 'VINCULADO' : 'DISSIPADO') + ' · ATOS II–VI EM PRODUÇÃO' : 'ATOS II–VI EM PRODUÇÃO', 5, S.done[4] ? AMBER : '#5a5060', { thick: 2 });
      button(this, 40, 260, 'TÍTULO', () => fadeTo(this, 'Title'), { w: 60 });
      this.pick(this.sel);
    }
    pick(i) {
      if (!this.nodes[i].open) return;
      this.sel = i;
      const n = this.nodes[i], l = LIM.DATA.levels[i];
      this.ring.setPosition(n.c.x, n.c.y);
      this.info.setText(`${String(l.id).padStart(2, '0')} · ${l.name.toUpperCase()}\n${l.type.toUpperCase()}\n\nOBJETIVO: ${l.objective}`);
      LIM.SFX.select();
    }
    play() { fadeTo(this, 'Stage', { id: this.nodes[this.sel].id }); }
    update() {
      const I = LIM.Input;
      if (I.consume('left') && this.sel > 0) this.pick(this.sel - 1);
      if (I.consume('right') && this.sel < 3 && this.nodes[this.sel + 1].open) this.pick(this.sel + 1);
      if (I.consume('punch') || I.consume('start')) this.play();
    }
  }

  // ---- Fase ----------------------------------------------------------------------------------------
  class Stage extends Phaser.Scene {
    constructor() { super('Stage'); }

    create(data) {
      this._leaving = false;
      this.id = data.id; this.S = LIM.STAGES[this.id]; this.meta = this.S.meta;
      const S = this.S, save = LIM.Save.data;
      // a instância da cena é reaproveitada entre fases: zera todo o estado por fase
      Object.assign(this, {
        now: 0, hitstop: 0, paused: false, over: false, cleared: false, chosen: undefined,
        choiceUI: null, pauseUI: null, endKey: null, lockEv: null, runSteel: 0, flags: {},
        orbs: [], memory: null, memoryGlow: null, npc: null, boss: null, bossActive: false,
        guardTipShown: false, drops: null, exitMark: null
      });
      this.wind = S.rain ? -40 : -10;
      this.tokens = 2; this.lock = null;
      this.enemies = []; this.crates = [];
      LIM.Input.clear(); LIM.Input.showTouch(true);
      this.cameras.main.fadeIn(400);
      this.cameras.main.setBounds(0, 0, S.width, H);

      this.bg = parallax(this, S.theme);
      this.lamps = [];
      if (S.lamps) {
        for (let x = 120; x < S.width; x += 240) {
          const l = this.add.image(x, 198, 'lamp-on').setOrigin(0.5, 1).setScale(2).setDepth(5);
          const gl = this.add.image(x, 30, 'glow').setScale(2.2).setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
          this.lamps.push({ l, gl });
        }
      }
      this.darkness = this.add.rectangle(0, 0, W, H, 0x050310, 0).setOrigin(0).setScrollFactor(0).setDepth(700);
      (S.crates || []).forEach(([x, y]) => {
        const s = this.add.image(x, y, 'crate').setOrigin(0.5, 1).setScale(2).setDepth(10 + y);
        this.crates.push({ s, x, y, hp: 12 });
      });
      if (S.memory && !save.memories.includes(S.memory.id)) {
        const m = S.memory;
        this.memory = this.add.image(m.x, m.y - 20, 'memory').setScale(2).setDepth(10 + m.y);
        const gl = this.add.image(m.x, m.y - 20, 'glow').setScale(1.2).setDepth(9 + m.y).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: [this.memory, gl], y: m.y - 26, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        this.memoryGlow = gl;
      }
      if (S.npc) { this.npc = this.add.sprite(S.npc.x, S.npc.y, 'c-courier', 'sit').setScale(2).setOrigin(0.5, LIM.FRAME_H.courier.FOOT / LIM.FRAME_H.courier.FH).setDepth(10 + S.npc.y); }
      if (S.exit) {
        this.exitMark = this.add.container(S.exit.x, 0).setDepth(6);
        this.exitMark.add(this.add.rectangle(0, 120, 4, 120, 0xe0aa5c, 0.4));
        this.exitMark.add(txt(this, 0, 52, S.exit.label + ' >', 6, AMBER, { thick: 2 }));
      }
      this.doors = [];

      this.hero = new LIM.Actor(this, 'aren', S.boss ? 80 : 60, 224, 1);
      this.hero.eco = save.eco || 0;
      if (save.perks.dodge) this.hero.dodgeBonus = 0.06;

      if (S.rain) {
        this.drops = [];
        for (let i = 0; i < 110; i++) this.drops.push(this.add.image(Math.random() * W, Math.random() * H, 'rain').setScrollFactor(0).setDepth(720).setScale(2).setRotation(0.25));
      }

      this.events = S.events.map((e) => Object.assign({}, e));
      this.buildHud();
      this.dlg = new Dialogue(this);
      this.input.keyboard && this.input.keyboard.on('keydown-ESC', () => {});

      if (S.boss) {
        this.lock = [0, W];
        const b = S.bossSpawn;
        this.boss = new LIM.Actor(this, b.t, b.x, b.y, -1);
        this.enemies.push(this.boss);
        this.bossActive = false;
      }
    }

    limits() {
      if (this.lock) return { x0: this.lock[0] + 14, x1: this.lock[1] - 14 };
      return { x0: 16, x1: this.S.width - 16 };
    }

    // ---- HUD ------------------------------------------------------------------------------------------
    buildHud() {
      const D = 900, fix = (o) => o.setScrollFactor(0).setDepth(D);
      fix(this.add.image(20, 20, 'pt-aren'));
      this.hud = fix(this.add.graphics());
      fix(txt(this, 40, 27, 'ECO', 4, '#c8a8ff', { ox: 0, thick: 1 }));
      this.objective = fix(txt(this, W / 2, 10, 'OBJETIVO: ' + this.meta.objective, 5, '#e8d8b8', { wrap: 270, thick: 2, ls: 2 }));
      this.stats = fix(txt(this, W - 26, 10, '', 5, '#f4e6c8', { ox: 1, thick: 2 }));
      const pause = fix(txt(this, W - 12, 11, 'II', 8, '#f4e6c8', { thick: 3 }));
      pause.setInteractive({ useHandCursor: true }).on('pointerup', () => this.togglePause());
      this.toastText = fix(txt(this, W / 2, 72, '', 6, '#f4e6c8', { wrap: 360, thick: 2 })).setAlpha(0);
      this.tipText = fix(txt(this, W / 2, 56, '', 5, '#ffd890', { wrap: 380, thick: 2 })).setAlpha(0);
      this.advance = fix(txt(this, W - 26, 140, 'AVANCE\n>>', 7, AMBER, { thick: 3 })).setVisible(false);
      this.tweens.add({ targets: this.advance, x: W - 18, duration: 400, yoyo: true, repeat: -1 });
      if (this.S.boss) {
        this.bossName = fix(txt(this, W / 2, 34, 'VIGIA DE BRONZE', 6, '#f2c474', { thick: 2 })).setVisible(false);
      }
      this.worldG = this.add.graphics().setDepth(800);
    }

    drawHud() {
      const g = this.hud, h = this.hero; g.clear();
      const bar = (x, y, w, hh, pct, col, back) => {
        g.fillStyle(0x08060c); g.fillRect(x - 1, y - 1, w + 2, hh + 2);
        g.fillStyle(back || 0x2a2030); g.fillRect(x, y, w, hh);
        g.fillStyle(col); g.fillRect(x, y, Math.round(w * Phaser.Math.Clamp(pct, 0, 1)), hh);
      };
      bar(38, 9, 110, 7, h.hp / h.maxHp, h.hp / h.maxHp > 0.3 ? 0xe0aa5c : 0xd42a2a);
      bar(52, 20, 96, 4, h.eco / 100, h.eco >= 30 ? 0xb07aff : 0x6a4aa0);
      g.fillStyle(0xf4e6c8, 0.5); g.fillRect(52 + 96 * 0.3, 19, 1, 6); g.fillRect(52 + 96 * 0.5, 19, 1, 6);
      if (this.boss && this.bossActive) {
        const b = this.boss;
        bar(W / 2 - 110, 42, 220, 6, b.hp / b.maxHp, b.armor > 0 ? 0xffe08a : b.vulnerable > 0 ? 0xff6a4a : 0xc0763a);
        g.fillStyle(0xf4e6c8); g.fillRect(W / 2 - 110 + 220 * 0.5, 41, 1, 8); g.fillRect(W / 2 - 110 + 220 * 0.2, 41, 1, 8);
      }
      const save = LIM.Save.data;
      this.stats.setText(`AÇO ${save.steel + (this.runSteel || 0)}  MEM ${save.memories.length}/3`);
      const wg = this.worldG; wg.clear();
      this.enemies.forEach((e) => {
        if (e.boss || e.dead || e.hp >= e.maxHp) return;
        const x = e.x - 14, y = e.y - e.z - 74;
        wg.fillStyle(0x08060c); wg.fillRect(x - 1, y - 1, 30, 4);
        wg.fillStyle(0xd42a2a); wg.fillRect(x, y, Math.round(28 * e.hp / e.maxHp), 2);
        if (e.type === 'guarda' && e.guardBroken > 0) { wg.fillStyle(0xffd23c); wg.fillRect(x, y + 3, 28, 1); }
      });
    }

    toast(s) {
      this.toastText.setText(s).setAlpha(1);
      this.tweens.killTweensOf(this.toastText);
      this.tweens.add({ targets: this.toastText, alpha: 0, delay: 1400, duration: 400 });
    }
    tip(s) {
      this.tipText.setText(s).setAlpha(1);
      this.tweens.killTweensOf(this.tipText);
      this.tweens.add({ targets: this.tipText, alpha: 0, delay: 5500, duration: 600 });
    }
    banner(s, col) {
      const t = txt(this, W / 2, 110, s, 16, col || AMBER, { stroke: '#2a0c10', thick: 5 }).setScrollFactor(0).setDepth(960).setScale(1.8).setAlpha(0);
      this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 200, ease: 'Back.out' });
      this.tweens.add({ targets: t, alpha: 0, delay: 1100, duration: 300, onComplete: () => t.destroy() });
    }

    // ---- combate -----------------------------------------------------------------------------------
    takeToken() { if (this.tokens > 0) { this.tokens--; return true; } return false; }
    returnToken() { this.tokens = Math.min(2, this.tokens + 1); }

    resolveHit(att, def, m) {
      const res = def.defend(att, m);
      const hx = (att.x + def.x) / 2, hy = def.y - def.z - (def.boss ? 70 : 48);
      if (att.team === 'hero') {
        if (res === 'guard') {
          this.spark(def.x - def.facing * -10, hy, 0.9, 0xb0b0c0); LIM.SFX.block(); this.hitstop = 0.04;
          att.x -= att.facing * 10;
          if (!this.guardTipShown) { this.guardTipShown = true; this.toast('Escudo! Use CHUTE ou flanqueie.'); }
          return;
        }
        if (res === 'parried') {
          att.stagger(0.7); this.spark(hx, hy, 1.4, 0xffffff); LIM.SFX.parry(); this.hitstop = 0.09;
          this.toast('O Duelista aparou! Alterne SOCO e CHUTE.');
          att.recentKinds = [];
          return;
        }
        if (res === 'armor') { this.spark(hx, hy, 0.8, 0xffe08a); LIM.SFX.block(); this.hitstop = 0.03; return; }
        const mult = def.boss && def.vulnerable > 0 ? 1.6 : 1;
        def.takeHit(att, m, m.dmg * mult);
        att.eco = Math.min(100, att.eco + 5);
        this.spark(hx, hy, m.heavy ? 1.6 : 1, 0xfff2b0);
        if (m.heavy) { LIM.SFX.bigHit(); this.cameras.main.shake(110, 0.006); } else LIM.SFX.hit();
        this.hitstop = m.heavy ? 0.085 : 0.06;
        if (!def.boss && def.hp <= 0) this.runSteel = (this.runSteel || 0) + (def.A.steel || 0);
        if (def.boss && !this.bossActive) this.bossActive = true;
        return;
      }
      // inimigo atacando o herói
      if (res === 'parried') {
        if (att.boss) {
          if (att.armor > 0) { att.armor = 0; this.banner('ESCUDO QUEBRADO', '#ffe08a'); }
          att.vulnerable = 2.0; att.stagger(2.0); att.clearMark();
        } else att.stagger(0.9);
        def.eco = Math.min(100, def.eco + 10);
        this.spark(hx, hy, 2, 0xffd23c); LIM.SFX.parry(); this.hitstop = 0.09;
        this.cameras.main.flash(80, 255, 230, 160);
        this.toast('APARAR PERFEITO!');
        return;
      }
      if (res === 'blocked') {
        const chip = m.heavy ? m.dmg * 0.25 : 0;
        def.hp = Math.max(1, def.hp - chip);
        def.x -= (att.x > def.x ? 1 : -1) * (m.heavy ? 22 : 10);
        this.spark(hx, hy, 0.8, 0x9ab8ff); LIM.SFX.block(); this.hitstop = 0.04;
        return;
      }
      def.takeHit(att, m, m.dmg);
      this.spark(hx, hy, m.heavy ? 1.6 : 1, 0xff8a6a);
      LIM.SFX[m.heavy ? 'bigHit' : 'hit']();
      this.hitstop = 0.07;
      this.cameras.main.shake(m.heavy ? 160 : 80, m.heavy ? 0.01 : 0.004);
    }

    onLand(a) { this.dust(a.x, a.y, a.boss ? 10 : 5); LIM.SFX.slam(); this.cameras.main.shake(90, 0.005); }

    onDeath(a) {
      if (a === this.hero) { this.gameOver(); return; }
      a.dead = true; a.set('dead'); a.releaseToken();
      this.tweens.add({ targets: [a.sprite, a.shadow], alpha: 0, duration: 600, onComplete: () => { a.sprite.setVisible(false); a.shadow.setVisible(false); } });
    }

    ecoBurst(h) {
      const g = this.add.graphics().setDepth(h.sprite.depth + 1);
      const o = { r: 6 };
      this.tweens.add({
        targets: o, r: 90, duration: 320, onUpdate: () => { g.clear(); g.lineStyle(3, 0xb07aff, 1 - o.r / 100); g.strokeEllipse(h.x, h.y - 30, o.r * 2, o.r * 0.9); },
        onComplete: () => g.destroy()
      });
      this.cameras.main.flash(120, 160, 110, 255);
    }

    spark(x, y, s, tint) {
      const img = this.add.image(x, y, 'spark').setDepth(850).setScale(s).setTint(tint || 0xffffff).setRotation(Math.random());
      this.tweens.add({ targets: img, scale: s * 2.4, alpha: 0, duration: 190, onComplete: () => img.destroy() });
    }
    dust(x, y, n) {
      for (let i = 0; i < n; i++) {
        const d = this.add.image(x + Phaser.Math.Between(-18, 18), y - 2, 'dot').setDepth(y + 11).setAlpha(0.6).setTint(0x8a7a8a);
        this.tweens.add({ targets: d, x: d.x + Phaser.Math.Between(-22, 22), y: y - Phaser.Math.Between(6, 20), alpha: 0, scale: 2.4, duration: 420, onComplete: () => d.destroy() });
      }
    }

    hitCrates() {
      const h = this.hero;
      if (h.state !== 'attack') return;
      const m = h.move;
      if (h.t < m.st || h.t >= m.st + m.ac) return;
      this.crates.forEach((c) => {
        if (c.hp <= 0 || h.hitSet.has(c)) return;
        const dx = (c.x - h.x) * h.facing;
        if ((m.area ? Math.abs(c.x - h.x) < m.area : dx >= 0 && dx < (m.reach ? m.reach[1] + 6 : 40)) && Math.abs(c.y - h.y) < 16) {
          h.hitSet.add(c); c.hp -= m.dmg; LIM.SFX.hit(); this.spark(c.x, c.y - 20, 0.8, 0xd6a65a);
          this.tweens.add({ targets: c.s, x: c.x + 2, duration: 40, yoyo: true });
          if (c.hp <= 0) {
            this.dust(c.x, c.y, 6); c.s.destroy();
            if (Math.random() < 0.6) {
              const orb = this.add.image(c.x, c.y - 10, 'dot').setScale(1.6).setTint(0xe0aa5c).setDepth(10 + c.y);
              this.tweens.add({ targets: orb, y: c.y - 16, duration: 500, yoyo: true, repeat: -1 });
              (this.orbs = this.orbs || []).push({ s: orb, x: c.x, y: c.y });
            }
          }
        }
      });
    }

    // ---- eventos do roteiro ---------------------------------------------------------------------
    runEvents() {
      const h = this.hero;
      while (this.events.length && (!this.lock || this.S.boss) && h.x >= this.events[0].x && !this.dlg.active) {
        const ev = this.events.shift();
        this.fire(ev);
      }
    }

    fire(ev) {
      const after = () => {
        if (ev.tip) this.tip(ev.tip);
        if (ev.wave) this.spawnWave(ev);
        if (this.S.boss && !this.bossActive) { this.bossActive = true; this.bossName.setVisible(true); LIM.SFX.bellOne(); (this.S.tips || []).forEach((t) => this.tip(t)); }
      };
      if (ev.lampsOut) {
        LIM.SFX.lampsOut();
        this.lamps.forEach((l) => { l.l.setTexture('lamp-off'); l.gl.setVisible(false); });
        this.tweens.add({ targets: this.darkness, fillAlpha: 0.35, duration: 600 });
      }
      if (ev.lock) {
        this.lock = ev.lock; this.lockEv = ev;
        if (ev.doors) {
          ev.lock.forEach((x, i) => {
            const d = this.add.image(x + (i ? -6 : 6), 80, 'door').setOrigin(0.5, 1).setScale(2).setDepth(400);
            this.tweens.add({ targets: d, y: 254, duration: 380, ease: 'Bounce.out' });
            this.doors.push(d);
          });
          LIM.SFX.slam();
        }
      }
      if (ev.talk) this.dlg.open(ev.talk, after); else after();
    }

    spawnWave(ev) {
      ev.spawned = true;
      ev.wave.forEach((w, i) => {
        const e = new LIM.Actor(this, w.t, w.x, w.y, w.x > this.hero.x ? -1 : 1);
        e.ai.cool = 0.5 + i * 0.6;
        e.sprite.setAlpha(0);
        this.tweens.add({ targets: e.sprite, alpha: 1, duration: 400 });
        this.enemies.push(e);
      });
    }

    checkWaveClear() {
      if (!this.lock || this.S.boss || !this.lockEv || !this.lockEv.spawned) return;
      if (this.enemies.some((e) => !e.dead)) return;
      const ev = this.lockEv;
      this.lock = null; this.lockEv = null; this.tokens = 2;
      this.doors.forEach((d) => this.tweens.add({ targets: d, y: 60, alpha: 0, duration: 500, onComplete: () => d.destroy() }));
      this.doors = [];
      if (ev.lampsOut) {
        this.tweens.add({ targets: this.darkness, fillAlpha: 0, duration: 1200 });
        this.lamps.forEach((l) => { l.l.setTexture('lamp-on'); l.gl.setVisible(true); });
      }
      if (ev.clear) {
        if (ev.clear.flag) this.flags = Object.assign(this.flags || {}, { [ev.clear.flag]: true });
        if (ev.clear.talk) {
          if (this.npc) { this.npc.setFrame('idle0'); this.npc.setFlipX(this.hero.x < this.npc.x); }
          this.dlg.open(ev.clear.talk, () => this.showAdvance());
          return;
        }
      }
      this.showAdvance();
    }
    showAdvance() { this.advance.setVisible(true); this.time.delayedCall(2500, () => this.advance.setVisible(false)); }

    // ---- desfechos ------------------------------------------------------------------------------------
    onSurrender(boss) {
      this.tokens = 0;
      this.time.delayedCall(700, () => {
        this.dlg.open(this.S.surrender, () => this.showChoice(boss));
      });
    }

    showChoice() {
      this.over = true;
      LIM.Input.showTouch(false);
      const D = 970, C = LIM.DATA.choices;
      const items = [];
      items.push(this.add.rectangle(0, 0, W, H, 0x000000, 0.65).setOrigin(0).setScrollFactor(0).setDepth(D));
      items.push(txt(this, W / 2, 50, 'O DESTINO DO VIGIA', 12, AMBER).setScrollFactor(0).setDepth(D + 1));
      items.push(txt(this, W / 2, 80, 'Ele se rende. A escolha é sua — e não será esquecida.', 6, '#f4e6c8', { wrap: 400, thick: 2 }).setScrollFactor(0).setDepth(D + 1));
      const can = this.hero.eco >= 50;
      items.push(txt(this, 130, 120, 'VINCULAR', 9, '#b07aff').setScrollFactor(0).setDepth(D + 1));
      items.push(txt(this, 130, 148, C.vincular, 5, '#d8c8e8', { wrap: 190, thick: 2 }).setScrollFactor(0).setDepth(D + 1));
      items.push(txt(this, 350, 120, 'DISSIPAR', 9, '#ff8a6a').setScrollFactor(0).setDepth(D + 1));
      items.push(txt(this, 350, 148, C.dissipar, 5, '#e8d0c8', { wrap: 190, thick: 2 }).setScrollFactor(0).setDepth(D + 1));
      const b1 = button(this, 130, 190, can ? 'VINCULAR (-50 ECO)' : `ECO ${this.hero.eco}/50`, () => this.choose('vincular'), { w: 150, disabled: !can }).fixed().depth(D + 1);
      const b2 = button(this, 350, 190, 'DISSIPAR (+200 AÇO)', () => this.choose('dissipar'), { w: 150 }).fixed().depth(D + 1);
      this.choiceUI = { items, b: [b1, b2] };
      LIM.Input.clear();
    }

    choose(c) {
      if (this.chosen) return;
      this.chosen = c;
      const save = LIM.Save.data;
      save.choices.boss_bronze = c;
      if (c === 'vincular') { this.hero.eco -= 50; this.boss.sprite.setTint(0xb07aff); this.ecoBurst(this.boss); }
      else { this.runSteel = (this.runSteel || 0) + 200; this.tweens.add({ targets: this.boss.sprite, alpha: 0, duration: 900 }); this.dust(this.boss.x, this.boss.y, 14); }
      this.choiceUI.items.forEach((i) => i.destroy()); this.choiceUI.b.forEach((b) => b.destroy());
      const line = c === 'vincular' ? [['vigia', 'Então você lembra. Vou guardar o portão aberto para quem vier depois.']] : [['aren', 'Descanse. Eu carrego o que você guardava.']];
      this.dlg.open(line, () => this.stageClear());
    }

    stageClear() {
      if (this.cleared) return;
      this.cleared = true; this.over = true;
      LIM.Input.showTouch(false);
      const save = LIM.Save.data, S = this.S, m = this.meta;
      const steel = (this.runSteel || 0) + ((S.reward && S.reward.steel) || 0);
      save.steel += steel;
      save.eco = this.hero.eco;
      save.done[this.id] = true;
      save.unlocked = Math.max(save.unlocked, Math.min(4, this.id + 1));
      save.flags[m.completion_flag] = true;
      if (S.flag) save.flags[S.flag] = true;
      if (m.flag) save.flags[m.flag] = true;
      Object.assign(save.flags, this.flags || {});
      if (S.perk) save.perks[S.perk] = true;
      LIM.Save.write();
      LIM.SFX.bellOne();
      const D = 980;
      this.add.rectangle(0, 0, W, H, 0x08060c, 0.75).setOrigin(0).setScrollFactor(0).setDepth(D);
      txt(this, W / 2, 70, 'FASE ' + String(this.id).padStart(2, '0') + ' CONCLUÍDA', 12, AMBER).setScrollFactor(0).setDepth(D + 1);
      txt(this, W / 2, 96, m.name.toUpperCase(), 8, '#f4e6c8').setScrollFactor(0).setDepth(D + 1);
      const rw = S.boss ? m.reward : S.reward.text;
      txt(this, W / 2, 128, 'RECOMPENSA: ' + rw + `\n+${steel} AÇO`, 6, '#ffd890', { wrap: 380, thick: 2, ls: 6 }).setScrollFactor(0).setDepth(D + 1);
      txt(this, W / 2, 158, 'PROGRESSO SALVO', 5, '#8a7a8a', { thick: 2 }).setScrollFactor(0).setDepth(D + 1);
      const next = () => fadeTo(this, S.boss ? 'ActEnd' : 'Map');
      button(this, W / 2, 190, 'CONTINUAR', next, { w: 130 }).fixed().depth(D + 1);
      this.endKey = next;
    }

    gameOver() {
      if (this.over) return;
      this.over = true;
      LIM.Input.showTouch(false);
      const D = 980;
      this.time.delayedCall(600, () => {
        this.add.rectangle(0, 0, W, H, 0x000000, 0.7).setOrigin(0).setScrollFactor(0).setDepth(D);
        txt(this, W / 2, 90, 'VOCÊ CAIU', 16, '#d42a2a').setScrollFactor(0).setDepth(D + 1);
        txt(this, W / 2, 116, 'A sombra ainda guarda o que você procura.', 6, '#f4e6c8').setScrollFactor(0).setDepth(D + 1);
        const retry = () => fadeTo(this, 'Stage', { id: this.id });
        button(this, W / 2 - 70, 160, 'TENTAR DE NOVO', retry, { w: 120 }).fixed().depth(D + 1);
        button(this, W / 2 + 70, 160, 'MAPA', () => fadeTo(this, 'Map'), { w: 120 }).fixed().depth(D + 1);
        this.endKey = retry;
      });
    }

    togglePause() {
      if (this.over || this.dlg.active) return;
      this.paused = !this.paused;
      if (this.paused) {
        LIM.Input.showTouch(false);
        const D = 990, it = [];
        it.push(this.add.rectangle(0, 0, W, H, 0x000000, 0.65).setOrigin(0).setScrollFactor(0).setDepth(D).setInteractive());
        it.push(txt(this, W / 2, 50, 'PAUSA', 14, AMBER).setScrollFactor(0).setDepth(D + 1));
        it.push(txt(this, W / 2, 76, 'SOCO J · CHUTE K · DEFESA L (segurar) · ECO I\nDEFESA + direção = esquiva · P,P,K derruba · K,K,P quebra guarda', 5, '#c8b8c8', { thick: 2, ls: 6 }).setScrollFactor(0).setDepth(D + 1));
        const b = [
          button(this, W / 2, 116, 'CONTINUAR', () => this.togglePause(), { w: 140 }).fixed().depth(D + 1),
          button(this, W / 2, 144, LIM.SFX.isMuted() ? 'SOM: NÃO' : 'SOM: SIM', () => { b[1].t.setText(LIM.SFX.toggleMute() ? 'SOM: NÃO' : 'SOM: SIM'); }, { w: 140 }).fixed().depth(D + 1),
          button(this, W / 2, 172, 'REINICIAR FASE', () => fadeTo(this, 'Stage', { id: this.id }), { w: 140 }).fixed().depth(D + 1),
          button(this, W / 2, 200, 'SAIR PARA O MAPA', () => fadeTo(this, 'Map'), { w: 140 }).fixed().depth(D + 1)
        ];
        this.pauseUI = { it, b };
      } else {
        this.pauseUI.it.forEach((o) => o.destroy()); this.pauseUI.b.forEach((o) => o.destroy());
        LIM.Input.showTouch(true);
      }
      LIM.Input.clear();
    }

    // ---- laço principal ----------------------------------------------------------------------------
    update(_, delta) {
      const dt = Math.min(delta / 1000, 1 / 30);
      const I = LIM.Input;
      if (this.drops) this.drops.forEach((d) => { d.x -= 90 * dt; d.y += 380 * dt; if (d.y > H) { d.y = -8; d.x = Math.random() * (W + 60); } });
      if (!this.over && !this.dlg.active && I.consume('start')) this.togglePause();
      if (this.paused) return;
      if (this.dlg.active) { this.dlg.update(dt); this.renderAll(); return; }
      if (this.over) {
        if (this.endKey && I.anyAction()) { const f = this.endKey; this.endKey = null; f(); }
        this.renderAll();
        return;
      }
      if (!LIM.Input.touchVisible && LIM.Input._wantTouch === false) LIM.Input.showTouch(true);
      if (this.hitstop > 0) { this.hitstop -= dt; this.drawHud(); return; }
      this.now += dt;

      const inp = {
        mx: (I.held.right ? 1 : 0) - (I.held.left ? 1 : 0),
        my: (I.held.down ? 1 : 0) - (I.held.up ? 1 : 0),
        punch: I.consume('punch'), kick: I.consume('kick'), special: I.consume('special'),
        blockPressed: I.consume('block'), blockHeld: I.held.block
      };
      this.hero.updateHero(dt, inp);
      this.enemies.forEach((e) => { if (!e.dead) e.updateFoe(dt); });
      this.separate();
      this.hitCrates();
      this.runEvents();
      this.checkWaveClear();

      // cura e memória
      (this.orbs || []).forEach((o) => {
        if (o.s.active && Math.abs(o.x - this.hero.x) < 16 && Math.abs(o.y - this.hero.y) < 14) {
          o.s.destroy(); this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + 25); LIM.SFX.pickup(); this.toast('+25 VIDA');
        }
      });
      if (this.memory && Math.abs(this.S.memory.x - this.hero.x) < 18 && Math.abs(this.S.memory.y - this.hero.y) < 12) {
        const m = this.S.memory;
        this.memory.destroy(); this.memoryGlow.destroy(); this.memory = null;
        LIM.Save.data.memories.push(m.id); LIM.Save.data.flags[m.id] = true;
        LIM.SFX.pickup(); this.cameras.main.flash(300, 255, 220, 160);
        this.banner('MEMÓRIA 1', '#ffd890');
        this.dlg.open(m.talk);
      }

      // saída
      const ex = this.S.exit;
      if (ex && !this.lock && !this.events.length && this.hero.x >= ex.x - 8) this.stageClear();

      // câmera manual com limites de trava
      const cam = this.cameras.main;
      let target = this.hero.x - W * 0.42;
      if (this.lock) target = Phaser.Math.Clamp(target, this.lock[0], this.lock[1] - W);
      target = Phaser.Math.Clamp(target, 0, this.S.width - W);
      cam.scrollX += (target - cam.scrollX) * Math.min(1, dt * 6);
      this.renderAll();
    }

    separate() {
      const all = [this.hero, ...this.enemies.filter((e) => !e.dead && !e.boss)];
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        if (a.z > 0 || b.z > 0 || ['down', 'knock', 'dodge'].includes(a.state) || ['down', 'knock', 'dodge'].includes(b.state)) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        if (Math.abs(dx) < 16 && Math.abs(dy) < 8) { const p = (16 - Math.abs(dx)) / 2, s = Math.sign(dx) || 1; a.x -= s * p; b.x += s * p; }
      }
      if (this.boss && !this.boss.dead) {
        const b = this.boss, h = this.hero, dx = h.x - b.x;
        if (Math.abs(dx) < 26 && Math.abs(h.y - b.y) < 12 && h.state !== 'dodge') h.x = b.x + (Math.sign(dx) || 1) * 26;
      }
    }

    renderAll() {
      this.bg.update(this.cameras.main.scrollX);
      this.hero.render();
      this.enemies.forEach((e) => { if (!e.dead || e.sprite.visible) e.render(); });
      this.drawHud();
    }
  }

  // ---- Fim do Ato ---------------------------------------------------------------------------------------
  class ActEnd extends Phaser.Scene {
    constructor() { super('ActEnd'); }
    create() {
      this._leaving = false; this.ready = false;
      LIM.Input.showTouch(false); LIM.Input.clear();
      this.cameras.main.fadeIn(800);
      const act = LIM.DATA.acts[0];
      this.add.rectangle(0, 0, W, H, 0x050308).setOrigin(0);
      this.add.image(0, 0, 'bg-gate-sky').setOrigin(0).setScale(2).setAlpha(0.35);
      txt(this, W / 2, 40, 'FIM DO ATO I', 14, AMBER);
      const lines = [
        ['REVELAÇÃO', act.revelation],
        ['', act.close],
        ['', LIM.Save.data.choices.boss_bronze === 'vincular' ? 'O Vigia agora protege o portão aberto. (1/5 chefes vinculados)' : 'O Vigia se dissipou. Seu eco poderá voltar no Salão das Memórias.']
      ];
      lines.forEach(([h, l], i) => {
        const t = txt(this, W / 2, 84 + i * 36, (h ? h + '\n' : '') + l, 6, i === 0 ? '#ffd890' : '#f4e6c8', { wrap: 400, thick: 2, ls: 6 }).setAlpha(0);
        this.tweens.add({ targets: t, alpha: 1, delay: 600 + i * 1400, duration: 800 });
      });
      const next = LIM.DATA.acts[1];
      const t2 = txt(this, W / 2, 210, `PRÓXIMO: ATO II — ${next.name.toUpperCase()} (EM PRODUÇÃO)`, 5, '#8a7a8a', { thick: 2 }).setAlpha(0);
      this.tweens.add({ targets: t2, alpha: 1, delay: 4600, duration: 600 });
      this.time.delayedCall(4800, () => { button(this, W / 2, 240, 'VOLTAR AO MAPA', () => fadeTo(this, 'Map'), { w: 140 }); this.ready = true; });
    }
    update() { if (this.ready && LIM.Input.anyAction()) fadeTo(this, 'Map'); }
  }

  function start() {
    LIM.game = new Phaser.Game({
      type: Phaser.AUTO, parent: 'game', width: W, height: H, backgroundColor: '#000000',
      pixelArt: true, roundPixels: true, input: { activePointers: 4 },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, fullscreenTarget: 'game' },
      scene: [Boot, Title, Intro, MapScene, Stage, ActEnd, LIM.ControlsScene]
    });
  }
  const fontReady = document.fonts && document.fonts.load ? document.fonts.load('16px "Press Start 2P"') : Promise.resolve();
  Promise.race([fontReady, new Promise((r) => setTimeout(r, 1500))]).then(start, start);
})(window);
