/* LIMIAR — núcleo de combate (GDD §8).
 *
 * Golpes: startup → active → recovery. Dano só quando o golpe está ativo,
 * o alvo está no alcance à frente E na mesma faixa de profundidade.
 * Defesa frontal, aparar (bloqueio iniciado ≤150 ms antes do impacto),
 * esquiva com invulnerabilidade inicial, hitstop, buffer de entrada e
 * combos P-P-K (derrubada) e K-K-P (quebra de guarda).
 */
(function (global) {
  'use strict';
  const LIM = global.LIM;

  const DEPTH = 13;           // tolerância de profundidade para acertar
  const PARRY_WINDOW = 0.15;  // s
  const BUFFER = 0.12;        // s (buffer de entrada)
  const GRAVITY = 720;
  const BAND = { y0: 196, y1: 250 };

  // kind: P (soco) ou K (chute) — usado por guardas e duelistas
  const MOVES = {
    P:      { kind: 'P', f: ['punch0', 'punch1', 'punch0'], st: 0.07, ac: 0.07, rc: 0.13, dmg: 6, reach: [2, 34], stun: 0.28, push: 50 },
    K:      { kind: 'K', f: ['kick0', 'kick1', 'kick0'], st: 0.12, ac: 0.08, rc: 0.2, dmg: 10, reach: [4, 44], stun: 0.36, push: 80 },
    PPK:    { kind: 'K', f: ['kick0', 'kick1', 'kick0'], st: 0.12, ac: 0.09, rc: 0.28, dmg: 12, reach: [4, 46], stun: 0.5, push: 120, knock: true, heavy: true },
    KKP:    { kind: 'P', f: ['punch0', 'punch1', 'punch0'], st: 0.1, ac: 0.08, rc: 0.28, dmg: 16, reach: [2, 38], stun: 0.7, push: 110, guardBreak: true, heavy: true },
    ECO:    { kind: 'S', f: ['special', 'special', 'idle0'], st: 0.16, ac: 0.14, rc: 0.3, dmg: 16, area: 84, stun: 0.6, push: 160, knock: true, heavy: true, guardBreak: true },
    // inimigos
    claw:   { kind: 'P', f: ['punch0', 'punch1', 'punch0'], st: 0.06, ac: 0.07, rc: 0.16, dmg: 5, reach: [2, 32], stun: 0.25, push: 40 },
    bash:   { kind: 'P', f: ['block', 'punch1', 'block'], st: 0.05, ac: 0.24, rc: 0.3, dmg: 8, reach: [0, 30], stun: 0.4, push: 110, lunge: 260 },
    thrust: { kind: 'P', f: ['punch0', 'punch1', 'punch1'], st: 0.04, ac: 0.1, rc: 0.35, dmg: 9, reach: [4, 50], stun: 0.35, push: 70, lunge: 160 },
    hammer: { kind: 'H', f: ['tele', 'slam', 'slam'], st: 0.02, ac: 0.08, rc: 0.95, dmg: 18, areaAt: 52, areaR: 34, stun: 0.6, push: 90, knock: true, heavy: true },
    sweep:  { kind: 'P', f: ['punch0', 'sweep', 'sweep'], st: 0.05, ac: 0.1, rc: 0.55, dmg: 10, reach: [0, 70], stun: 0.45, push: 140 }
  };

  const ARCH = {
    aren:     { hp: 100, speed: 98, team: 'hero' },
    errante:  { hp: 30, speed: 58, team: 'foe', tele: 0.36, moves: ['claw', 'claw'], engage: 26, steel: 10 },
    guarda:   { hp: 46, speed: 46, team: 'foe', tele: 0.5, moves: ['bash'], engage: 58, steel: 20 },
    duelista: { hp: 44, speed: 72, team: 'foe', tele: 0.45, moves: ['thrust'], engage: 48, steel: 25 },
    vigia:    { hp: 240, speed: 34, team: 'foe', boss: true, steel: 0 },
    courier:  { hp: 1, speed: 0, team: 'npc' }
  };

  class Actor {
    constructor(scene, type, x, y, facing) {
      this.scene = scene; this.type = type;
      const A = ARCH[type];
      this.A = A; this.team = A.team; this.boss = !!A.boss;
      this.x = x; this.y = y; this.z = 0; this.vx = 0; this.vy = 0; this.vz = 0;
      this.facing = facing || 1;
      this.maxHp = A.hp; this.hp = A.hp;
      this.speed = A.speed;
      this.state = 'idle'; this.t = 0;
      this.hitSet = new Set();
      this.seq = ''; this.lastAtkEnd = -9; this.buffer = null;
      this.recentKinds = [];
      this.ai = { cool: 0.4 + Math.random() * 0.6, token: false, mark: null, strafe: Math.random() < 0.5 ? -1 : 1 };
      this.eco = 0;
      this.invuln = 0;
      this.dead = false;
      const fh = LIM.FRAME_H[type];
      this.fh = fh;
      this.shadow = scene.add.image(x, y, 'shadow').setScale(2 * LIM.CAST[type].size).setDepth(3);
      this.sprite = scene.add.sprite(x, y, 'c-' + type, 'idle0').setScale(2).setOrigin(0.5, fh.FOOT / fh.FH);
      this.play('idle');
      if (LIM.CAST[type].scarf) this.initScarf();
    }

    // ---- utilidades ----------------------------------------------------------------
    play(a) { if (this.cur === a) return; this.cur = a; this.sprite.play(this.type + '-' + a); }
    frame(f) { this.cur = null; this.sprite.anims.stop(); this.sprite.setFrame(f); }
    set(s) { this.state = s; this.t = 0; if (s !== 'tele' && !(this.armor > 0)) this.sprite.clearTint(); }
    alive() { return !this.dead && this.hp > 0; }
    foes() { return this.team === 'hero' ? this.scene.enemies.filter((e) => e.alive() || e.state === 'knock') : [this.scene.hero]; }
    inFront(o) { return (o.x - this.x) * this.facing > -4; }
    clamp() {
      const L = this.scene.limits();
      this.x = Phaser.Math.Clamp(this.x, L.x0, L.x1);
      this.y = Phaser.Math.Clamp(this.y, BAND.y0, BAND.y1);
    }
    faceTo(o) { if (Math.abs(o.x - this.x) > 3) this.facing = o.x > this.x ? 1 : -1; }

    // ---- golpes --------------------------------------------------------------------------
    attack(key) {
      this.move = MOVES[key]; this.moveKey = key;
      this.set('attack'); this.hitSet.clear();
      if (this.move.lunge) this.vx = this.facing * this.move.lunge;
      if (this.team === 'hero') LIM.SFX.whiff();
    }

    updateAttack(dt) {
      const m = this.move, t = this.t;
      const a0 = m.st, a1 = m.st + m.ac, end = a1 + m.rc;
      this.frame(t < a0 ? m.f[0] : t < a1 ? m.f[1] : m.f[2]);
      if (m.lunge && t < a1) { this.x += this.vx * dt; } else this.vx = 0;
      if (t >= a0 && t < a1) this.checkHits();
      if (t >= end) {
        this.lastAtkEnd = this.scene.now;
        this.set(this.team === 'hero' ? 'idle' : 'recover');
        return true;
      }
      return false;
    }

    checkHits() {
      const m = this.move;
      this.foes().forEach((o) => {
        if (this.hitSet.has(o) || !o.hittable()) return;
        let hit = false;
        if (m.area) hit = Math.abs(o.x - this.x) < m.area && Math.abs(o.y - this.y) < DEPTH * 2.2;
        else if (m.areaAt) {
          const mx = this.x + this.facing * m.areaAt;
          hit = Math.abs(o.x - mx) < m.areaR && Math.abs(o.y - this.y) < DEPTH * 1.4;
        } else {
          const dx = (o.x - this.x) * this.facing;
          hit = dx >= m.reach[0] && dx <= m.reach[1] && Math.abs(o.y - this.y) < DEPTH && o.z < 30;
        }
        if (hit) { this.hitSet.add(o); this.scene.resolveHit(this, o, m); }
      });
    }

    hittable() {
      if (this.dead || this.team === 'npc') return false;
      return !['down', 'getup', 'dead', 'kneel'].includes(this.state) && this.invuln <= 0;
    }

    // ---- receber golpe ------------------------------------------------------------------
    /** Retorna 'hit' | 'blocked' | 'parried' | 'armor' | 'guard'. */
    defend(att, m) {
      if (this.team === 'hero') {
        if (this.state === 'block' && this.inFront(att)) {
          return this.t <= PARRY_WINDOW + (this.parryBonus || 0) ? 'parried' : 'blocked';
        }
        return 'hit';
      }
      if (this.type === 'guarda' && this.inFront(att) && !this.guardBroken && m.kind === 'P' && !m.guardBreak && this.state !== 'attack') return 'guard';
      if (this.type === 'duelista' && att.team === 'hero' && m.kind !== 'S') {
        const k = att.recentKinds;
        if (k.length >= 3 && k[k.length - 1] === k[k.length - 2] && k[k.length - 2] === k[k.length - 3] && this.state !== 'attack' && this.inFront(att)) return 'parried';
      }
      if (this.boss && this.armor > 0) return 'armor';
      return 'hit';
    }

    takeHit(att, m, dmg) {
      this.hp = Math.max(0, this.hp - dmg);
      if (this.type === 'guarda' && (m.kind === 'K' || m.guardBreak)) this.guardBroken = 1.4;
      if (this.boss) {
        if (this.hp <= 0) this.hp = 1;
        // o chefe tem postura: só golpes pesados o interrompem, e nunca durante o aviso/ataque
        if (m.heavy && !['attack', 'raise', 'tele', 'stagger', 'kneel'].includes(this.state)) { this.set('hurt'); this.stun = 0.35; }
        return;
      }
      const dir = att.x < this.x ? 1 : -1;
      if (this.hp <= 0 || m.knock) {
        this.set('knock'); this.vx = dir * (m.push + 60); this.vz = 190; this.facing = -dir;
      } else {
        if (this.state === 'attack' && this.team === 'foe' && !m.heavy && this.type === 'guarda') { this.hp = this.hp; return; }
        this.set('hurt'); this.stun = m.stun; this.vx = dir * m.push; this.facing = -dir;
      }
    }

    stagger(dur) { this.set('stagger'); this.stun = dur; this.vx = -this.facing * 60; }

    // ---- cachecol vermelho (corrente de Verlet) --------------------------------------------
    initScarf() {
      this.scarf = [];
      for (let i = 0; i < 9; i++) this.scarf.push({ x: this.x, y: this.y - 50, px: this.x, py: this.y - 50 });
      this.scarfG = this.scene.add.graphics();
    }
    updateScarf(dt) {
      const f = this.sprite.frame.name, n = LIM.NECK[this.type][f] || [0, -40];
      const flip = this.facing < 0 ? -1 : 1;
      let ax, ay;
      if (this.sprite.rotation) { ax = this.sprite.x; ay = this.sprite.y - 10; }
      else { ax = this.x + n[0] * 2 * flip; ay = this.y - this.z + n[1] * 2 + 2; }
      const wind = -this.facing * 70 + (this.scene.wind || 0) - this.vx * 0.2 + Math.sin(this.scene.now * 7) * 30;
      const pts = this.scarf;
      pts[0].x = ax; pts[0].y = ay;
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i], vx = (p.x - p.px) * 0.9, vy = (p.y - p.py) * 0.9;
        p.px = p.x; p.py = p.y;
        p.x += vx + wind * dt * dt * 90; p.y += vy + 40 * dt * dt * 60 * (0.6 + 0.4 * Math.sin(this.scene.now * 9 + i));
      }
      for (let k = 0; k < 3; k++) for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, L = 5;
        const diff = (d - L) / d; void L;
        b.x -= dx * diff; b.y -= dy * diff;
      }
      const g = this.scarfG; g.clear();
      g.setDepth(this.sprite.depth - 0.1);
      for (let i = 1; i < pts.length; i++) {
        const w = 5 - i * 0.4;
        g.lineStyle(w + 2, 0x1a0608, 1); g.lineBetween(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
      }
      for (let i = 1; i < pts.length; i++) {
        const w = 5 - i * 0.4;
        g.lineStyle(w, i % 2 ? 0xd42a2a : 0xb81e22, 1); g.lineBetween(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
      }
    }

    // ---- atualização comum ----------------------------------------------------------------------
    physics(dt) {
      if (this.state === 'knock') {
        this.x += this.vx * dt; this.z += this.vz * dt; this.vz -= GRAVITY * dt;
        this.frame('hurt');
        this.sprite.rotation = -this.facing * Math.min(1.3, this.t * 3.2);
        if (this.z <= 0 && this.t > 0.05) {
          this.z = 0; this.sprite.rotation = 0;
          this.set('down'); this.vx *= 0.3;
          this.scene.onLand(this);
        }
        return true;
      }
      return false;
    }

    commonStates(dt) {
      switch (this.state) {
        case 'hurt':
        case 'stagger':
          this.frame('hurt');
          this.x += this.vx * dt; this.vx *= Math.pow(0.003, dt);
          if (this.t >= this.stun) this.set('idle');
          return true;
        case 'down':
          this.frame('down');
          this.x += this.vx * dt; this.vx *= Math.pow(0.001, dt);
          if (this.hp <= 0) {
            if (this.t > 0.5 && !this.dead) this.scene.onDeath(this);
          } else if (this.t >= 0.9) this.set('getup');
          return true;
        case 'getup':
          this.frame('sit');
          this.invuln = 0.1;
          if (this.t >= 0.4) this.set('idle');
          return true;
        case 'dead':
          this.frame('down');
          return true;
        default: return false;
      }
    }

    // ---- herói ---------------------------------------------------------------------------------------
    updateHero(dt, inp) {
      this.t += dt;
      this.invuln = Math.max(0, this.invuln - dt);
      if (this.physics(dt) || this.commonStates(dt)) return this.finish(dt);

      if (inp.punch) this.buffer = { a: 'P', t: this.scene.now };
      if (inp.kick) this.buffer = { a: 'K', t: this.scene.now };
      if (inp.special) this.buffer = { a: 'S', t: this.scene.now };
      const buffered = this.buffer && this.scene.now - this.buffer.t <= BUFFER + 0.25 ? this.buffer.a : null;

      switch (this.state) {
        case 'idle':
        case 'walk': {
          if (inp.blockPressed && (inp.mx || inp.my)) { this.startDodge(inp.mx, inp.my); break; }
          if (inp.blockHeld) { this.set('block'); this.frame('block'); break; }
          if (buffered) { this.buffer = null; this.startHeroAttack(buffered); break; }
          const moving = inp.mx || inp.my;
          this.x += inp.mx * this.speed * dt;
          this.y += inp.my * this.speed * 0.62 * dt;
          if (inp.mx) this.facing = inp.mx > 0 ? 1 : -1;
          if (moving) { this.state = 'walk'; this.play('walk'); } else { this.state = 'idle'; this.play('idle'); }
          break;
        }
        case 'block':
          this.frame('block');
          if (inp.blockPressed && (inp.mx || inp.my)) { this.startDodge(inp.mx, inp.my); break; }
          if (!inp.blockHeld) this.set('idle');
          break;
        case 'dodge':
          this.frame('dodge');
          this.x += this.vx * dt; this.y += this.vy * dt;
          this.vx *= Math.pow(0.02, dt); this.vy *= Math.pow(0.02, dt);
          if (this.t >= 0.3) this.set('idle');
          break;
        case 'attack': {
          const m = this.move;
          const activeStarted = this.t >= m.st;
          if (!activeStarted && this.buffer && this.buffer.t > this.scene.now - dt * 1.5) { /* mantém para depois */ }
          if (this.updateAttack(dt)) {
            const b = this.buffer && this.scene.now - this.buffer.t <= BUFFER + m.rc ? this.buffer.a : null;
            if (b) { this.buffer = null; this.startHeroAttack(b); }
          }
          break;
        }
        default: break;
      }
      return this.finish(dt);
    }

    startDodge(mx, my) {
      const len = Math.hypot(mx, my) || 1;
      this.set('dodge');
      this.vx = (mx / len) * 300; this.vy = (my / len) * 190;
      if (mx) this.facing = mx > 0 ? 1 : -1;
      this.invuln = 0.2 + (this.dodgeBonus || 0);
      LIM.SFX.whiff();
    }

    startHeroAttack(a) {
      if (a === 'S') {
        if (this.eco < 30) { this.scene.toast('ECO insuficiente (30)'); return; }
        this.eco -= 30;
        this.attack('ECO');
        this.invuln = 0.3;
        LIM.SFX.special();
        this.scene.ecoBurst(this);
        this.seq = '';
        return;
      }
      // auto-mira: vira para o inimigo mais próximo ao alcance
      let best = null, bd = 80;
      this.scene.enemies.forEach((e) => {
        if (!e.alive()) return;
        const d = Math.abs(e.x - this.x);
        if (Math.abs(e.y - this.y) < 22 && d < bd) { bd = d; best = e; }
      });
      if (best) this.faceTo(best);
      const chained = this.scene.now - this.lastAtkEnd < 0.45;
      this.seq = (chained ? this.seq : '') + a;
      let key = a;
      if (this.seq.endsWith('PPK')) { key = 'PPK'; this.seq = ''; }
      else if (this.seq.endsWith('KKP')) { key = 'KKP'; this.seq = ''; }
      this.recentKinds.push(a); if (this.recentKinds.length > 4) this.recentKinds.shift();
      this.attack(key);
      this.x += this.facing * 3;
    }

    finish(dt) {
      if (this.state !== 'knock') this.sprite.rotation = 0;
      this.clamp();
      if (this.scarf) this.updateScarf(dt);
    }

    // ---- inimigos (FSM: aproximar → sinalizar → atacar → recuperar → reposicionar) ------------
    updateFoe(dt) {
      this.t += dt;
      this.invuln = Math.max(0, this.invuln - dt);
      if (this.guardBroken) this.guardBroken = Math.max(0, this.guardBroken - dt);
      if (this.physics(dt) || this.commonStates(dt)) { this.releaseToken(); return this.finish(dt); }
      if (this.boss) return this.updateBoss(dt);
      const h = this.scene.hero, A = this.A, ai = this.ai;
      const dx = h.x - this.x, dy = h.y - this.y, adx = Math.abs(dx);
      const heroDown = !h.alive() || h.state === 'down';

      switch (this.state) {
        case 'idle':
        case 'walk': {
          this.faceTo(h);
          ai.cool -= dt;
          if (heroDown) { this.play('idle'); break; }
          if (!ai.token && ai.cool <= 0) ai.token = this.scene.takeToken(this);
          let tx, ty = h.y;
          if (ai.token) tx = h.x - Math.sign(dx || 1) * A.engage;
          else { tx = h.x - Math.sign(dx || 1) * 96; ty = Phaser.Math.Clamp(h.y + ai.strafe * 22, BAND.y0, BAND.y1); }
          const ex = tx - this.x, ey = ty - this.y;
          let mx = Math.abs(ex) > 4 ? Math.sign(ex) : 0, my = Math.abs(ey) > 3 ? Math.sign(ey) : 0;
          this.x += mx * this.speed * dt; this.y += my * this.speed * 0.6 * dt;
          if (mx || my) this.play('walk'); else this.play('idle');
          if (ai.token && adx < A.engage + 10 && Math.abs(dy) < 7) {
            if (this.type === 'duelista' && this.t < 0.6) break; // espera paciente
            this.set('tele'); ai.combo = A.moves.slice(); LIM.SFX.telegraph();
          }
          break;
        }
        case 'tele':
          this.faceTo(h);
          this.frame(this.type === 'errante' ? 'tele' : this.type === 'guarda' ? 'block' : 'punch0');
          this.sprite.setTintFill(Math.floor(this.t * 16) % 2 ? 0xffffff : 0xffd890);
          if (this.t >= A.tele) { this.sprite.clearTint(); this.attack(ai.combo.shift()); }
          break;
        case 'attack':
          if (this.updateAttack(dt) && ai.combo && ai.combo.length) this.attack(ai.combo.shift());
          break;
        case 'recover':
          this.frame('idle0');
          if (this.t >= 0.5) { this.set('reposition'); this.releaseToken(); ai.cool = 0.6 + Math.random() * 0.8; }
          break;
        case 'reposition': {
          this.faceTo(h);
          this.x -= Math.sign(dx || 1) * this.speed * 0.8 * dt; // recua olhando para o herói
          this.y += ai.strafe * this.speed * 0.4 * dt;
          this.play('walk');
          if (this.t > 0.55) { this.set('idle'); ai.strafe *= -1; }
          break;
        }
        default: break;
      }
      if (this.state !== 'tele') this.sprite.clearTint();
      return this.finish(dt);
    }

    releaseToken() { if (this.ai.token) { this.ai.token = false; this.scene.returnToken(this); } }

    // ---- chefe: Vigia de Bronze --------------------------------------------------------------------
    updateBoss(dt) {
      const h = this.scene.hero, ai = this.ai;
      const dx = h.x - this.x, adx = Math.abs(dx);
      const phase2 = this.hp <= this.maxHp * 0.5;
      if (this.armor > 0) {
        this.armor -= dt;
        this.sprite.setTint(Math.floor(this.scene.now * 10) % 2 ? 0xffe08a : 0xffffff);
        if (this.armor <= 0) { this.sprite.clearTint(); this.scene.toast('A armadura se desfaz'); }
      }
      if (this.vulnerable > 0) { this.vulnerable -= dt; }
      if (phase2 && !this.phase2Started) {
        this.phase2Started = true; ai.bell = 1.5;
        this.scene.banner('FASE 2', '#f2c474');
      }
      if (phase2) {
        ai.bell -= dt;
        if (ai.bell <= 0 && this.armor <= 0 && this.state !== 'stagger') {
          ai.bell = 12; this.armor = 5;
          LIM.SFX.bellOne(); this.scene.banner('O SINO TOCA', '#ffe08a');
          this.scene.cameras.main.flash(200, 255, 220, 140);
        }
      }
      if (this.hp <= this.maxHp * 0.2 && this.state !== 'kneel') {
        this.set('kneel'); this.armor = 0; this.sprite.clearTint(); this.clearMark();
        this.scene.onSurrender(this);
      }

      switch (this.state) {
        case 'idle':
        case 'walk': {
          this.faceTo(h);
          ai.cool = (ai.cool || 0) - dt;
          const want = 56;
          if (adx > want + 6) { this.x += Math.sign(dx) * this.speed * dt; this.play('walk'); }
          else this.play('idle');
          const ey = h.y - this.y;
          if (Math.abs(ey) > 3) this.y += Math.sign(ey) * this.speed * 0.7 * dt;
          if (ai.cool <= 0 && h.alive() && h.state !== 'down' && adx < 110) {
            ai.cool = phase2 ? 0.9 : 1.4;
            if (adx < 52 && Math.random() < 0.35) { this.set('tele'); ai.next = 'sweep'; LIM.SFX.telegraph(); }
            else { this.set('raise'); this.placeMark(); LIM.SFX.telegraph(); }
          }
          break;
        }
        case 'raise': // 0,7 s de aviso: martelo erguido + marca amarela no chão
          this.frame('tele');
          if (this.t >= 0.7) { this.attack('hammer'); }
          break;
        case 'tele':
          this.frame('punch0');
          this.sprite.setTintFill(Math.floor(this.t * 16) % 2 ? 0xffffff : 0xffd890);
          if (this.t >= 0.5) { this.sprite.clearTint(); this.attack(ai.next); }
          break;
        case 'attack':
          if (this.moveKey === 'hammer' && this.t >= this.move.st && !this.slammed) {
            this.slammed = true; this.clearMark();
            this.scene.dust(this.x + this.facing * 52, this.y, 10);
            this.scene.cameras.main.shake(180, 0.012); LIM.SFX.slam();
          }
          if (this.updateAttack(dt)) { this.slammed = false; }
          break;
        case 'recover':
          this.frame('slam');
          if (this.t >= 0.15) this.set('idle');
          break;
        case 'stagger':
          this.frame('hurt');
          this.x += this.vx * dt; this.vx *= Math.pow(0.01, dt);
          if (this.t >= this.stun) this.set('idle');
          break;
        case 'hurt':
          this.frame('hurt');
          if (this.t >= this.stun) this.set('idle');
          break;
        case 'kneel':
          this.frame('kneel');
          break;
        default: break;
      }
      if (this.state !== 'tele' && !(this.armor > 0)) this.sprite.clearTint();
      return this.finish(dt);
    }

    placeMark() {
      const mx = this.x + this.facing * 52;
      this.clearMark();
      const g = this.scene.add.graphics().setDepth(4);
      g.fillStyle(0xffd23c, 0.35); g.fillEllipse(mx, this.y, 68, 18);
      g.lineStyle(2, 0xffd23c, 0.9); g.strokeEllipse(mx, this.y, 68, 18);
      this.ai.mark = g;
      this.scene.tweens.add({ targets: g, alpha: 0.4, duration: 120, yoyo: true, repeat: -1 });
    }
    clearMark() { if (this.ai.mark) { this.ai.mark.destroy(); this.ai.mark = null; } }

    render() {
      const fl = this.state === 'knock';
      if (fl) { this.sprite.setOrigin(0.5, 0.6); this.sprite.setPosition(this.x, this.y - this.z - 24); }
      else { this.sprite.setOrigin(0.5, this.fh.FOOT / this.fh.FH); this.sprite.setPosition(this.x, this.y - this.z); }
      this.sprite.setFlipX(this.facing < 0);
      this.sprite.setDepth(10 + this.y + (fl ? 1 : 0));
      this.shadow.setPosition(this.x, this.y + 1);
      const s = Math.max(0.5, 1 - this.z / 160) * 2 * LIM.CAST[this.type].size;
      this.shadow.setScale(s, s);
      if (this.invuln > 0 && this.state === 'dodge') this.sprite.setAlpha(0.55 + 0.45 * (Math.floor(this.scene.now * 30) % 2));
      else this.sprite.setAlpha(1);
    }

    destroy() {
      this.sprite.destroy(); this.shadow.destroy();
      if (this.scarfG) this.scarfG.destroy();
      this.clearMark && this.clearMark();
    }
  }

  Object.assign(LIM, { Actor, MOVES, ARCH, BAND });
})(window);
