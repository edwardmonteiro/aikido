/* LIMIAR — personagens vetoriais com esqueleto animado em tempo real.
 *
 * Cada lutador é uma silhueta suave desenhada a cada quadro a partir de um
 * esqueleto. As poses são interpoladas (nada de quadros "pulando"), a
 * caminhada e a respiração são procedurais, e casaco/cachecol/faixa usam
 * física de corrente (Verlet). Luz de recorte (rim light) na cor do ato.
 * Ângulos: 0 = para baixo, +90 = para frente (direção do olhar).
 */
(function (global) {
  'use strict';
  const LIM = global.LIM = global.LIM || {};

  const P = (lean, bArm, fArm, bLeg, fLeg, extra) =>
    Object.assign({ lean, ba0: bArm[0], ba1: bArm[1], fa0: fArm[0], fa1: fArm[1], bl0: bLeg[0], bl1: bLeg[1], fl0: fLeg[0], fl1: fLeg[1], drop: 0, head: 0 }, extra || {});
  const KEYS = ['lean', 'ba0', 'ba1', 'fa0', 'fa1', 'bl0', 'bl1', 'fl0', 'fl1', 'drop', 'head'];

  const POSES = {
    idle:    P(7, [28, 148], [44, 162], [-14, -6], [18, 8]),
    walk:    P(10, [20, 140], [40, 160], [0, 0], [0, 0]),
    punch0:  P(0, [32, 150], [10, 172], [-18, -8], [20, 10]),
    punch1:  P(20, [12, 128], [90, 92], [-30, -18], [28, 12], { drop: 3 }),
    kick0:   P(-8, [36, 150], [46, 160], [-6, -2], [74, -24]),
    kick1:   P(-24, [-46, -24], [30, 118], [-10, -4], [96, 98]),
    block:   P(3, [58, 168], [64, 174], [-22, -8], [24, 8], { drop: 3 }),
    dodge:   P(36, [-64, -40], [-44, -20], [-40, -14], [50, 12], { drop: 8 }),
    hurt:    P(-24, [-44, -10], [-64, -22], [-12, -4], [16, 2], { head: -18 }),
    down:    P(-90, [-150, -130], [-122, -100], [92, 96], [86, 94]),
    sit:     P(-26, [-22, 8], [-12, 18], [90, 92], [84, 88]),
    special: P(-8, [-100, -92], [100, 92], [-28, -10], [28, 10], { drop: 4 }),
    tele:    P(-12, [160, 186], [172, 192], [-20, -6], [22, 8]),
    slam:    P(34, [56, 48], [64, 46], [-32, -14], [36, 12], { drop: 6 }),
    sweep:   P(14, [82, 90], [98, 96], [-26, -10], [26, 10], { drop: 3 }),
    kneel:   P(14, [12, 6], [16, 6], [12, -90], [82, 2], { head: 24 }),
    win:     P(0, [-150, -175], [150, 178], [-16, -6], [16, 6])
  };
  // Poses de golpe chegam rápido; o resto desliza
  const RATE = { punch1: 55, kick1: 50, slam: 45, sweep: 45, special: 40, hurt: 34, dodge: 30, block: 34, punch0: 40, kick0: 40, tele: 18 };

  const CAST = {
    aren:     { body: 0x15121c, back: 0x221c2c, rim: 0xe8b465, eye: 0xffe2b0, size: 1.0, bulk: 1.0, hood: true, coat: true, scarf: true },
    errante:  { body: 0x0a090e, back: 0x16131e, rim: 0x8c7ad0, eye: 0xffffff, size: 0.96, bulk: 0.88, hunch: 12, wisps: true, longArms: 1.12 },
    guarda:   { body: 0x1a1a22, back: 0x262632, rim: 0xb0b8cc, eye: 0xffc46a, size: 1.05, bulk: 1.14, helmet: true, shield: true, pauldron: true },
    duelista: { body: 0x110e16, back: 0x1d1824, rim: 0xd6daf0, eye: 0xffffff, size: 1.0, bulk: 0.86, sword: true, sash: true, topknot: true },
    vigia:    { body: 0x6c4626, back: 0x52341a, rim: 0xffd286, eye: 0xffe08a, plate: 0x3a2412, size: 1.5, bulk: 1.3, helmet: true, hammer: true },
    courier:  { body: 0x2a2432, back: 0x342c3e, rim: 0xe0aa5c, eye: 0xffe2b0, size: 0.9, bulk: 0.9, cap: true, bag: true }
  };

  const rad = (d) => (d * Math.PI) / 180;
  const pol = (x, y, len, deg) => [x + Math.sin(rad(deg)) * len, y + Math.cos(rad(deg)) * len];

  // ---- caneta: abstrai Phaser.Graphics e Canvas2D --------------------------------------
  function graphicsPen(g) {
    return {
      poly(pts, col, a) { g.fillStyle(col, a == null ? 1 : a); g.fillPoints(pts, true); },
      circle(x, y, r, col, a) { g.fillStyle(col, a == null ? 1 : a); g.fillCircle(x, y, r); },
      ellipse(x, y, w, h, col, a) { g.fillStyle(col, a == null ? 1 : a); g.fillEllipse(x, y, w, h); },
      line(x1, y1, x2, y2, w, col, a) { g.lineStyle(w, col, a == null ? 1 : a); g.lineBetween(x1, y1, x2, y2); }
    };
  }
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  function canvasPen(ctx) {
    return {
      poly(pts, col, a) { ctx.globalAlpha = a == null ? 1 : a; ctx.fillStyle = hex(col); ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; },
      circle(x, y, r, col, a) { ctx.globalAlpha = a == null ? 1 : a; ctx.fillStyle = hex(col); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; },
      ellipse(x, y, w, h, col, a) { ctx.globalAlpha = a == null ? 1 : a; ctx.fillStyle = hex(col); ctx.beginPath(); ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; },
      line(x1, y1, x2, y2, w, col, a) { ctx.globalAlpha = a == null ? 1 : a; ctx.strokeStyle = hex(col); ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.globalAlpha = 1; }
    };
  }

  // ---- geometria --------------------------------------------------------------------------
  function capsule(ax, ay, bx, by, ra, rb) {
    const ang = Math.atan2(by - ay, bx - ax), pts = [], n = 6;
    for (let i = 0; i <= n; i++) { const t = ang - Math.PI / 2 + (Math.PI * i) / n; pts.push({ x: bx + Math.cos(t) * rb, y: by + Math.sin(t) * rb }); }
    for (let i = 0; i <= n; i++) { const t = ang + Math.PI / 2 + (Math.PI * i) / n; pts.push({ x: ax + Math.cos(t) * ra, y: ay + Math.sin(t) * ra }); }
    return pts;
  }
  function ribbon(pts, w0, w1) {
    const L = [], R = [], n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b.x - a.x, dy = b.y - a.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const w = (w0 + (w1 - w0) * (i / (n - 1))) / 2;
      L.push({ x: pts[i].x - dy * w, y: pts[i].y + dx * w }); R.push({ x: pts[i].x + dy * w, y: pts[i].y - dx * w });
    }
    return L.concat(R.reverse());
  }

  class Chain {
    constructor(n, len) { this.n = n; this.len = len; this.p = null; }
    step(ax, ay, dt, windX, grav, flutter, t) {
      if (!this.p) { this.p = []; for (let i = 0; i < this.n; i++) this.p.push({ x: ax, y: ay + i * this.len, px: ax, py: ay + i * this.len }); }
      const p = this.p; p[0].x = ax; p[0].y = ay; p[0].px = ax; p[0].py = ay;
      const k = Math.min(dt, 1 / 30) * 60;
      for (let i = 1; i < p.length; i++) {
        const q = p[i], vx = (q.x - q.px) * 0.92, vy = (q.y - q.py) * 0.92;
        q.px = q.x; q.py = q.y;
        q.x += vx + windX * 0.012 * k * k + Math.sin(t * 9 + i * 1.3) * flutter * 0.03 * k;
        q.y += vy + grav * 0.012 * k * k + Math.cos(t * 7 + i) * flutter * 0.015 * k;
      }
      for (let it = 0; it < 4; it++) for (let i = 1; i < p.length; i++) {
        const a = p[i - 1], b = p[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, f = (d - this.len) / d;
        if (i === 1) { b.x -= dx * f; b.y -= dy * f; } else { a.x += dx * f * 0.5; a.y += dy * f * 0.5; b.x -= dx * f * 0.5; b.y -= dy * f * 0.5; }
      }
      return p;
    }
  }

  // ---- Rig -----------------------------------------------------------------------------------------
  class Rig {
    constructor(scene, type, opts) {
      this.scene = scene; this.type = type; this.c = CAST[type];
      this.cur = Object.assign({}, POSES.idle);
      this.target = 'idle'; this.rate = 14;
      this.walkPhase = 0; this.time = Math.random() * 10;
      this.flash = 0; this.tele = false; this.aura = null; this.armor = false;
      this.alpha = 1;
      if (scene && !(opts && opts.noGraphics)) {
        this.back = scene.add.graphics(); // cachecol/casaco atrás do corpo
        this.g = scene.add.graphics();
      }
      if (this.c.scarf) { this.scarfA = new Chain(8, 5); this.scarfB = new Chain(6, 4.6); }
      if (this.c.coat) { this.coatA = new Chain(5, 7); this.coatB = new Chain(5, 6.5); }
      if (this.c.sash) this.sash = new Chain(6, 5);
    }

    setPose(name) {
      if (!POSES[name]) name = 'idle';
      if (this.target !== name) { this.target = name; this.rate = RATE[name] || 14; }
    }

    // calcula a pose interpolada
    step(dt, moveSpeed) {
      this.time += dt;
      let tgt = POSES[this.target];
      if (this.target === 'walk') {
        this.walkPhase += dt * (moveSpeed || 1) * 9.5;
        const s = Math.sin(this.walkPhase), c2 = Math.cos(this.walkPhase);
        tgt = Object.assign({}, tgt, {
          bl0: 26 * s, bl1: 26 * s - 26 * Math.max(0, -c2),
          fl0: -26 * s, fl1: -26 * s - 26 * Math.max(0, c2),
          ba0: 24 - 18 * s, fa0: 40 + 18 * s,
          drop: Math.abs(Math.sin(this.walkPhase)) * 2.5
        });
      } else if (this.target === 'idle' || this.target === 'block') {
        const b = Math.sin(this.time * 2.6);
        tgt = Object.assign({}, tgt, { drop: tgt.drop + 1 + b * 1.1, fa1: tgt.fa1 + b * 3, ba1: tgt.ba1 - b * 3, lean: tgt.lean + b * 0.8 });
      } else if (this.target === 'win') {
        const b = Math.sin(this.time * 3);
        tgt = Object.assign({}, tgt, { drop: 1 + b * 1.5, fa1: tgt.fa1 + b * 6, ba1: tgt.ba1 - b * 6 });
      }
      const k = 1 - Math.exp(-(this.target === 'walk' ? 26 : this.rate) * dt);
      KEYS.forEach((key) => { this.cur[key] += (tgt[key] - this.cur[key]) * k; });
      this.flash = Math.max(0, this.flash - dt * 6);
    }

    skeleton() {
      const c = this.c, s = c.size, p = this.cur;
      const L = { torso: 27 * s, uArm: 16.5 * s * (c.longArms || 1), fArm: 15 * s * (c.longArms || 1), thigh: 23 * s, shin: 23 * s };
      const lean = p.lean + (c.hunch && Math.abs(p.lean) < 40 ? c.hunch : 0);
      const hip = [0, 0];
      const neck = [Math.sin(rad(lean)) * L.torso, -Math.cos(rad(lean)) * L.torso];
      const sh = [neck[0] - Math.sin(rad(lean)) * 4 * s, neck[1] + Math.cos(rad(lean)) * 4 * s];
      const limb = (st, a0, a1, l1, l2) => { const m = pol(st[0], st[1], l1, a0); return [st, m, pol(m[0], m[1], l2, a1)]; };
      const ha = lean + p.head;
      const head = [neck[0] + Math.sin(rad(ha)) * 9 * s, neck[1] - Math.cos(rad(ha)) * 9 * s];
      const sk = {
        hip, neck, head, lean, ha, L, sh,
        bArm: limb([sh[0] - 1.5, sh[1]], p.ba0, p.ba1, L.uArm, L.fArm),
        fArm: limb([sh[0] + 1.5, sh[1]], p.fa0, p.fa1, L.uArm, L.fArm),
        bLeg: limb([hip[0] - 2, hip[1]], p.bl0, p.bl1, L.thigh, L.shin),
        fLeg: limb([hip[0] + 2, hip[1]], p.fl0, p.fl1, L.thigh, L.shin)
      };
      const pts = [sk.head, sk.neck, sk.hip, ...sk.bArm, ...sk.fArm, ...sk.bLeg, ...sk.fLeg];
      let maxY = -Infinity;
      pts.forEach((q) => { maxY = Math.max(maxY, q[1]); });
      maxY = Math.max(maxY + 4 * s, sk.head[1] + 8 * s);
      const dy = -maxY + p.drop;
      pts.forEach((q) => { q[1] += dy; });
      return sk;
    }

    /** Desenha no mundo. x,y = pés; f = ±1; rot = rotação (queda). */
    draw(x, y, f, rot, dt, pen, backPen) {
      const sk = this.skeleton(), c = this.c, s = c.size, bk = c.bulk;
      const pivotY = -36 * s, cr = Math.cos(rot || 0), sr = Math.sin(rot || 0);
      const T = (lx, ly) => {
        const ry = ly - pivotY, rx = lx * cr - ry * sr, rr = lx * sr + ry * cr;
        return { x: x + f * rx, y: y + rr + pivotY };
      };
      const TP = (arr) => arr.map((q) => T(q.x, q.y));
      const flashing = this.flash > 0.05;
      const rimCol = flashing ? 0xffffff : this.tele ? (Math.floor(this.time * 14) % 2 ? 0xffffff : 0xffe08a) : this.armor ? 0xfff0b0 : c.rim;
      const bodyCol = flashing ? 0xfff4e0 : c.body, backCol = flashing ? 0xe8dcc8 : c.back;
      const RX = -1.6, RY = -1.3; // deslocamento da luz de recorte (vem de trás/cima)
      // duas passadas: primeiro a luz de recorte de TODA a silhueta, depois os preenchimentos
      // (assim não aparecem contornos entre os membros)
      const queue = [];
      const part = (pts, col) => { queue.push({ pts, col, rim: true }); };
      const partNoRim = (pts, col, a) => { queue.push({ pts, col, a, rim: false }); };
      const circleQ = (x2, y2, r2, col, a) => { queue.push({ circle: [x2, y2, r2], col, a }); };

      // aura (vínculo, armadura)
      if (this.aura != null) pen.ellipse(T(0, -40 * s).x, T(0, -40 * s).y, 70 * s, 110 * s, this.aura, 0.18 + 0.06 * Math.sin(this.time * 5));

      // ---- tecidos atrás do corpo (física) ----------------------------------------------
      const bp = backPen || pen;
      const hipW = T(sk.hip[0] - 4 * s, sk.hip[1] - 2);
      const neckW = T(sk.neck[0] - 2, sk.neck[1] + 3);
      const wind = (-f * 60 + (this.scene && this.scene.wind || 0) - (this.vx || 0) * 0.35);
      if (this.coatA) {
        const a = this.coatA.step(hipW.x, hipW.y - 4, dt, wind * 0.25, 60, 4, this.time);
        const b = this.coatB.step(hipW.x + f * 6, hipW.y - 2, dt, wind * 0.2, 64, 3, this.time + 1);
        bp.poly(ribbon(b, 13, 5), backCol);
        bp.poly(ribbon(a.map((q) => ({ x: q.x + RX * f, y: q.y + RY })), 15, 5), rimCol, 0.85);
        bp.poly(ribbon(a, 15, 5), bodyCol);
      }
      if (this.sash) {
        const a = this.sash.step(hipW.x, hipW.y - 4, dt, wind * 0.8, 18, 10, this.time);
        bp.poly(ribbon(a, 5, 2), 0xeeeeee);
      }
      if (this.scarfA) {
        const a = this.scarfA.step(neckW.x, neckW.y, dt, wind, 10, 12, this.time);
        const b = this.scarfB.step(neckW.x + f * 1, neckW.y + 2, dt, wind * 0.8, 14, 9, this.time + 2);
        bp.poly(ribbon(b, 5.5, 2), 0x8e1418);
        bp.poly(ribbon(a, 7, 2.5), 0xc8202a);
        bp.poly(ribbon(a.slice(0, 5), 2, 1), 0xff6a58, 0.6);
      }

      // ---- membros e corpo -------------------------------------------------------------------
      const arm = (A, col) => {
        part(capsule(A[0][0], A[0][1], A[1][0], A[1][1], 5.2 * s * bk, 4.4 * s * bk), col);
        part(capsule(A[1][0], A[1][1], A[2][0], A[2][1], 4.4 * s * bk, 3.6 * s * bk), col);
        part(circlePts(A[2][0], A[2][1], 4.2 * s), col);
      };
      const leg = (Lg, col) => {
        part(capsule(Lg[0][0], Lg[0][1], Lg[1][0], Lg[1][1], 7.2 * s * bk, 5.4 * s), col);
        part(capsule(Lg[1][0], Lg[1][1], Lg[2][0], Lg[2][1], 5.4 * s, 3.8 * s), col);
        const dx = Lg[2][0] - Lg[1][0], dy = Lg[2][1] - Lg[1][1], d = Math.hypot(dx, dy) || 1;
        const fx = dy / d, fy = -dx / d; // frente do pé
        const ax = Lg[2][0], ay = Lg[2][1];
        part([{ x: ax - fx * 3 * s, y: ay - fy * 3 * s - 2 }, { x: ax + fx * 10 * s, y: ay + fy * 10 * s }, { x: ax + fx * 9 * s + dx / d * 3, y: ay + fy * 9 * s + dy / d * 3 }, { x: ax - fx * 3.5 * s + dx / d * 3.5, y: ay - fy * 3.5 * s + dy / d * 3.5 }], col);
      };
      const torso = () => {
        const H = sk.hip, N = sk.neck, ux = (N[0] - H[0]) / sk.L.torso, uy = (N[1] - H[1]) / sk.L.torso;
        const px = -uy, py = ux; // perpendicular "para frente"
        const prof = [[0, 7.5, 7.5], [0.22, 6.5, 7], [0.5, 8.5, 7], [0.78, 9.5, 8.5], [0.93, 7, 7], [1.05, 3.5, 3.5]];
        const front = [], back = [];
        prof.forEach(([t, fw, bw]) => {
          const cx = H[0] + ux * sk.L.torso * t, cy = H[1] + uy * sk.L.torso * t;
          front.push({ x: cx + px * fw * s * bk, y: cy + py * fw * s * bk });
          back.push({ x: cx - px * bw * s * bk, y: cy - py * bw * s * bk });
        });
        part(front.concat(back.reverse()), bodyCol);
        if (c.plate) { // placas da armadura
          const m = (k) => [H[0] + ux * sk.L.torso * k, H[1] + uy * sk.L.torso * k];
          [[0.35, 7], [0.62, 8]].forEach(([k, w]) => { const q = m(k); partNoRim(capsule(q[0] - px * w * s, q[1] - py * w * s, q[0] + px * w * s, q[1] + py * w * s, 1.6 * s, 1.6 * s), c.plate); });
          const q = m(0.7); circleQ(T(q[0] + px * 2, q[1]).x, T(q[0] + px * 2, q[1]).y, 3 * s, c.rim, 0.7);
        }
        // cinto
        const b0 = [H[0] + ux * 3, H[1] + uy * 3];
        partNoRim(capsule(b0[0] - px * 7.5 * s * bk, b0[1] - py * 7.5 * s * bk, b0[0] + px * 7.5 * s * bk, b0[1] + py * 7.5 * s * bk, 1.6, 1.6), c.plate || 0x050407);

      };
      const head = () => {
        const [hx, hy] = sk.head, r = 7.6 * s;
        if (c.hood) {
          part([{ x: hx - r * 1.25, y: hy + r * 0.2 }, { x: hx - r * 1.1, y: hy - r * 0.9 }, { x: hx - r * 0.2, y: hy - r * 1.35 }, { x: hx + r * 0.9, y: hy - r * 0.9 }, { x: hx + r * 1.15, y: hy + r * 0.1 }, { x: hx + r * 0.7, y: hy + r * 1.1 }, { x: hx - r * 0.6, y: hy + r * 1.5 }, { x: hx - r * 1.9, y: hy + r * 1.0 }], bodyCol);
        } else part(circlePts(hx, hy, r), bodyCol);
        if (c.helmet) part([{ x: hx - r * 1.1, y: hy - r * 0.2 }, { x: hx - r * 0.5, y: hy - r * 1.5 }, { x: hx + r * 0.9, y: hy - r * 1.1 }, { x: hx + r * 1.1, y: hy + r * 0.1 }], c.plate || bodyCol);
        if (c.helmet) part(capsule(hx - r * 0.8, hy - r * 1.4, hx - r * 1.9, hy - r * 0.6, 2 * s, 1 * s), c.rim);
        if (c.topknot) part(circlePts(hx - r * 0.5, hy - r * 1.1, r * 0.45), bodyCol);
        if (c.cap) part([{ x: hx - r, y: hy - r * 0.3 }, { x: hx - r * 0.6, y: hy - r * 1.2 }, { x: hx + r * 0.8, y: hy - r * 1.0 }, { x: hx + r * 1.7, y: hy - r * 0.35 }], bodyCol);
        // olhos (brilho)
        if (this.target !== 'down') {
          const e = T(hx + r * 0.45, hy - r * 0.05);
          const eyeCol = flashing ? 0xffffff : c.eye;
          circleQ(e.x, e.y, (this.tele ? 6 : 3.4) * s, eyeCol, 0.2);
          queue.push({ ellipse: [e.x, e.y, 3.2 * s, 1.5 * s], col: eyeCol, a: 1 });
          if (this.type === 'errante') { const e2 = T(hx + r * 0.05, hy - r * 0.05); queue.push({ ellipse: [e2.x, e2.y, 2.4 * s, 1.3 * s], col: eyeCol, a: 0.9 }); }
        }
      };
      const weapon = (A) => {
        const [, e, h] = A, dx = h[0] - e[0], dy = h[1] - e[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
        if (c.sword) {
          const tip = [h[0] + ux * 34, h[1] + uy * 34];
          partNoRim(capsule(h[0] - ux * 2, h[1] - uy * 2, tip[0], tip[1], 1.6, 0.4), 0xc8cce0);
          queue.push({ line: [T(h[0], h[1]).x, T(h[0], h[1]).y, T(tip[0], tip[1]).x, T(tip[0], tip[1]).y, 0.7], col: 0xffffff, a: 0.9 });
          partNoRim(capsule(h[0] - uy * 4, h[1] + ux * 4, h[0] + uy * 4, h[1] - ux * 4, 1.4, 1.4), 0x8a7040);
        } else if (c.shield) {
          const cx = h[0] + 3, cy = h[1];
          part([{ x: cx - 5, y: cy - 15 }, { x: cx + 6, y: cy - 15 }, { x: cx + 7, y: cy + 4 }, { x: cx + 0.5, y: cy + 17 }, { x: cx - 6, y: cy + 4 }], 0x4e3b28);
          partNoRim([{ x: cx - 2, y: cy - 11 }, { x: cx + 3, y: cy - 11 }, { x: cx + 3.5, y: cy + 3 }, { x: cx + 0.5, y: cy + 11 }, { x: cx - 2.5, y: cy + 3 }], 0x6e5436);
          circleQ(T(cx + 0.5, cy - 2).x, T(cx + 0.5, cy - 2).y, 2.4, 0xe0aa5c, 0.9);
        } else if (c.hammer) {
          const end = [h[0] + ux * 40, h[1] + uy * 40];
          part(capsule(h[0] - ux * 6, h[1] - uy * 6, end[0], end[1], 2.4, 2.4), 0x4a3018);
          const px = -uy, py = ux, hw = 15, hl = 11;
          part([{ x: end[0] - px * hw, y: end[1] - py * hw }, { x: end[0] + px * hw, y: end[1] + py * hw }, { x: end[0] + px * hw + ux * hl, y: end[1] + py * hw + uy * hl }, { x: end[0] - px * hw + ux * hl, y: end[1] - py * hw + uy * hl }], bodyCol);
          partNoRim([{ x: end[0] - px * hw, y: end[1] - py * hw }, { x: end[0] + px * hw, y: end[1] + py * hw }, { x: end[0] + px * hw + ux * 3, y: end[1] + py * hw + uy * 3 }, { x: end[0] - px * hw + ux * 3, y: end[1] - py * hw + uy * 3 }], c.plate);
        }
      };

      arm(sk.bArm, backCol);
      leg(sk.bLeg, backCol);
      torso();
      if (c.bag) part(circlePts(sk.hip[0] - 8 * s, sk.hip[1] - 4, 6 * s), 0x4a3020);
      leg(sk.fLeg, bodyCol);
      if (c.pauldron) part(circlePts(sk.sh[0] + 1, sk.sh[1], 8 * s), c.back);
      head();
      if (this.scarfA) { // nó do cachecol na frente
        const n = T(sk.neck[0], sk.neck[1] + 2);
        queue.push({ ellipse: [n.x, n.y, 15 * s, 8 * s], col: 0xc8202a, a: 1 });
        queue.push({ ellipse: [n.x - f * 1.5, n.y - 1.5, 9 * s, 3 * s], col: 0xff6a58, a: 0.5 });
      }
      arm(sk.fArm, bodyCol);
      weapon(sk.fArm);
      // passada 1: recorte; passada 2: corpo e detalhes, na ordem
      queue.forEach((q) => { if (q.rim) pen.poly(q.pts.map((v) => T(v.x + RX, v.y + RY)), rimCol); });
      queue.forEach((q) => {
        if (q.pts) pen.poly(TP(q.pts), q.col, q.a);
        else if (q.circle) pen.circle(q.circle[0], q.circle[1], q.circle[2], q.col, q.a);
        else if (q.ellipse) pen.ellipse(q.ellipse[0], q.ellipse[1], q.ellipse[2], q.ellipse[3], q.col, q.a);
        else if (q.line) pen.line(q.line[0], q.line[1], q.line[2], q.line[3], q.line[4], q.col, q.a);
      });

      // fiapos de sombra (Errante)
      if (c.wisps) {
        for (let i = 0; i < 4; i++) {
          const t = this.time * 2 + i * 1.7, b = T(sk.neck[0] - 4 + i * 2, sk.neck[1] + 4 + i * 4);
          const tip = { x: b.x - f * (14 + 6 * Math.sin(t)), y: b.y - 10 - 8 * Math.abs(Math.cos(t * 0.7)) };
          pen.poly(ribbon([b, { x: (b.x + tip.x) / 2 + Math.sin(t * 2) * 3, y: (b.y + tip.y) / 2 }, tip], 5, 0.5), c.body, 0.8);
        }
      }
      this.lastNeck = T(sk.neck[0], sk.neck[1]);
      this.lastHead = T(sk.head[0], sk.head[1]);
      this.lastHand = T(sk.fArm[2][0], sk.fArm[2][1]);
    }

    render(x, y, f, rot, dt, depth) {
      if (!this.g) return;
      this.back.clear(); this.g.clear();
      this.draw(x, y, f, rot, dt, graphicsPen(this.g), graphicsPen(this.back));
      this.g.setDepth(depth); this.back.setDepth(depth - 0.05);
      this.g.setAlpha(this.alpha); this.back.setAlpha(this.alpha);
    }
    setVisible(v) { if (this.g) { this.g.setVisible(v); this.back.setVisible(v); } }
    destroy() { if (this.g) { this.g.destroy(); this.back.destroy(); } }
  }

  function circlePts(x, y, r) { const pts = []; for (let i = 0; i < 12; i++) { const t = (i / 12) * Math.PI * 2; pts.push({ x: x + Math.cos(t) * r, y: y + Math.sin(t) * r }); } return pts; }

  /** Desenha um personagem estático num canvas (retratos, cenas). */
  function drawToCanvas(ctx, type, pose, x, y, f, scale) {
    const r = new Rig(null, type, { noGraphics: true });
    r.cur = Object.assign({}, POSES[pose] || POSES.idle);
    r.target = pose; r.scene = { wind: 0 };
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    // tecidos estáticos: aquece a física alguns passos
    for (let i = 0; i < 40; i++) r.draw(0, 0, f, 0, 1 / 60, { poly() {}, circle() {}, ellipse() {}, line() {} });
    r.draw(0, 0, f, 0, 1 / 60, canvasPen(ctx));
    ctx.restore();
  }

  Object.assign(LIM, { Rig, RIG_CAST: CAST, POSES_V: POSES, drawRigToCanvas: drawToCanvas, hexColor: hex });
})(window);
