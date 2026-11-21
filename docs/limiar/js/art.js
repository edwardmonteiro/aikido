/* LIMIAR — gerador procedural de arte (silhuetas de alto contraste).
 *
 * Nenhum arquivo de imagem: cada personagem é desenhado a partir de poses
 * esqueléticas, com luz de recorte (rim light) na cor do ato. Pivô nos pés,
 * escala única por personagem — conforme o "contrato dos sprites" do GDD §9.
 * Ângulos: 0 = para baixo, +90 = para frente (direção em que o personagem olha).
 */
(function (global) {
  'use strict';
  const LIM = global.LIM = global.LIM || {};

  const P = (lean, bArm, fArm, bLeg, fLeg, extra) =>
    Object.assign({ lean, bArm, fArm, bLeg, fLeg, drop: 0, head: 0 }, extra || {});

  const POSES = {
    idle0: P(6, [25, 150], [40, 165], [-12, -4], [16, 6]),
    idle1: P(8, [27, 146], [42, 160], [-14, -3], [18, 8], { drop: 1 }),
    walk0: P(10, [10, 130], [50, 160], [-26, -12], [26, 14]),
    walk1: P(10, [20, 140], [40, 160], [-6, -24], [6, 18]),
    walk2: P(10, [36, 150], [24, 140], [24, 14], [-24, -12]),
    walk3: P(10, [20, 140], [40, 160], [6, 18], [-6, -24]),
    punch0: P(2, [30, 150], [15, 175], [-16, -6], [18, 8]),
    punch1: P(16, [10, 130], [88, 92], [-28, -16], [26, 10]),
    kick0: P(-6, [30, 150], [40, 160], [-4, -2], [70, -20]),
    kick1: P(-20, [-40, -20], [30, 120], [-8, -4], [94, 96]),
    block: P(2, [55, 165], [62, 172], [-20, -8], [22, 8]),
    dodge: P(34, [-60, -40], [-40, -20], [-36, -14], [46, 12], { drop: 2 }),
    hurt: P(-22, [-40, -10], [-60, -20], [-10, -4], [14, 2], { head: -14 }),
    down: P(-90, [-150, -130], [-120, -100], [92, 96], [86, 94]),
    sit: P(-25, [-20, 10], [-10, 20], [90, 92], [84, 88]),
    special: P(-6, [-95, -90], [95, 90], [-26, -10], [26, 10]),
    tele: P(-10, [160, 185], [170, 190], [-18, -6], [20, 8]),
    slam: P(32, [55, 50], [62, 48], [-30, -14], [34, 12]),
    sweep: P(12, [80, 90], [96, 96], [-24, -10], [24, 10]),
    kneel: P(12, [10, 5], [15, 5], [10, -90], [80, 2], { head: 22 })
  };
  const FRAMES = Object.keys(POSES);

  // ---- Elenco ----------------------------------------------------------------
  const CAST = {
    aren:    { body: '#16101c', rim: '#e0aa5c', eye: '#f4e6c8', size: 1.0, bulk: 1.0, scarf: true },
    errante: { body: '#0b0910', rim: '#7a6aa0', eye: '#ffffff', size: 0.95, bulk: 0.9, ragged: true, hunch: 10 },
    guarda:  { body: '#1b1922', rim: '#9a9aae', eye: '#d6a65a', size: 1.05, bulk: 1.12, weapon: 'shield', crest: true },
    duelista:{ body: '#130f18', rim: '#c8c8dc', eye: '#ffffff', size: 1.0, bulk: 0.88, weapon: 'blade', sash: '#f0f0f0' },
    vigia:   { body: '#6e4824', rim: '#f2c474', eye: '#ffe08a', size: 1.5, bulk: 1.35, weapon: 'hammer', dark: '#3e2810', crest: true },
    courier: { body: '#2a2430', rim: '#d6a65a', eye: '#f4e6c8', size: 0.9, bulk: 0.9, bag: true }
  };

  const rad = (d) => (d * Math.PI) / 180;
  const polar = (x, y, len, deg) => [x + Math.sin(rad(deg)) * len, y + Math.cos(rad(deg)) * len];

  function skeleton(pose, c, FW, FOOT) {
    const s = c.size;
    const L = { torso: 15 * s, uArm: 9 * s, fArm: 8 * s, thigh: 12 * s, shin: 12 * s };
    const lean = pose.lean + (c.hunch && Math.abs(pose.lean) < 40 ? c.hunch : 0);
    const hip = [0, 0];
    const neck = [Math.sin(rad(lean)) * L.torso, -Math.cos(rad(lean)) * L.torso];
    const sh = [neck[0] - Math.sin(rad(lean)) * 2 * s, neck[1] + Math.cos(rad(lean)) * 2 * s];
    const limb = (st, a, l1, l2) => { const m = polar(st[0], st[1], l1, a[0]); return [st, m, polar(m[0], m[1], l2, a[1])]; };
    const ha = lean + (pose.head || 0);
    const head = [neck[0] + Math.sin(rad(ha)) * 5 * s, neck[1] - Math.cos(rad(ha)) * 5 * s];
    const sk = {
      hip, neck, head, lean,
      bArm: limb([sh[0] - 1, sh[1]], pose.bArm, L.uArm, L.fArm),
      fArm: limb([sh[0] + 1, sh[1]], pose.fArm, L.uArm, L.fArm),
      bLeg: limb([hip[0] - 1, hip[1]], pose.bLeg, L.thigh, L.shin),
      fLeg: limb([hip[0] + 1, hip[1]], pose.fLeg, L.thigh, L.shin)
    };
    const pts = [sk.head, sk.neck, sk.hip, ...sk.bArm, ...sk.fArm, ...sk.bLeg, ...sk.fLeg];
    let maxY = -Infinity;
    pts.forEach((p) => { maxY = Math.max(maxY, p[1]); });
    maxY = Math.max(maxY + 2, sk.head[1] + 5 * s);
    const dy = FOOT - maxY + (pose.drop || 0), dx = FW / 2;
    pts.forEach((p) => { p[0] += dx; p[1] += dy; });
    return sk;
  }

  function seg(ctx, a, b, w, col) {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
  function dot(ctx, p, r, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill(); }
  // Desenha com luz de recorte: cópia deslocada na cor do contorno, corpo por cima.
  function rimSeg(ctx, a, b, w, c, col) {
    seg(ctx, [a[0] - 1, a[1] - 1], [b[0] - 1, b[1] - 1], w, c.rim);
    seg(ctx, a, b, w, col || c.body);
  }
  function rimDot(ctx, p, r, c, col) { dot(ctx, [p[0] - 1, p[1] - 1], r, c.rim); dot(ctx, p, r, col || c.body); }

  function drawWeapon(ctx, arm, c) {
    const [, e, h] = arm;
    const dx = h[0] - e[0], dy = h[1] - e[1], len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    if (c.weapon === 'blade') {
      const tip = [h[0] + ux * 15, h[1] + uy * 15];
      seg(ctx, h, tip, 3, '#0a0a10'); seg(ctx, h, tip, 1.4, '#eef0ff');
    } else if (c.weapon === 'shield') {
      ctx.save(); ctx.translate(h[0] + 2, h[1]);
      ctx.fillStyle = '#0c0a0e'; ctx.fillRect(-3, -9, 6, 18);
      ctx.fillStyle = '#5a4630'; ctx.fillRect(-2, -8, 4, 16);
      ctx.fillStyle = c.rim; ctx.fillRect(-2, -8, 1, 16);
      ctx.fillStyle = '#d6a65a'; ctx.fillRect(-1, -2, 2, 3);
      ctx.restore();
    } else if (c.weapon === 'hammer') {
      const end = [h[0] + ux * 20, h[1] + uy * 20];
      seg(ctx, [h[0] - ux * 3, h[1] - uy * 3], end, 3.5, '#1a1008'); seg(ctx, h, end, 2, '#8a6a40');
      ctx.save(); ctx.translate(end[0], end[1]); ctx.rotate(Math.atan2(uy, ux));
      ctx.fillStyle = '#1a1008'; ctx.fillRect(-4, -8, 9, 16);
      ctx.fillStyle = c.body; ctx.fillRect(-3, -7, 7, 14);
      ctx.fillStyle = c.rim; ctx.fillRect(-3, -7, 7, 2);
      ctx.restore();
    }
  }

  function drawFrame(ctx, ox, pose, c, FW, FOOT) {
    const sk = skeleton(pose, c, FW, FOOT);
    const s = c.size, b = c.bulk;
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, 0, FW, 999); ctx.clip(); // nada vaza para o quadro vizinho
    ctx.translate(ox, 0);
    const arm = (a, back) => {
      const col = back ? shade(c.body, -6) : c.body;
      rimSeg(ctx, a[0], a[1], 4.6 * s * b, c, col); rimSeg(ctx, a[1], a[2], 3.8 * s * b, c, col);
      rimDot(ctx, a[2], 2.4 * s, c, col);
    };
    const leg = (l, back) => {
      const col = back ? shade(c.body, -6) : c.body;
      rimSeg(ctx, l[0], l[1], 6 * s * b, c, col); rimSeg(ctx, l[1], l[2], 5 * s, c, col);
      seg(ctx, [l[2][0] - 1, l[2][1]], [l[2][0] + 3 * s, l[2][1]], 3.6 * s, col);
    };
    arm(sk.bArm, true);
    leg(sk.bLeg, true);
    // tronco
    rimSeg(ctx, sk.hip, sk.neck, 10 * s * b, c);
    if (c.dark) { // armadura de bronze: placas
      seg(ctx, [sk.hip[0], sk.hip[1] - 2], [sk.hip[0], sk.hip[1] + 2], 10 * s * b, c.dark);
      const m = [(sk.hip[0] + sk.neck[0]) / 2, (sk.hip[1] + sk.neck[1]) / 2];
      dot(ctx, m, 3 * s, c.dark); dot(ctx, [m[0] - 1, m[1] - 1], 1.5 * s, c.rim);
    }
    if (c.sash) seg(ctx, [sk.hip[0] - 5 * b, sk.hip[1] - 1], [sk.hip[0] + 5 * b, sk.hip[1] - 1], 2, c.sash);
    if (c.bag) dot(ctx, [sk.hip[0] - 5, sk.hip[1] - 2], 4, '#5a3a20');
    if (c.ragged) { // farrapos de sombra
      for (let i = 0; i < 4; i++) seg(ctx, [sk.hip[0] - 4 + i * 3, sk.hip[1]], [sk.hip[0] - 5 + i * 3, sk.hip[1] + 5 + (i % 2) * 2], 1.6, c.body);
    }
    leg(sk.fLeg, false);
    // cabeça
    rimDot(ctx, sk.head, 4.4 * s, c);
    if (c.crest) seg(ctx, [sk.head[0] - 3 * s, sk.head[1] - 4.5 * s], [sk.head[0] + 2 * s, sk.head[1] - 5.5 * s], 2.2 * s, c.rim);
    if (c.scarf) { // nó do cachecol (as pontas são animadas no jogo)
      dot(ctx, [sk.neck[0], sk.neck[1] + 1], 3, '#d42a2a');
      dot(ctx, [sk.neck[0] - 1, sk.neck[1]], 1.4, '#ff5a4a');
    }
    if (pose !== POSES.down) {
      ctx.fillStyle = c.eye;
      const ex = Math.round(sk.head[0] + 1.6 * s), ey = Math.round(sk.head[1] - 1 * s);
      ctx.fillRect(ex, ey, Math.max(1, Math.round(1.6 * s)), 1);
    }
    arm(sk.fArm, false);
    if (c.weapon) drawWeapon(ctx, sk.fArm, c);
    ctx.restore();
    return sk;
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16), cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
    return '#' + ((cl(((n >> 16) & 255) + amt) << 16) | (cl(((n >> 8) & 255) + amt) << 8) | cl((n & 255) + amt)).toString(16).padStart(6, '0');
  }
  function crisp(ctx, w, h) {
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 110 ? 255 : 0;
    ctx.putImageData(img, 0, 0);
  }
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  LIM.NECK = {};      // posição do pescoço por quadro (para o cachecol animado)
  LIM.FRAME_H = {};

  function buildCharacters(scene) {
    Object.keys(CAST).forEach((id) => {
      const c = CAST[id];
      const FW = Math.round(64 * c.size + (c.weapon ? 28 : 0)), FH = Math.round(62 * c.size), FOOT = FH - 3;
      const cv = canvas(FW * FRAMES.length, FH), ctx = cv.getContext('2d');
      LIM.NECK[id] = {};
      FRAMES.forEach((f, i) => {
        const sk = drawFrame(ctx, i * FW, POSES[f], c, FW, FOOT);
        LIM.NECK[id][f] = [sk.neck[0] - FW / 2, sk.neck[1] - FOOT];
      });
      crisp(ctx, cv.width, cv.height);
      const tex = scene.textures.addCanvas('c-' + id, cv);
      FRAMES.forEach((f, i) => tex.add(f, 0, i * FW, 0, FW, FH));
      LIM.FRAME_H[id] = { FW, FH, FOOT };
      const mk = (name, frames, rate) => scene.anims.create({ key: id + '-' + name, frames: frames.map((fr) => ({ key: 'c-' + id, frame: fr })), frameRate: rate, repeat: -1 });
      mk('idle', ['idle0', 'idle1'], 3);
      mk('walk', ['walk0', 'walk1', 'walk2', 'walk3'], id === 'vigia' ? 6 : 9);
    });
  }

  // ---- Efeitos ------------------------------------------------------------------
  function buildFx(scene) {
    let c = canvas(16, 16), g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(7, 0, 2, 16); g.fillRect(0, 7, 16, 2);
    g.fillRect(4, 4, 2, 2); g.fillRect(10, 4, 2, 2); g.fillRect(4, 10, 2, 2); g.fillRect(10, 10, 2, 2);
    g.fillStyle = '#fff2b0'; g.fillRect(6, 6, 4, 4);
    scene.textures.addCanvas('spark', c);
    c = canvas(8, 8); g = c.getContext('2d'); g.fillStyle = '#fff'; g.beginPath(); g.arc(4, 4, 3.5, 0, 7); g.fill();
    scene.textures.addCanvas('dot', c);
    c = canvas(32, 8); g = c.getContext('2d'); g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.ellipse(16, 4, 15, 3.5, 0, 0, 7); g.fill();
    scene.textures.addCanvas('shadow', c);
    c = canvas(2, 7); g = c.getContext('2d'); g.fillStyle = 'rgba(190,200,230,0.55)'; g.fillRect(0, 0, 1, 7);
    scene.textures.addCanvas('rain', c);
    // luz de lanterna
    c = canvas(64, 64); g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,210,130,0.55)'); gr.addColorStop(1, 'rgba(255,170,80,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    scene.textures.addCanvas('glow', c);
    // memória (fragmento)
    c = canvas(12, 12); g = c.getContext('2d');
    g.fillStyle = '#ffd88a'; g.beginPath(); g.moveTo(6, 0); g.lineTo(12, 6); g.lineTo(6, 12); g.lineTo(0, 6); g.fill();
    g.fillStyle = '#fff'; g.fillRect(5, 3, 2, 6);
    scene.textures.addCanvas('memory', c);
    // caixa
    c = canvas(22, 20); g = c.getContext('2d');
    g.fillStyle = '#1a1008'; g.fillRect(0, 0, 22, 20);
    g.fillStyle = '#6a4a28'; g.fillRect(1, 1, 20, 18);
    g.fillStyle = '#8a6a3a'; g.fillRect(1, 1, 20, 2); g.fillRect(1, 9, 20, 2);
    g.strokeStyle = '#3a2410'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(2, 2); g.lineTo(20, 18); g.stroke();
    scene.textures.addCanvas('crate', c);
    // poste de lanterna
    c = canvas(14, 90); g = c.getContext('2d');
    g.fillStyle = '#0a080c'; g.fillRect(6, 10, 3, 80); g.fillRect(2, 86, 11, 4); g.fillRect(3, 4, 9, 9);
    g.fillStyle = '#ffd890'; g.fillRect(5, 6, 5, 5);
    scene.textures.addCanvas('lamp-on', c);
    const c2 = canvas(14, 90), g2 = c2.getContext('2d'); g2.drawImage(c, 0, 0); g2.fillStyle = '#2a2430'; g2.fillRect(5, 6, 5, 5);
    scene.textures.addCanvas('lamp-off', c2);
    // portão de aço (armazém)
    c = canvas(20, 120); g = c.getContext('2d');
    g.fillStyle = '#0c0c10'; g.fillRect(0, 0, 20, 120);
    g.fillStyle = '#3a3a48'; for (let y = 2; y < 120; y += 8) g.fillRect(2, y, 16, 6);
    g.fillStyle = '#d6a65a'; g.fillRect(2, 56, 16, 3);
    scene.textures.addCanvas('door', c);
  }

  // ---- Cenários (parallax em 3 planos) --------------------------------------------
  function rng(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  const THEMES = {
    street:    { sky: ['#0d0a1c', '#3a2440', '#d6a65a'], far: '#1c1428', mid: '#120c1a', win: '#ffcf7a', ground: '#1a1620', groundHi: '#d6a65a' },
    warehouse: { sky: ['#0a0a10', '#18141c', '#2a2026'], far: '#221a1e', mid: '#16101a', win: '#d6a65a', ground: '#24202a', groundHi: '#8a7a6a', indoor: true },
    rooftop:   { sky: ['#06080f', '#1c2238', '#6a5a6a'], far: '#141828', mid: '#0e1018', win: '#e0c080', ground: '#3a2418', groundHi: '#c87a40', roof: true },
    gate:      { sky: ['#0e0814', '#3a1c24', '#e09a4a'], far: '#1e1420', mid: '#140c16', win: '#ffd890', ground: '#1e1a1a', groundHi: '#e0aa5c', gate: true }
  };

  function buildBackgrounds(scene) {
    Object.keys(THEMES).forEach((key) => {
      const T = THEMES[key], R = rng(key.length * 97 + 3);
      const W = 240;
      // céu (fixo)
      let c = canvas(W, 135), g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 100);
      gr.addColorStop(0, T.sky[0]); gr.addColorStop(0.6, T.sky[1]); gr.addColorStop(1, T.sky[2]);
      g.fillStyle = gr; g.fillRect(0, 0, W, 135);
      if (!T.indoor) {
        // o sol que não nasce: meio disco preso no horizonte
        g.fillStyle = 'rgba(255,200,120,0.25)'; g.beginPath(); g.arc(170, 100, 26, Math.PI, 0); g.fill();
        g.fillStyle = 'rgba(255,220,150,0.6)'; g.beginPath(); g.arc(170, 100, 15, Math.PI, 0); g.fill();
        for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.2 + R() * 0.5) + ')'; g.fillRect(Math.floor(R() * W), Math.floor(R() * 50), 1, 1); }
      }
      scene.textures.addCanvas('bg-' + key + '-sky', c);

      // plano distante: telhados de cobre, torres de sino (repetível)
      c = canvas(W, 135); g = c.getContext('2d');
      g.fillStyle = T.far;
      if (T.indoor) {
        g.fillStyle = '#1c1418'; g.fillRect(0, 0, W, 135);
        for (let y = 0; y < 100; y += 6) for (let x = (y / 6) % 2 ? 0 : 6; x < W; x += 12) { g.fillStyle = R() < 0.5 ? '#241a1e' : '#2a1e22'; g.fillRect(x, y, 11, 5); }
        g.fillStyle = '#0c080a'; for (let x = 10; x < W; x += 60) g.fillRect(x, 0, 6, 100);
        g.fillStyle = 'rgba(214,166,90,0.25)'; for (let x = 30; x < W; x += 60) { g.fillRect(x, 20, 20, 14); }
      } else {
        let x = 0;
        while (x < W) {
          const w = 14 + Math.floor(R() * 22), h = 30 + Math.floor(R() * 40);
          g.fillRect(x, 100 - h, w, h + 35);
          g.beginPath(); g.moveTo(x - 2, 100 - h); g.lineTo(x + w / 2, 100 - h - 8 - R() * 6); g.lineTo(x + w + 2, 100 - h); g.fill();
          if (R() < 0.25) { g.fillRect(x + w / 2 - 2, 100 - h - 26, 4, 20); g.beginPath(); g.moveTo(x + w / 2 - 5, 100 - h - 26); g.lineTo(x + w / 2, 100 - h - 36); g.lineTo(x + w / 2 + 5, 100 - h - 26); g.fill(); }
          for (let k = 0; k < 3; k++) if (R() < 0.35) { g.fillStyle = 'rgba(255,200,120,0.35)'; g.fillRect(x + 3 + Math.floor(R() * (w - 6)), 100 - h + 6 + Math.floor(R() * (h - 10)), 1, 2); g.fillStyle = T.far; }
          x += w + Math.floor(R() * 3);
        }
        if (T.roof) { g.fillStyle = '#0c1020'; g.beginPath(); g.arc(60, 70, 16, Math.PI, 0); g.fill(); g.fillRect(44, 70, 32, 40); g.fillStyle = 'rgba(224,192,128,0.5)'; g.fillRect(58, 58, 4, 10); }
      }
      scene.textures.addCanvas('bg-' + key + '-far', c);

      // plano médio: fachadas próximas com janelas/lanternas
      c = canvas(W, 135); g = c.getContext('2d');
      if (T.indoor) {
        for (let x = 0; x < W; x += 40) {
          g.fillStyle = '#0e0a0c'; g.fillRect(x + 4, 70, 28, 30);
          g.fillStyle = '#3a2814'; g.fillRect(x + 5, 71, 26, 28);
          g.fillStyle = '#4a341a'; g.fillRect(x + 5, 71, 26, 3); g.fillRect(x + 5, 84, 26, 2);
          if (R() < 0.6) { g.fillStyle = '#3a2814'; g.fillRect(x + 10, 52, 18, 18); g.fillStyle = '#4a341a'; g.fillRect(x + 10, 52, 18, 2); }
        }
        g.fillStyle = '#0a0808'; g.fillRect(0, 0, W, 8);
        g.fillStyle = '#d6a65a'; for (let x = 20; x < W; x += 80) { g.fillRect(x, 8, 1, 14); g.fillRect(x - 3, 22, 7, 3); }
      } else {
        let x = 0;
        while (x < W) {
          const w = 30 + Math.floor(R() * 26), h = 50 + Math.floor(R() * 30);
          g.fillStyle = T.mid; g.fillRect(x, 102 - h, w, h + 40);
          g.fillStyle = T.groundHi; g.globalAlpha = 0.35; g.fillRect(x, 102 - h, w, 1); g.globalAlpha = 1;
          for (let wy = 102 - h + 8; wy < 96; wy += 12) for (let wx = x + 4; wx < x + w - 6; wx += 9) {
            if (R() < 0.3) { g.fillStyle = T.win; g.globalAlpha = 0.4 + R() * 0.4; g.fillRect(wx, wy, 4, 6); g.globalAlpha = 1; }
            else { g.fillStyle = '#0a0810'; g.fillRect(wx, wy, 4, 6); }
          }
          x += w + 4 + Math.floor(R() * 10);
        }
        if (T.gate) {
          g.fillStyle = '#0a060a'; g.fillRect(90, 30, 60, 80); g.fillRect(80, 22, 80, 10);
          g.fillStyle = '#8a5a28'; g.beginPath(); g.arc(120, 52, 12, Math.PI, 0); g.fill(); g.fillRect(108, 52, 24, 8);
          g.fillStyle = '#f2c474'; g.fillRect(108, 52, 24, 1);
        }
      }
      scene.textures.addCanvas('bg-' + key + '-mid', c);

      // chão molhado (repetível)
      c = canvas(W, 45); g = c.getContext('2d');
      g.fillStyle = T.ground; g.fillRect(0, 0, W, 45);
      g.fillStyle = shade(T.ground, 14); g.fillRect(0, 0, W, 2);
      for (let y = 4; y < 45; y += 6) {
        const off = (y / 6) % 2 ? 0 : 6;
        for (let x = off; x < W; x += 12) { g.fillStyle = shade(T.ground, R() < 0.5 ? -6 : 6); g.fillRect(x, y, 11, 5); }
      }
      // reflexos
      for (let i = 0; i < 26; i++) { g.fillStyle = T.groundHi; g.globalAlpha = 0.15 + R() * 0.2; g.fillRect(Math.floor(R() * W), 4 + Math.floor(R() * 40), 4 + Math.floor(R() * 10), 1); }
      g.globalAlpha = 1;
      crisp(g, W, 45);
      scene.textures.addCanvas('bg-' + key + '-ground', c);
    });
  }

  // Retrato para diálogos (silhueta + cor do personagem)
  function buildPortraits(scene) {
    const P2 = {
      aren: ['#16101c', '#e0aa5c', '#d42a2a'], courier: ['#2a2430', '#d6a65a', null],
      vigia: ['#6e4824', '#f2c474', null], eco: ['#16101c', '#7ab8ff', '#d42a2a'],
      narrador: ['#0a0810', '#d6a65a', null], lira: ['#e8dcc8', '#ffc060', null]
    };
    Object.keys(P2).forEach((k) => {
      const [body, rim, scarf] = P2[k];
      const c = canvas(28, 28), g = c.getContext('2d');
      g.fillStyle = '#0a0810'; g.fillRect(0, 0, 28, 28);
      g.fillStyle = rim; g.beginPath(); g.arc(13, 11, 7, 0, 7); g.fill(); g.fillRect(3, 19, 21, 10);
      g.fillStyle = body; g.beginPath(); g.arc(14, 12, 7, 0, 7); g.fill(); g.fillRect(4, 20, 21, 9);
      if (scarf) { g.fillStyle = scarf; g.fillRect(8, 18, 13, 3); g.fillRect(6, 20, 3, 6); }
      g.fillStyle = k === 'vigia' ? '#ffe08a' : '#f4e6c8'; g.fillRect(17, 11, 2, 1);
      crisp(g, 28, 28);
      g.strokeStyle = rim; g.lineWidth = 1; g.strokeRect(0.5, 0.5, 27, 27);
      scene.textures.addCanvas('pt-' + k, c);
    });
  }

  LIM.buildArt = function (scene) {
    buildCharacters(scene); buildFx(scene); buildBackgrounds(scene); buildPortraits(scene);
  };
  LIM.CAST = CAST;
})(window);
