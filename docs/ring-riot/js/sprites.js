/* Ring Riot — procedural pixel-art generator.
 *
 * Every sprite in the game is drawn here at runtime from a tiny skeletal pose
 * description, so the game ships with zero image files and all art is original
 * and MIT-licensed with the rest of the code.
 *
 * A pose is a set of joint angles. Convention: angle 0 points straight down,
 * +90 points "forward" (the way the fighter faces, +x in the texture).
 */
(function (global) {
  'use strict';

  const FW = 64;        // low-res frame width
  const FH = 60;        // low-res frame height
  const FOOT_Y = 57;    // ground line inside the frame
  const SCALE = 2;      // on-screen pixel scale

  // ---- Roster (original characters) ---------------------------------------
  const ROSTER = [
    {
      id: 'duke', name: 'DUKE DYNAMO', from: 'Las Vegas, USA',
      skin: '#f0b080', skinDark: '#c07848', hair: '#ffe060', hairStyle: 'flattop',
      trunks: '#8a3cff', trunksDark: '#5a1cb8', boots: '#f4f4f4', bootsDark: '#a8a8c0',
      band: '#ffe060', bulk: 1.0,
      stats: { power: 3, speed: 3, stamina: 3 }, blurb: 'All-round showman.'
    },
    {
      id: 'tormenta', name: 'LA TORMENTA', from: 'Guadalajara, MX',
      skin: '#d89060', skinDark: '#a06038', hair: '#18c0b0', hairStyle: 'mask',
      mask: '#18c0b0', maskTrim: '#ffd23c',
      trunks: '#18c0b0', trunksDark: '#0c7a70', boots: '#ffd23c', bootsDark: '#b08a10',
      band: '#ffd23c', bulk: 0.9,
      stats: { power: 2, speed: 5, stamina: 2 }, blurb: 'Fast high-flyer.'
    },
    {
      id: 'grizz', name: 'GRIZZ BOULDER', from: 'Yukon, CA',
      skin: '#8a5a3a', skinDark: '#5c3820', hair: '#2a1a10', hairStyle: 'beard',
      trunks: '#ff7a1a', trunksDark: '#b84a00', boots: '#303038', bootsDark: '#14141a',
      band: '#ff7a1a', bulk: 1.18,
      stats: { power: 5, speed: 1, stamina: 4 }, blurb: 'Slow, crushing power.'
    },
    {
      id: 'viper', name: 'VIPER VANCE', from: 'Sydney, AU',
      skin: '#f2c09a', skinDark: '#c08860', hair: '#4cff5a', hairStyle: 'mohawk',
      trunks: '#26a838', trunksDark: '#146a20', boots: '#202020', bootsDark: '#000000',
      band: '#4cff5a', bulk: 1.0,
      stats: { power: 4, speed: 3, stamina: 2 }, blurb: 'Dirty brawler.'
    }
  ];

  // ---- Poses ---------------------------------------------------------------
  // lean: torso angle from vertical (+ forward). arms/legs: [upper, lower].
  const P = (lean, bArm, fArm, bLeg, fLeg, extra) =>
    Object.assign({ lean, bArm, fArm, bLeg, fLeg, drop: 0, rot: 0 }, extra || {});

  const POSES = {
    idle0: P(8, [20, 140], [38, 160], [-14, -6], [18, 8]),
    idle1: P(10, [22, 136], [40, 156], [-16, -4], [20, 10], { drop: 1 }),
    walk0: P(10, [10, 130], [50, 160], [-26, -12], [26, 14]),
    walk1: P(10, [20, 140], [40, 160], [-6, -24], [6, 18]),
    walk2: P(10, [36, 150], [24, 140], [24, 14], [-24, -12]),
    walk3: P(10, [20, 140], [40, 160], [6, 18], [-6, -24]),
    punch0: P(0, [20, 140], [10, 175], [-18, -8], [20, 10]),
    punch1: P(20, [5, 120], [88, 92], [-32, -20], [32, 12]),
    jump: P(5, [150, 175], [160, 185], [35, -40], [55, -15]),
    kick: P(-62, [-130, -110], [-150, -120], [86, 90], [80, 84]),
    grab: P(16, [70, 105], [78, 110], [-20, -10], [22, 10]),
    lift: P(-26, [165, 185], [170, 190], [-22, -8], [24, 6]),
    hurt: P(-22, [-40, -10], [-60, -20], [-10, -4], [14, 2], { head: -14 }),
    down: P(-90, [-150, -130], [-120, -100], [92, 96], [86, 94]),
    sit: P(-25, [-20, 10], [-10, 20], [90, 92], [84, 88]),
    pin: P(70, [40, 30], [55, 40], [8, -90], [80, 2]),
    win0: P(0, [-145, -170], [145, 170], [-16, -6], [16, 6]),
    win1: P(-2, [-150, -185], [150, 185], [-18, -6], [18, 6], { drop: 1 }),
    taunt: P(0, [100, 175], [60, 170], [-16, -6], [16, 6])
  };
  const FRAME_NAMES = Object.keys(POSES);

  const rad = (d) => (d * Math.PI) / 180;
  const polar = (x, y, len, deg) => [x + Math.sin(rad(deg)) * len, y + Math.cos(rad(deg)) * len];

  function computeSkeleton(pose, bulk) {
    const L = { torso: 15 * bulk, uArm: 9, fArm: 8, thigh: 12, shin: 12 };
    const hip = [0, 0];
    const neck = [hip[0] + Math.sin(rad(pose.lean)) * L.torso, hip[1] - Math.cos(rad(pose.lean)) * L.torso];
    // shoulders slightly below the neck along the spine
    const sh = [neck[0] - Math.sin(rad(pose.lean)) * 2, neck[1] + Math.cos(rad(pose.lean)) * 2];
    const limb = (start, a, l1, l2) => {
      const mid = polar(start[0], start[1], l1, a[0]);
      const end = polar(mid[0], mid[1], l2, a[1]);
      return [start, mid, end];
    };
    const headA = pose.lean + (pose.head || 0);
    const head = [neck[0] + Math.sin(rad(headA)) * 5, neck[1] - Math.cos(rad(headA)) * 5];
    const sk = {
      hip, neck, head, L,
      bArm: limb([sh[0] - 1, sh[1]], pose.bArm, L.uArm, L.fArm),
      fArm: limb([sh[0] + 1, sh[1]], pose.fArm, L.uArm, L.fArm),
      bLeg: limb([hip[0] - 1, hip[1]], pose.bLeg, L.thigh, L.shin),
      fLeg: limb([hip[0] + 1, hip[1]], pose.fLeg, L.thigh, L.shin)
    };
    // Normalise: lowest point of the body touches the ground line.
    const pts = [sk.head, sk.neck, sk.hip, ...sk.bArm, ...sk.fArm, ...sk.bLeg, ...sk.fLeg];
    let maxY = -Infinity;
    pts.forEach((p) => { maxY = Math.max(maxY, p[1]); });
    const headBottom = sk.head[1] + 5;
    maxY = Math.max(maxY + 2, headBottom);
    const dy = FOOT_Y - maxY + (pose.drop || 0);
    const dx = FW / 2;
    const shift = (p) => { p[0] += dx; p[1] += dy; };
    pts.forEach(shift);
    return sk;
  }

  function seg(ctx, a, b, w, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  function dot(ctx, p, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
    ctx.fill();
  }
  const OUT = '#1a0d14';

  function drawArm(ctx, arm, c, back) {
    const skin = back ? c.skinDark : c.skin;
    const [s, e, h] = arm;
    seg(ctx, s, e, 6.5, OUT); seg(ctx, e, h, 5.5, OUT); dot(ctx, h, 3.2, OUT);
    seg(ctx, s, e, 4.5, skin); seg(ctx, e, h, 3.6, skin);
    // wrist band
    const wb = [e[0] + (h[0] - e[0]) * 0.7, e[1] + (h[1] - e[1]) * 0.7];
    seg(ctx, wb, [e[0] + (h[0] - e[0]) * 0.85, e[1] + (h[1] - e[1]) * 0.85], 3.8, back ? c.bandDark || c.band : c.band);
    dot(ctx, h, 2.3, skin);
  }
  function drawLeg(ctx, leg, c, back) {
    const skin = back ? c.skinDark : c.skin;
    const boots = back ? c.bootsDark : c.boots;
    const [h, k, f] = leg;
    seg(ctx, h, k, 8, OUT); seg(ctx, k, f, 7, OUT);
    seg(ctx, h, k, 6, skin);
    // knee pad + boot
    seg(ctx, k, f, 5, boots);
    dot(ctx, k, 2.6, boots);
    // foot
    const fx = f[0] + 2.5, fy = f[1];
    seg(ctx, [f[0] - 1, fy], [fx, fy], 4.5, OUT);
    seg(ctx, [f[0] - 0.5, fy], [fx - 0.5, fy], 2.8, boots);
  }
  function drawTorso(ctx, sk, c, bulk) {
    const w = 10 * bulk;
    const hip = sk.hip, neck = sk.neck;
    const mid = [(hip[0] + neck[0]) / 2, (hip[1] + neck[1]) / 2];
    seg(ctx, hip, neck, w + 2, OUT);
    seg(ctx, hip, neck, w, c.skin);
    // chest highlight / pecs
    const chest = [neck[0] + (hip[0] - neck[0]) * 0.3, neck[1] + (hip[1] - neck[1]) * 0.3];
    dot(ctx, [chest[0] + 1.5, chest[1]], w * 0.32, c.skinLight);
    // abs shading line
    seg(ctx, [mid[0] + 1, mid[1] - 1], [hip[0] + 1, hip[1] - 2], 1, c.skinDark);
    // trunks
    seg(ctx, [hip[0] - 0.5, hip[1] - 1.5], [hip[0] + 0.5, hip[1] + 2.5], w + 2, OUT);
    seg(ctx, [hip[0] - 0.5, hip[1] - 1], [hip[0] + 0.5, hip[1] + 2], w, c.trunks);
    seg(ctx, [hip[0] - w / 2 + 1, hip[1] - 1.5], [hip[0] + w / 2 - 1, hip[1] - 1.5], 1, c.trunksDark);
  }
  function drawHead(ctx, p, r, c, facing) {
    const f = facing || 1;
    dot(ctx, p, r + 1, OUT);
    const masked = c.hairStyle === 'mask';
    dot(ctx, p, r, masked ? c.mask : c.skin);
    ctx.fillStyle = OUT;
    if (masked) {
      // eye patches
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(p[0] + f * r * 0.15), Math.round(p[1] - r * 0.35), Math.max(1, Math.round(r * 0.45)), Math.max(1, Math.round(r * 0.35)));
      ctx.fillStyle = c.maskTrim;
      ctx.fillRect(Math.round(p[0] - r), Math.round(p[1] - r * 0.75), Math.round(r * 2), Math.max(1, Math.round(r * 0.22)));
      ctx.fillStyle = OUT;
      ctx.fillRect(Math.round(p[0] + f * r * 0.35), Math.round(p[1] - r * 0.3), Math.max(1, Math.round(r * 0.2)), Math.max(1, Math.round(r * 0.25)));
      // mouth opening
      ctx.fillStyle = c.skin;
      ctx.fillRect(Math.round(p[0] + f * r * 0.2), Math.round(p[1] + r * 0.35), Math.max(1, Math.round(r * 0.5)), Math.max(1, Math.round(r * 0.3)));
      return;
    }
    // eye
    ctx.fillRect(Math.round(p[0] + f * r * 0.35), Math.round(p[1] - r * 0.25), Math.max(1, Math.round(r * 0.22)), Math.max(1, Math.round(r * 0.3)));
    // hair
    ctx.fillStyle = c.hair;
    switch (c.hairStyle) {
      case 'flattop':
        ctx.fillRect(Math.round(p[0] - r), Math.round(p[1] - r * 1.35), Math.round(r * 2), Math.round(r * 0.8));
        ctx.fillRect(Math.round(p[0] - r - f * 0.5), Math.round(p[1] - r * 0.7), Math.round(r * 0.7), Math.round(r * 0.9));
        break;
      case 'mohawk':
        for (let i = -2; i <= 2; i++) {
          ctx.fillRect(Math.round(p[0] + i * r * 0.32 - r * 0.15), Math.round(p[1] - r * 1.6 + Math.abs(i) * r * 0.15), Math.max(1, Math.round(r * 0.35)), Math.round(r * 0.9));
        }
        break;
      case 'beard':
        ctx.fillRect(Math.round(p[0] - r * 0.4), Math.round(p[1] + r * 0.1), Math.round(r * 1.4), Math.round(r * 0.9));
        ctx.fillStyle = '#5a3a28';
        ctx.fillRect(Math.round(p[0] - r * 0.3), Math.round(p[1] - r * 0.95), Math.round(r * 0.9), Math.max(1, Math.round(r * 0.25)));
        break;
      default:
        break;
    }
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
    const r = cl(((n >> 16) & 255) + amt), g = cl(((n >> 8) & 255) + amt), b = cl((n & 255) + amt);
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }

  function crispAlpha(ctx, w, h) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 110 ? 255 : 0;
    ctx.putImageData(img, 0, 0);
  }

  function drawFighterFrame(ctx, ox, pose, c) {
    const sk = computeSkeleton(pose, c.bulk);
    ctx.save();
    ctx.translate(ox, 0);
    drawArm(ctx, sk.bArm, c, true);
    drawLeg(ctx, sk.bLeg, c, true);
    drawTorso(ctx, sk, c, c.bulk);
    drawLeg(ctx, sk.fLeg, c, false);
    drawHead(ctx, sk.head, 4.6, c, 1);
    drawArm(ctx, sk.fArm, c, false);
    ctx.restore();
  }

  /** Builds a texture atlas for every roster fighter + portraits + FX. */
  function buildTextures(scene) {
    ROSTER.forEach((base) => {
      const c = Object.assign({}, base, {
        skinLight: shade(base.skin, 26),
        bandDark: shade(base.band, -60)
      });
      const canvas = document.createElement('canvas');
      canvas.width = FW * FRAME_NAMES.length;
      canvas.height = FH;
      const ctx = canvas.getContext('2d');
      FRAME_NAMES.forEach((name, i) => drawFighterFrame(ctx, i * FW, POSES[name], c));
      crispAlpha(ctx, canvas.width, canvas.height);
      const tex = scene.textures.addCanvas('f-' + c.id, canvas);
      FRAME_NAMES.forEach((name, i) => tex.add(name, 0, i * FW, 0, FW, FH));

      // portrait (24x24): head + shoulders on coloured backdrop
      const pc = document.createElement('canvas');
      pc.width = 24; pc.height = 24;
      const p = pc.getContext('2d');
      p.fillStyle = shade(c.trunks, -40); p.fillRect(0, 0, 24, 24);
      p.fillStyle = shade(c.trunks, -10); p.fillRect(0, 16, 24, 8);
      seg(p, [3, 24], [21, 24], 12, OUT); seg(p, [4, 24], [20, 24], 10, c.skin);
      dot(p, [12, 21], 3, c.skinLight);
      drawHead(p, [12, 11], 7, c, 1);
      crispAlpha(p, 24, 24);
      p.strokeStyle = '#ffffff'; p.lineWidth = 1; p.strokeRect(0.5, 0.5, 23, 23);
      scene.textures.addCanvas('p-' + c.id, pc);
    });

    // Hit spark (star burst like a camera flash)
    const sc = document.createElement('canvas');
    sc.width = 16; sc.height = 16;
    const s = sc.getContext('2d');
    s.fillStyle = '#ffffff';
    s.fillRect(7, 0, 2, 16); s.fillRect(0, 7, 16, 2);
    s.fillRect(4, 4, 2, 2); s.fillRect(10, 4, 2, 2); s.fillRect(4, 10, 2, 2); s.fillRect(10, 10, 2, 2);
    s.fillStyle = '#fff6a0'; s.fillRect(6, 6, 4, 4);
    scene.textures.addCanvas('spark', sc);

    const dc = document.createElement('canvas');
    dc.width = 8; dc.height = 8;
    const dd = dc.getContext('2d');
    dd.fillStyle = '#ffffff'; dd.beginPath(); dd.arc(4, 4, 3.5, 0, Math.PI * 2); dd.fill();
    scene.textures.addCanvas('dust', dc);

    const sh = document.createElement('canvas');
    sh.width = 28; sh.height = 7;
    const shx = sh.getContext('2d');
    shx.fillStyle = 'rgba(0,0,0,0.35)'; shx.beginPath(); shx.ellipse(14, 3.5, 13, 3, 0, 0, Math.PI * 2); shx.fill();
    scene.textures.addCanvas('shadow', sh);

    buildArena(scene);
  }

  function buildArena(scene) {
    const W = 240, H = 135; // low-res, drawn at 2x
    const rand = mulberry32(7);
    const skins = ['#f0c8a0', '#d8a070', '#a87048', '#704828', '#ffd8b8'];
    const hairs = ['#201010', '#5a3010', '#e8c040', '#202020', '#a04010', '#d0d0d0'];
    const shirts = ['#3a6ad8', '#2aa0e0', '#e8e8f0', '#2a8a5a', '#d8483a', '#5a3aa0', '#1a2a5a', '#40c0d0'];

    for (let frame = 0; frame < 2; frame++) {
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = 90;
      const g = cv.getContext('2d');
      const grd = g.createLinearGradient(0, 0, 0, 90);
      grd.addColorStop(0, '#0a0818'); grd.addColorStop(1, '#1c2a5a');
      g.fillStyle = grd; g.fillRect(0, 0, W, 90);
      const r2 = mulberry32(11);
      for (let row = 0; row < 7; row++) {
        const y = 10 + row * 11;
        const scale = 0.7 + row * 0.07;
        for (let x = -4; x < W + 6; x += 7 * scale + r2() * 2) {
          const sk = skins[Math.floor(r2() * skins.length)];
          const hr = hairs[Math.floor(r2() * hairs.length)];
          const sh = shirts[Math.floor(r2() * shirts.length)];
          const armsUp = r2() < (frame === 0 ? 0.25 : 0.55);
          const bob = frame === 1 && r2() < 0.5 ? -1 : 0;
          const dim = row < 3 ? -60 + row * 15 : 0;
          const hs = 2.4 * scale;
          g.fillStyle = shade(sh, dim);
          g.fillRect(Math.round(x - 3 * scale), Math.round(y + 2 + bob), Math.round(6 * scale), Math.round(9 * scale));
          if (armsUp) {
            g.fillStyle = shade(sk, dim);
            g.fillRect(Math.round(x - 4 * scale), Math.round(y - 5 + bob), 1, Math.round(6 * scale));
            g.fillRect(Math.round(x + 3 * scale), Math.round(y - 5 + bob), 1, Math.round(6 * scale));
          }
          g.fillStyle = shade(sk, dim);
          g.beginPath(); g.arc(x, y + bob, hs, 0, Math.PI * 2); g.fill();
          g.fillStyle = shade(hr, dim);
          g.fillRect(Math.round(x - hs), Math.round(y - hs + bob), Math.round(hs * 2), Math.max(1, Math.round(hs * 0.8)));
        }
      }
      // barricade
      g.fillStyle = '#3a4a9a'; g.fillRect(0, 78, W, 12);
      g.fillStyle = '#7a8ae0';
      for (let x = 0; x < W; x += 4) g.fillRect(x, 79, 1, 10);
      g.fillRect(0, 78, W, 1);
      crispAlpha(g, W, 90);
      scene.textures.addCanvas('crowd' + frame, cv);
    }

    // Ring: apron + mat + posts (drawn at 2x later)
    const rc = document.createElement('canvas');
    rc.width = W; rc.height = H - 70;
    const r = rc.getContext('2d');
    r.fillStyle = '#2a2050'; r.fillRect(0, 0, W, rc.height);
    // mat
    r.fillStyle = '#4ad0e0'; r.fillRect(0, 6, W, 46);
    r.fillStyle = '#38b4c8';
    for (let y = 10; y < 52; y += 9) r.fillRect(0, y, W, 1);
    r.fillStyle = '#9af0f8'; r.fillRect(0, 6, W, 1);
    // apron skirt
    r.fillStyle = '#d02a50'; r.fillRect(0, 52, W, 13);
    r.fillStyle = '#ff5a7a'; r.fillRect(0, 52, W, 1);
    r.fillStyle = '#a01838';
    for (let x = 8; x < W; x += 16) r.fillRect(x, 56, 8, 2);
    scene.textures.addCanvas('ring', rc);
    void rand;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createAnims(scene) {
    ROSTER.forEach((c) => {
      const key = 'f-' + c.id;
      const mk = (name, frames, rate, repeat) => scene.anims.create({
        key: c.id + '-' + name,
        frames: frames.map((f) => ({ key, frame: f })),
        frameRate: rate, repeat
      });
      mk('idle', ['idle0', 'idle1'], 3, -1);
      mk('walk', ['walk0', 'walk1', 'walk2', 'walk3'], 9, -1);
      mk('win', ['win0', 'win1'], 4, -1);
    });
  }

  global.RR = global.RR || {};
  Object.assign(global.RR, { ROSTER, FW, FH, FOOT_Y, SCALE, buildTextures, createAnims });
})(window);
