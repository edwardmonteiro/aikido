/* Ring Riot — fighter entity: movement, attacks, grabs, throws, knockdowns. */
(function (global) {
  'use strict';
  const RR = global.RR;

  const BOUNDS = { x0: 36, x1: 444, y0: 160, y1: 236 };
  const GRAVITY = 760;

  // Base damage table (scaled by attacker power and defender stamina)
  const DMG = { punch: 5, finisher: 7, headbutt: 6, dropkick: 11, throw: 12, slam: 17 };

  // States in which a fighter can be struck
  const HITTABLE = new Set(['idle', 'walk', 'punch', 'jump', 'kick', 'grabbing', 'whiff', 'recover', 'hurt']);
  const GRABBABLE = new Set(['idle', 'walk', 'punch', 'whiff', 'recover']);

  class Fighter {
    constructor(scene, def, x, y, facing, opts) {
      this.scene = scene;
      this.def = def;
      this.isCpu = !!opts.cpu;
      this.level = opts.level || 0.5;
      this.x = x; this.y = y; this.z = 0;
      this.vx = 0; this.vz = 0;
      this.facing = facing;
      const st = def.stats;
      this.speed = 64 + st.speed * 11;
      this.power = 0.8 + st.power * 0.1;
      this.toughness = 1.18 - st.stamina * 0.06;
      this.maxHp = 100;
      this.hp = this.maxHp;
      this.state = 'idle'; this.t = 0;
      this.combo = 0; this.lastHit = -10;
      this.chain = 0; this.bufferPunch = false;
      this.opp = null;
      this.ai = { timer: 0, intent: 'approach', mx: 0, my: 0, delay: 0 };

      this.shadow = scene.add.image(x, y, 'shadow').setScale(2).setDepth(2);
      this.sprite = scene.add.sprite(x, y, 'f-' + def.id, 'idle0')
        .setScale(RR.SCALE).setOrigin(0.5, RR.FOOT_Y / RR.FH);
      this.play('idle');
    }

    // ---- helpers -------------------------------------------------------------
    play(anim) {
      if (this.curAnim === anim) return;
      this.curAnim = anim;
      this.sprite.play(this.def.id + '-' + anim);
    }
    frame(name) {
      this.curAnim = null;
      this.sprite.anims.stop();
      this.sprite.setFrame(name);
    }
    setState(s) { this.state = s; this.t = 0; }
    grounded() { return this.z <= 0; }
    dxTo(o) { return (o.x - this.x) * this.facing; }
    faceOpp() { if (this.opp && Math.abs(this.opp.x - this.x) > 2) this.facing = this.opp.x > this.x ? 1 : -1; }
    clampPos() {
      this.x = Phaser.Math.Clamp(this.x, BOUNDS.x0, BOUNDS.x1);
      this.y = Phaser.Math.Clamp(this.y, BOUNDS.y0, BOUNDS.y1);
    }
    isDown() { return this.state === 'down'; }
    canAct() { return this.state === 'idle' || this.state === 'walk'; }

    // ---- per-frame update -------------------------------------------------------
    update(dt, inp) {
      this.t += dt;
      const o = this.opp;
      switch (this.state) {
        case 'idle':
        case 'walk': {
          this.faceOpp();
          if (inp.punch) { this.startPunch(); break; }
          if (inp.grab) { this.tryGrabOrPin(); break; }
          if (inp.jump) { this.startJump(inp.mx); break; }
          const moving = inp.mx !== 0 || inp.my !== 0;
          this.x += inp.mx * this.speed * dt;
          this.y += inp.my * this.speed * 0.62 * dt;
          if (moving) { this.state = 'walk'; this.play('walk'); }
          else { this.state = 'idle'; this.play('idle'); }
          break;
        }
        case 'punch': {
          const t = this.t;
          this.frame(t < 0.07 ? 'punch0' : t < 0.2 ? 'punch1' : 'punch0');
          if (inp.punch) this.bufferPunch = true;
          if (!this.hitDone && t >= 0.07 && t < 0.2) {
            const dx = this.dxTo(o);
            if (dx > 4 && dx < 36 && Math.abs(o.y - this.y) < 12 && Math.abs(o.z - this.z) < 22 && HITTABLE.has(o.state)) {
              this.hitDone = true;
              const finisher = this.chain >= 2;
              this.scene.onHit(this, o, finisher ? DMG.finisher : DMG.punch, finisher ? 'knock' : 'stun');
            }
          }
          if (t >= 0.26) {
            if (this.bufferPunch && this.chain < 2) { this.chain++; this.startPunch(true); }
            else { this.chain = 0; this.setState('recover'); this.recoverTime = 0.08; }
          }
          break;
        }
        case 'whiff':
        case 'recover':
          if (this.t >= (this.recoverTime || 0.2)) this.setState('idle');
          break;
        case 'jump':
        case 'kick': {
          this.x += this.vx * dt;
          this.z += this.vz * dt;
          this.vz -= GRAVITY * dt;
          if (this.state === 'jump') {
            this.frame('jump');
            if (inp.punch) { this.setState('kick'); this.hitDone = false; this.vx += this.facing * 40; RR.SFX.whiff(); }
          } else {
            this.frame('kick');
            if (!this.hitDone) {
              const dx = this.dxTo(o);
              if (dx > -6 && dx < 42 && Math.abs(o.y - this.y) < 14 && this.z < 52 && o.z < 24 && HITTABLE.has(o.state)) {
                this.hitDone = true;
                this.scene.onHit(this, o, DMG.dropkick, 'knock');
              }
            }
          }
          if (this.z <= 0) {
            this.z = 0; this.vz = 0;
            const wasKick = this.state === 'kick';
            this.setState('recover');
            this.recoverTime = wasKick ? 0.32 : 0.06;
            this.frame(wasKick ? 'sit' : 'idle0');
            if (wasKick) this.scene.dust(this.x, this.y, 4);
          }
          break;
        }
        case 'grabbing': {
          this.frame(this.t < 0.12 ? 'grab' : 'grab');
          if (this.t < 0.15) break;
          if (inp.jump) { this.startSlam(); break; }
          if (inp.grab) { this.startThrow(); break; }
          if (inp.punch) {
            this.headbutts = (this.headbutts || 0) + 1;
            this.frame('punch1');
            this.scene.onHeadbutt(this, o, DMG.headbutt);
            this.t = 0.05;
            if (this.headbutts >= 3) { this.release(); }
            break;
          }
          if (this.t > 1.6) this.release();
          break;
        }
        case 'grabbed':
          this.frame('hurt');
          if (inp.punch || inp.grab || inp.jump) this.escape = (this.escape || 0) + 1;
          if (this.escape >= this.escapeNeed && o.state === 'grabbing') { o.release(); }
          break;
        case 'slam': {
          this.frame(this.t < 0.18 ? 'grab' : this.t < 0.7 ? 'lift' : 'sit');
          if (this.t >= 0.95) this.setState('idle');
          break;
        }
        case 'throwing':
          this.frame(this.t < 0.25 ? 'punch1' : 'idle0');
          if (this.t >= 0.4) this.setState('idle');
          break;
        case 'thrown': {
          const d = this.throwData;
          const p = Math.min(1, this.t / d.dur);
          this.x = Phaser.Math.Linear(d.fromX, d.toX, p);
          this.z = Math.sin(Math.PI * p) * d.height + (1 - p) * d.startZ;
          this.frame('hurt');
          this.sprite.rotation = d.spin * p;
          if (p >= 1) {
            this.z = 0;
            this.scene.onLand(this, d.dmg, d.attacker, true);
          }
          break;
        }
        case 'hurt':
          this.frame('hurt');
          this.x += this.vx * dt;
          this.vx *= Math.pow(0.002, dt);
          if (this.t >= this.stun) this.setState('idle');
          break;
        case 'knock':
          this.frame('hurt');
          this.x += this.vx * dt;
          this.z += this.vz * dt;
          this.vz -= GRAVITY * dt;
          this.sprite.rotation = -this.facing * Math.min(1.2, this.t * 3);
          if (this.z <= 0 && this.t > 0.05) { this.z = 0; this.scene.onLand(this, 0, null, false); }
          break;
        case 'down':
          this.frame('down');
          this.x += this.vx * dt;
          this.vx *= Math.pow(0.001, dt);
          if (this.hp > 0 && this.t >= this.downTime) { this.setState('getup'); }
          break;
        case 'getup':
          this.frame('sit');
          if (this.t >= 0.45) { this.setState('idle'); this.faceOpp(); }
          break;
        case 'pinning':
          this.frame('pin');
          break;
        case 'pinned':
          this.frame('down');
          break;
        case 'win':
          this.play('win');
          break;
        case 'lose':
          this.frame('down');
          break;
        default:
          break;
      }

      if (this.state !== 'thrown' && this.state !== 'knock') this.sprite.rotation = 0;
      this.clampPos();
    }

    // ---- actions -----------------------------------------------------------------
    startPunch(chained) {
      this.setState('punch');
      this.hitDone = false;
      this.bufferPunch = false;
      if (!chained) this.chain = 0;
      this.x += this.facing * 3;
      RR.SFX.whiff();
    }
    startJump(mx) {
      this.setState('jump');
      this.vz = 250;
      this.vx = mx * this.speed * 1.1;
      this.hitDone = false;
      RR.SFX.jump();
    }
    tryGrabOrPin() {
      const o = this.opp;
      const adx = Math.abs(o.x - this.x), ady = Math.abs(o.y - this.y);
      if (o.state === 'down' && o.t > 0.25 && adx < 40 && ady < 16) {
        this.scene.startPin(this, o);
        return;
      }
      const dx = this.dxTo(o);
      if (dx > -2 && dx < 30 && ady < 11 && o.z <= 0 && GRABBABLE.has(o.state)) {
        this.setState('grabbing');
        this.headbutts = 0;
        o.setState('grabbed');
        o.escape = 0;
        o.escapeNeed = 6 + Math.round((1 - o.hp / o.maxHp) * 8);
        o.facing = -this.facing;
        o.x = this.x + this.facing * 20;
        o.y = this.y;
        RR.SFX.grab();
        return;
      }
      this.setState('whiff');
      this.recoverTime = 0.3;
      this.frame('grab');
      RR.SFX.whiff();
    }
    release() {
      const o = this.opp;
      this.setState('recover'); this.recoverTime = 0.2;
      if (o.state === 'grabbed') {
        o.setState('hurt'); o.stun = 0.25; o.vx = this.facing * 140;
      }
      this.vx = 0;
      this.x -= this.facing * 6;
    }
    startSlam() {
      const o = this.opp;
      this.setState('slam');
      o.setState('thrown');
      // defender arcs over the attacker's head and lands behind them
      o.throwData = {
        fromX: o.x, toX: this.x - this.facing * 30, height: 58, startZ: 0,
        spin: -this.facing * Math.PI, dur: 0.62, dmg: DMG.slam, attacker: this
      };
      RR.SFX.grab();
    }
    startThrow() {
      const o = this.opp;
      this.setState('throwing');
      o.setState('thrown');
      const toX = Phaser.Math.Clamp(o.x + this.facing * 120, BOUNDS.x0, BOUNDS.x1);
      o.throwData = { fromX: o.x, toX, height: 34, startZ: 6, spin: this.facing * Math.PI * 0.5, dur: 0.5, dmg: DMG.throw, attacker: this };
      RR.SFX.whiff();
    }

    // ---- receiving -----------------------------------------------------------------
    takeDamage(amount) {
      this.hp = Math.max(0, this.hp - amount);
    }

    render() {
      const flying = this.state === 'thrown' || this.state === 'knock';
      if (flying) {
        this.sprite.setOrigin(0.5, 0.62);
        this.sprite.setPosition(this.x, this.y - this.z - 24);
      } else {
        this.sprite.setOrigin(0.5, RR.FOOT_Y / RR.FH);
        this.sprite.setPosition(this.x, this.y - this.z);
      }
      this.sprite.setFlipX(this.facing < 0);
      this.sprite.setDepth(10 + this.y + (this.state === 'pinning' ? 0.5 : 0) + (flying ? 1 : 0));
      this.shadow.setPosition(this.x, this.y + 1);
      const s = Math.max(0.5, 1 - this.z / 160);
      this.shadow.setScale(2 * s, 2 * s);
    }

    destroy() { this.sprite.destroy(); this.shadow.destroy(); }
  }

  RR.Fighter = Fighter;
  RR.BOUNDS = BOUNDS;
})(window);
