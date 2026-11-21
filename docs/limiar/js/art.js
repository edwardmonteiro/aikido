/* LIMIAR — cenários, objetos, efeitos e retratos gerados em código (alta resolução).
 * Texturas desenhadas em 2× (960×540 para uma tela lógica de 480×270) e exibidas
 * em escala 0,5: gradientes suaves, névoa, halos e reflexos molhados.
 */
(function (global) {
  'use strict';
  const LIM = global.LIM = global.LIM || {};
  const TW = 960, TH = 540;

  function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function add(scene, key, canvas) { if (scene.textures.exists(key)) scene.textures.remove(key); scene.textures.addCanvas(key, canvas); }
  function glowAt(g, x, y, r, rgb, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function vgrad(g, y0, y1, stops) {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr;
  }
  // desenha uma forma em x e x±TW para repetir sem emenda
  function wrap(fn, x, w) { fn(x); if (x + w > TW) fn(x - TW); if (x < 0) fn(x + TW); }

  // ---- skylines --------------------------------------------------------------------------------
  function skyline(g, R, opts) {
    const { base, minH, maxH, colTop, colBot, win, winA, rimCol, towers, domes } = opts;
    let x = -20;
    while (x < TW) {
      const w = 40 + R() * 70, h = minH + R() * (maxH - minH), top = base - h;
      const kind = R();
      wrap((ox) => {
        g.fillStyle = vgrad(g, top - 60, base + 40, [[0, colTop], [1, colBot]]);
        g.fillRect(ox, top, w, h + 200);
        g.beginPath();
        if (kind < 0.45) { g.moveTo(ox - 4, top); g.lineTo(ox + w / 2, top - 18 - R() * 14); g.lineTo(ox + w + 4, top); }
        else if (kind < 0.6 && domes) { g.moveTo(ox + 4, top); g.arc(ox + w / 2, top, w / 2 - 4, Math.PI, 0); }
        g.fill();
        if (towers && kind > 0.82) {
          const tx = ox + w / 2 - 7; g.fillRect(tx, top - 70, 14, 70);
          g.beginPath(); g.moveTo(tx - 6, top - 70); g.lineTo(tx + 7, top - 104); g.lineTo(tx + 20, top - 70); g.fill();
          if (rimCol) { g.fillStyle = rimCol; g.fillRect(tx + 4, top - 58, 6, 10); }
        }
        if (rimCol) { g.fillStyle = rimCol; g.globalAlpha = 0.35; g.fillRect(ox, top, w, 1.5); g.globalAlpha = 1; }
        for (let wy = top + 12; wy < base - 8; wy += 16) for (let wx = ox + 7; wx < ox + w - 8; wx += 13) {
          if (R() < win) { g.fillStyle = `rgba(${opts.winRgb || '255,200,130'},${winA * (0.4 + R() * 0.6)})`; g.fillRect(wx, wy, 4, 7); }
        }
      }, x, w);
      x += w + R() * 6;
    }
  }

  // ---- temas -----------------------------------------------------------------------------------------
  const THEMES = {
    street(scene) {
      const R = rng(11);
      let c = cv(TW, TH), g = c.getContext('2d');
      g.fillStyle = vgrad(g, 0, 380, [[0, '#090816'], [0.45, '#2a1c38'], [0.82, '#b9784a'], [1, '#e6a25c']]); g.fillRect(0, 0, TW, TH);
      for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,240,220,${0.2 + R() * 0.6})`; g.fillRect(R() * TW, R() * 170, R() < 0.1 ? 2 : 1, R() < 0.1 ? 2 : 1); }
      glowAt(g, 640, 360, 330, '255,170,90', 0.45);
      glowAt(g, 640, 360, 90, '255,226,170', 0.95);
      g.fillStyle = 'rgba(255,236,200,0.95)'; g.beginPath(); g.arc(640, 360, 48, Math.PI, 0); g.fill();
      for (let i = 0; i < 7; i++) { const y = 200 + R() * 120, x = R() * TW, w = 200 + R() * 260; g.fillStyle = vgrad(g, y - 8, y + 10, [[0, 'rgba(90,50,70,0)'], [0.6, 'rgba(120,60,70,0.45)'], [1, 'rgba(255,170,110,0.35)']]); g.beginPath(); g.ellipse(x, y, w / 2, 9, 0, 0, Math.PI * 2); g.fill(); }
      add(scene, 'bg-sky', c);
      c = cv(TW, TH); g = c.getContext('2d');
      skyline(g, R, { base: 400, minH: 60, maxH: 170, colTop: '#5a3a4c', colBot: '#3a2638', win: 0.12, winA: 0.5, rimCol: 'rgba(255,190,120,0.9)', towers: true, domes: true });
      g.fillStyle = vgrad(g, 260, 400, [[0, 'rgba(200,130,100,0)'], [1, 'rgba(200,130,100,0.35)']]); g.fillRect(0, 260, TW, 280);
      add(scene, 'bg-far', c);
      c = cv(TW, TH); g = c.getContext('2d');
      skyline(g, R, { base: 372, minH: 140, maxH: 270, colTop: '#21182a', colBot: '#140f1a', win: 0.22, winA: 0.85, rimCol: 'rgba(255,180,110,0.8)', towers: false });
      for (let i = 0; i < 6; i++) { const x = 60 + i * 160 + R() * 40, y = 160 + R() * 90; g.strokeStyle = '#0c0910'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - 60, y - 30); g.quadraticCurveTo(x, y + 20, x + 70, y - 26); g.stroke(); glowAt(g, x, y - 4, 34, '255,190,110', 0.55); g.fillStyle = '#ffd7a0'; g.beginPath(); g.ellipse(x, y - 4, 4, 6, 0, 0, 7); g.fill(); }
      add(scene, 'bg-mid', c);
      groundStreet(scene, R, '#251c27', '#0d0a11', '255,190,120');
      fog(scene, R, '214,150,120', 0.28);
    },
    warehouse(scene) {
      const R = rng(29);
      let c = cv(TW, TH), g = c.getContext('2d');
      g.fillStyle = vgrad(g, 0, TH, [[0, '#120e12'], [1, '#1e171b']]); g.fillRect(0, 0, TW, TH);
      for (let y = 0; y < 380; y += 14) for (let x = ((y / 14) % 2) * 14; x < TW; x += 28) { g.fillStyle = `rgba(${40 + R() * 20},${28 + R() * 12},${30 + R() * 12},0.6)`; g.fillRect(x, y, 26, 12); }
      for (let i = 0; i < 4; i++) {
        const x = 70 + i * 240;
        g.fillStyle = '#0a0c14'; g.fillRect(x - 4, 40, 128, 210);
        g.fillStyle = vgrad(g, 44, 246, [[0, '#4a5878'], [1, '#26304a']]); g.fillRect(x, 44, 120, 202);
        g.fillStyle = '#0a0c14'; g.fillRect(x + 58, 44, 4, 202); for (let k = 0; k < 4; k++) g.fillRect(x, 92 + k * 48, 120, 3);
        glowAt(g, x + 60, 140, 140, '120,150,210', 0.18);
      }
      add(scene, 'bg-sky', c);
      c = cv(TW, TH); g = c.getContext('2d');
      for (let i = 0; i < 7; i++) {
        const x = R() * TW, w = 80 + R() * 90, h = 70 + R() * 110;
        wrap((ox) => { for (let k = 0; k < h; k += 36) { g.fillStyle = k % 72 ? '#191216' : '#150f12'; g.fillRect(ox, 372 - k - 36, w, 34); g.fillStyle = 'rgba(214,166,90,0.12)'; g.fillRect(ox, 372 - k - 36, w, 2); } }, x, w);
      }
      g.strokeStyle = '#08060a'; g.lineWidth = 3; for (let i = 0; i < 5; i++) { const x = 100 + i * 190; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 6, 140 + R() * 80); g.stroke(); }
      add(scene, 'bg-far', c);
      c = cv(TW, TH); g = c.getContext('2d');
      for (let i = 0; i < 4; i++) { // fachos de luz da lua
        const x = 70 + i * 240;
        const gr = g.createLinearGradient(x + 60, 60, x + 160, 380); gr.addColorStop(0, 'rgba(150,175,230,0.22)'); gr.addColorStop(1, 'rgba(150,175,230,0)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(x, 60); g.lineTo(x + 120, 60); g.lineTo(x + 260, 380); g.lineTo(x + 100, 380); g.fill();
      }
      for (let i = 0; i < 3; i++) { const x = 160 + i * 320; g.fillStyle = '#08060a'; g.fillRect(x - 1, 0, 2, 60); g.beginPath(); g.moveTo(x - 16, 72); g.lineTo(x + 16, 72); g.lineTo(x + 8, 60); g.lineTo(x - 8, 60); g.fill(); glowAt(g, x, 78, 60, '255,190,110', 0.45); const gr = g.createLinearGradient(0, 72, 0, 372); gr.addColorStop(0, 'rgba(255,190,110,0.18)'); gr.addColorStop(1, 'rgba(255,190,110,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(x - 14, 72); g.lineTo(x + 14, 72); g.lineTo(x + 110, 372); g.lineTo(x - 110, 372); g.fill(); }
      add(scene, 'bg-mid', c);
      groundStreet(scene, R, '#2a2428', '#100c10', '150,175,230', true);
      fog(scene, R, '170,160,170', 0.16);
    },
    rooftop(scene) {
      const R = rng(53);
      let c = cv(TW, TH), g = c.getContext('2d');
      g.fillStyle = vgrad(g, 0, 400, [[0, '#05070e'], [0.55, '#151c32'], [1, '#3e4462']]); g.fillRect(0, 0, TW, TH);
      glowAt(g, 260, 110, 220, '170,190,240', 0.25);
      for (let i = 0; i < 14; i++) { const x = R() * TW, y = 40 + R() * 220, w = 220 + R() * 300; g.fillStyle = vgrad(g, y - 30, y + 30, [[0, 'rgba(40,46,70,0.0)'], [0.5, 'rgba(28,32,52,0.85)'], [1, 'rgba(80,90,130,0.35)']]); g.beginPath(); g.ellipse(x, y, w / 2, 26 + R() * 18, 0, 0, Math.PI * 2); g.fill(); }
      add(scene, 'bg-sky', c);
      c = cv(TW, TH); g = c.getContext('2d');
      skyline(g, R, { base: 400, minH: 80, maxH: 190, colTop: '#2a3048', colBot: '#1a1e30', win: 0.16, winA: 0.55, winRgb: '220,200,150', rimCol: 'rgba(140,160,220,0.7)', towers: true });
      g.fillStyle = '#141828'; g.fillRect(660, 190, 90, 220); g.beginPath(); g.arc(705, 190, 48, Math.PI, 0); g.fill();
      g.fillStyle = 'rgba(255,214,140,0.85)'; g.fillRect(700, 146, 10, 40); glowAt(g, 705, 166, 50, '255,214,140', 0.4);
      g.fillStyle = vgrad(g, 280, 400, [[0, 'rgba(120,130,170,0)'], [1, 'rgba(120,130,170,0.3)']]); g.fillRect(0, 280, TW, 260);
      add(scene, 'bg-far', c);
      c = cv(TW, TH); g = c.getContext('2d');
      let x = -10;
      while (x < TW) {
        const w = 90 + R() * 120, top = 300 + R() * 50;
        wrap((ox) => {
          g.fillStyle = '#0b0d16'; g.beginPath(); g.moveTo(ox, 380); g.lineTo(ox, top + 20); g.lineTo(ox + w * 0.5, top); g.lineTo(ox + w, top + 20); g.lineTo(ox + w, 380); g.fill();
          g.strokeStyle = 'rgba(140,160,210,0.45)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(ox, top + 20); g.lineTo(ox + w * 0.5, top); g.lineTo(ox + w, top + 20); g.stroke();
          if (R() < 0.6) { const cx = ox + 14 + R() * (w - 30); g.fillStyle = '#0b0d16'; g.fillRect(cx, top - 34, 14, 40); g.fillStyle = 'rgba(140,160,210,0.4)'; g.fillRect(cx, top - 34, 14, 1.5); }
          if (R() < 0.4) { const ax = ox + R() * w; g.strokeStyle = '#0b0d16'; g.lineWidth = 2; g.beginPath(); g.moveTo(ax, top); g.lineTo(ax, top - 60); g.moveTo(ax - 10, top - 50); g.lineTo(ax + 10, top - 50); g.stroke(); }
        }, x, w);
        x += w;
      }
      add(scene, 'bg-mid', c);
      groundRoof(scene, R);
      fog(scene, R, '120,130,170', 0.22);
    },
    gate(scene) {
      const R = rng(71);
      let c = cv(TW, TH), g = c.getContext('2d');
      g.fillStyle = vgrad(g, 0, 400, [[0, '#0d0812'], [0.45, '#3c1820'], [0.85, '#c4643a'], [1, '#f0a050']]); g.fillRect(0, 0, TW, TH);
      glowAt(g, 480, 380, 420, '255,140,70', 0.5);
      glowAt(g, 480, 380, 120, '255,220,160', 0.95);
      g.fillStyle = 'rgba(255,232,190,0.95)'; g.beginPath(); g.arc(480, 380, 70, Math.PI, 0); g.fill();
      for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,230,210,${0.2 + R() * 0.5})`; g.fillRect(R() * TW, R() * 150, 1, 1); }
      add(scene, 'bg-sky', c);
      c = cv(TW, TH); g = c.getContext('2d');
      skyline(g, R, { base: 405, minH: 50, maxH: 140, colTop: '#5a2a30', colBot: '#3a1a22', win: 0.08, winA: 0.5, rimCol: 'rgba(255,170,100,0.9)', towers: true, domes: true });
      g.fillStyle = vgrad(g, 280, 405, [[0, 'rgba(230,120,80,0)'], [1, 'rgba(230,120,80,0.4)']]); g.fillRect(0, 280, TW, 260);
      add(scene, 'bg-far', c);
      c = cv(TW, TH); g = c.getContext('2d');
      // o Portão do Sino
      g.fillStyle = '#120a10';
      g.fillRect(250, 70, 90, 320); g.fillRect(620, 70, 90, 320); g.fillRect(230, 50, 500, 50);
      g.beginPath(); g.moveTo(340, 390); g.lineTo(340, 200); g.arc(480, 200, 140, Math.PI, 0); g.lineTo(620, 390); g.lineTo(600, 390); g.lineTo(600, 210); g.arc(480, 210, 120, 0, Math.PI, true); g.lineTo(360, 390); g.fill();
      g.strokeStyle = 'rgba(255,180,110,0.55)'; g.lineWidth = 2; g.beginPath(); g.arc(480, 200, 140, Math.PI, 0); g.stroke();
      g.beginPath(); g.moveTo(230, 50); g.lineTo(730, 50); g.stroke();
      g.fillStyle = '#7a4a22'; g.beginPath(); g.moveTo(440, 190); g.quadraticCurveTo(440, 130, 480, 126); g.quadraticCurveTo(520, 130, 520, 190); g.lineTo(530, 206); g.lineTo(430, 206); g.fill();
      g.fillStyle = 'rgba(255,210,140,0.75)'; g.fillRect(430, 204, 100, 3); g.fillRect(476, 112, 8, 16);
      glowAt(g, 480, 170, 80, '255,190,110', 0.35);
      [200, 760].forEach((bx) => { g.fillStyle = '#0c0608'; g.fillRect(bx - 6, 300, 12, 80); g.beginPath(); g.moveTo(bx - 20, 300); g.lineTo(bx + 20, 300); g.lineTo(bx + 12, 290); g.lineTo(bx - 12, 290); g.fill(); glowAt(g, bx, 282, 90, '255,150,70', 0.6); });
      add(scene, 'bg-mid', c);
      groundStreet(scene, R, '#2a1e1e', '#0e0a0a', '255,160,90');
      fog(scene, R, '230,140,100', 0.22);
    }
  };

  function groundStreet(scene, R, top, bot, refl, indoor) {
    const c = cv(TW, 180), g = c.getContext('2d');
    g.fillStyle = vgrad(g, 0, 180, [[0, top], [1, bot]]); g.fillRect(0, 0, TW, 180);
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 0, TW, 10);
    g.fillStyle = `rgba(${refl},0.35)`; g.fillRect(0, 10, TW, 1.5);
    let y = 16, h = 9;
    while (y < 180) {
      const off = R() * 30;
      for (let x = -off; x < TW; x += h * 2.6) { g.fillStyle = `rgba(${indoor ? '255,255,255' : '255,220,200'},${0.012 + R() * 0.025})`; g.beginPath(); g.ellipse(x + h * 1.2, y + h / 2, h * 1.2, h * 0.3, 0, 0, Math.PI * 2); g.fill(); }
      y += h + 2; h *= 1.12;
    }
    // reflexos molhados das lanternas (alinhados a cada 240 px do mundo)
    [240, 720].forEach((x) => {
      const gr = g.createLinearGradient(0, 10, 0, 180); gr.addColorStop(0, `rgba(${refl},0.45)`); gr.addColorStop(1, `rgba(${refl},0)`);
      g.fillStyle = gr; for (let k = 0; k < 6; k++) g.fillRect(x - 10 + R() * 20, 12, 2 + R() * 4, 120 + R() * 50);
    });
    for (let i = 0; i < 10; i++) { g.fillStyle = `rgba(${refl},${0.05 + R() * 0.08})`; g.beginPath(); g.ellipse(R() * TW, 30 + R() * 140, 30 + R() * 50, 3 + R() * 4, 0, 0, Math.PI * 2); g.fill(); }
    add(scene, 'bg-ground', c);
  }
  function groundRoof(scene, R) {
    const c = cv(TW, 180), g = c.getContext('2d');
    g.fillStyle = vgrad(g, 0, 180, [[0, '#4a3022'], [1, '#160e0a']]); g.fillRect(0, 0, TW, 180);
    for (let x = 0; x < TW; x += 32) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, 0, 3, 180); g.fillStyle = 'rgba(255,170,110,0.12)'; g.fillRect(x + 3, 0, 1, 180); }
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 0, TW, 8); g.fillStyle = 'rgba(200,120,70,0.6)'; g.fillRect(0, 8, TW, 1.5);
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(150,170,220,${0.05 + R() * 0.1})`; g.fillRect(R() * TW, 14 + R() * 160, 1 + R() * 2, 20 + R() * 60); }
    add(scene, 'bg-ground', c);
  }
  function fog(scene, R, rgb, a) {
    const c = cv(TW, 200), g = c.getContext('2d');
    for (let i = 0; i < 26; i++) { const x = R() * TW, y = 60 + R() * 110, w = 120 + R() * 220; wrap((ox) => { const gr = g.createRadialGradient(ox, y, 0, ox, y, w / 2); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.save(); g.translate(ox, y); g.scale(1, 0.32); g.translate(-ox, -y); g.fillRect(ox - w / 2, y - w / 2, w, w); g.restore(); }, x - w / 2, w); }
    add(scene, 'bg-fog', c);
  }

  // ---- objetos, efeitos e retratos (uma vez) ---------------------------------------------------------
  function buildCommon(scene) {
    let c = cv(128, 128), g = c.getContext('2d');
    glowAt(g, 64, 64, 64, '255,255,255', 1); add(scene, 'glow', c);
    c = cv(128, 128); g = c.getContext('2d');
    glowAt(g, 64, 64, 64, '120,110,130', 0.55); add(scene, 'puff', c);
    c = cv(128, 32); g = c.getContext('2d');
    g.save(); g.scale(1, 0.25); glowAt(g, 64, 64, 64, '0,0,0', 0.75); g.restore(); add(scene, 'shadow', c);
    c = cv(64, 64); g = c.getContext('2d');
    glowAt(g, 32, 32, 30, '255,240,200', 0.9);
    g.fillStyle = '#fff'; [0, 1, 2, 3].forEach((k) => { g.save(); g.translate(32, 32); g.rotate(k * Math.PI / 4); g.beginPath(); g.moveTo(-30, 0); g.lineTo(0, -2.2); g.lineTo(30, 0); g.lineTo(0, 2.2); g.fill(); g.restore(); });
    add(scene, 'spark', c);
    c = cv(64, 6); g = c.getContext('2d');
    const sg = g.createLinearGradient(0, 0, 64, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(1, 'rgba(255,255,255,1)'); g.fillStyle = sg; g.fillRect(0, 1, 64, 4);
    add(scene, 'streak', c);
    c = cv(4, 40); g = c.getContext('2d');
    const rg = g.createLinearGradient(0, 0, 0, 40); rg.addColorStop(0, 'rgba(180,200,240,0)'); rg.addColorStop(1, 'rgba(200,215,250,0.7)'); g.fillStyle = rg; g.fillRect(1, 0, 2, 40);
    add(scene, 'rain', c);
    c = cv(960, 540); g = c.getContext('2d');
    const vg = g.createRadialGradient(480, 270, 200, 480, 270, 620); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.7)'); g.fillStyle = vg; g.fillRect(0, 0, 960, 540);
    add(scene, 'vignette', c);
    // poste de lanterna de ferro (2×)
    ['on', 'off'].forEach((st) => {
      c = cv(80, 230); g = c.getContext('2d');
      g.fillStyle = '#07060a';
      g.fillRect(34, 40, 8, 180); g.fillRect(24, 214, 28, 14); g.fillRect(28, 206, 20, 10);
      [80, 140].forEach((y) => g.fillRect(31, y, 14, 5));
      g.beginPath(); g.moveTo(38, 40); g.quadraticCurveTo(38, 14, 62, 16); g.lineTo(62, 22); g.quadraticCurveTo(44, 22, 44, 40); g.fill();
      g.fillRect(54, 22, 16, 4); g.beginPath(); g.moveTo(52, 26); g.lineTo(72, 26); g.lineTo(68, 52); g.lineTo(56, 52); g.fill();
      if (st === 'on') { g.fillStyle = '#ffd9a0'; g.fillRect(57, 29, 10, 20); g.fillStyle = '#fff3d8'; g.fillRect(60, 32, 4, 14); }
      else { g.fillStyle = '#2a2430'; g.fillRect(57, 29, 10, 20); }
      g.fillStyle = 'rgba(232,180,101,0.5)'; g.fillRect(34, 40, 1.5, 170);
      add(scene, 'lamp-' + st, c);
    });
    // cone de luz
    c = cv(160, 360); g = c.getContext('2d');
    const cg = g.createLinearGradient(0, 0, 0, 360); cg.addColorStop(0, 'rgba(255,210,150,0.5)'); cg.addColorStop(1, 'rgba(255,210,150,0)');
    g.fillStyle = cg; g.beginPath(); g.moveTo(70, 0); g.lineTo(90, 0); g.lineTo(160, 360); g.lineTo(0, 360); g.fill();
    add(scene, 'cone', c);
    // caixa
    c = cv(64, 56); g = c.getContext('2d');
    g.fillStyle = '#120a06'; g.fillRect(0, 0, 64, 56);
    g.fillStyle = vgrad(g, 0, 56, [[0, '#7a5230'], [1, '#4a3018']]); g.fillRect(3, 3, 58, 50);
    g.fillStyle = 'rgba(0,0,0,0.35)'; for (let y = 3; y < 53; y += 12) g.fillRect(3, y, 58, 1.5);
    g.strokeStyle = '#2a1a0c'; g.lineWidth = 5; g.beginPath(); g.moveTo(6, 6); g.lineTo(58, 50); g.stroke();
    g.fillStyle = '#3a3a44'; [[2, 2], [54, 2], [2, 46], [54, 46]].forEach(([x, y]) => g.fillRect(x, y, 8, 8));
    g.fillStyle = 'rgba(255,200,130,0.35)'; g.fillRect(3, 3, 58, 2);
    add(scene, 'crate', c);
    // portão de aço
    c = cv(44, 240); g = c.getContext('2d');
    g.fillStyle = '#08080c'; g.fillRect(0, 0, 44, 240);
    for (let y = 4; y < 240; y += 14) { g.fillStyle = vgrad(g, y, y + 12, [[0, '#4a4c5a'], [1, '#26262e']]); g.fillRect(3, y, 38, 12); }
    g.fillStyle = '#e0aa5c'; g.fillRect(3, 116, 38, 5);
    add(scene, 'door', c);
    // memória
    c = cv(48, 48); g = c.getContext('2d');
    glowAt(g, 24, 24, 24, '255,214,140', 0.7);
    g.fillStyle = '#ffe2a8'; g.beginPath(); g.moveTo(24, 6); g.lineTo(36, 24); g.lineTo(24, 42); g.lineTo(12, 24); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(24, 12); g.lineTo(29, 24); g.lineTo(24, 32); g.lineTo(20, 24); g.fill();
    add(scene, 'memory', c);
    buildPortraits(scene);
  }

  function buildPortraits(scene) {
    const list = { aren: ['aren', 0xe8b465], courier: ['courier', 0xe0aa5c], vigia: ['vigia', 0xffd286], eco: ['aren', 0x7ab8ff], narrador: [null, 0xe0aa5c], lira: [null, 0xffc060] };
    Object.keys(list).forEach((k) => {
      const [type, rim] = list[k];
      const c = cv(96, 96), g = c.getContext('2d');
      g.fillStyle = vgrad(g, 0, 96, [[0, '#1a1422'], [1, '#08060c']]); g.fillRect(0, 0, 96, 96);
      glowAt(g, 30, 30, 70, LIM.hexColor(rim).slice(1).match(/../g).map((h) => parseInt(h, 16)).join(','), 0.35);
      if (type) {
        const sc = type === 'vigia' ? 1.2 : 1.9;
        LIM.drawRigToCanvas(g, type, 'idle', 48, type === 'vigia' ? 200 : 210, 1, sc);
      } else {
        g.fillStyle = LIM.hexColor(rim); g.font = '700 46px Cinzel, serif'; g.textAlign = 'center'; g.fillText(k === 'lira' ? 'L' : '“', 48, 66);
      }
      g.strokeStyle = LIM.hexColor(rim); g.lineWidth = 2; g.strokeRect(1, 1, 94, 94);
      add(scene, 'pt-' + k, c);
    });
  }

  let commonBuilt = false;
  LIM.buildArt = function (scene) { if (!commonBuilt) { buildCommon(scene); commonBuilt = true; } };
  LIM.ensureTheme = function (scene, key) {
    if (LIM._theme === key && scene.textures.exists('bg-sky')) return;
    THEMES[key](scene); LIM._theme = key;
  };
})(window);
