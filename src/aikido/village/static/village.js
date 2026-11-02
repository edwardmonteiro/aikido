/* Agent Village — an Atari 2600-style town where your AI agents live and work.
 *
 * Everything is drawn in code on a <canvas> with the 2600's NTSC palette:
 * 8-pixel-wide sprites, a striped playfield, stepped shapes and CRT
 * scanlines. The world renders at its true size into a small offscreen canvas
 * and is scaled by whole device pixels; text is drawn on top at full resolution.
 *
 * The server (aikido village) — or a page-supplied VILLAGE_BACKEND — owns the
 * agents' brains, memory and guardrails; this file is the world, the controls
 * and the UI.
 */
(() => {
  "use strict";

  // ------------------------------------------------------------------ constants
  const T = 16;                 // tile size, world px
  const W = 64, H = 44;         // map size, tiles
  const WALK = 70, RUN = 130;   // px / second
  const NPC = 55;
  const AP = 2;                 // one Atari sprite pixel = 2x2 world px
  const PF = 4;                 // playfield blocks snap to 4 world px
  const SPR_W = 16, SPR_H = 24; // 8x12 Atari pixels
  const CHAR_H = 24;
  const ROOM_W = 240, ROOM_H = CHAR_H * 5, WALL_H = 40; // characters are 1/5 of room height
  const UI_FONT = '"Press Start 2P", ui-monospace, monospace';

  // The Atari 2600 NTSC palette: 16 hues x 8 lumas. Every colour on screen is one of these.
  const NTSC = [
    "#000000", "#404040", "#6c6c6c", "#909090", "#b0b0b0", "#c8c8c8", "#dcdcdc", "#ececec",
    "#444400", "#646410", "#84842c", "#a0a044", "#b8b85c", "#d0d070", "#e8e884", "#fcfc98",
    "#702800", "#844414", "#985c28", "#ac783c", "#bc8c4c", "#cca05c", "#dcb468", "#ecc878",
    "#841800", "#983418", "#ac5030", "#c06848", "#d0805c", "#e09470", "#eca880", "#fcbc94",
    "#880000", "#9c2020", "#b03c3c", "#c05858", "#d07070", "#e08888", "#eca0a0", "#fcb4b4",
    "#78005c", "#8c2074", "#a03c88", "#b0589c", "#c070b0", "#d084c0", "#dc9cd0", "#ecb0e0",
    "#480078", "#602090", "#783ca4", "#8c58b8", "#a070cc", "#b484dc", "#c49cec", "#d4b0fc",
    "#140084", "#302098", "#4c3cac", "#6858c0", "#7c70d0", "#9488e0", "#a8a0ec", "#bcb4fc",
    "#000088", "#1c209c", "#3840b0", "#505cc0", "#6874d0", "#7c8ce0", "#90a0ec", "#a4b4fc",
    "#00187c", "#1c3890", "#3854a8", "#5070bc", "#6888cc", "#7c9cdc", "#90b4ec", "#a4c8fc",
    "#002c5c", "#1c4c78", "#386890", "#5084ac", "#689cc0", "#7cb4d4", "#90cce8", "#a4e0fc",
    "#003c2c", "#1c5c48", "#387c64", "#509c80", "#68b494", "#7cd0ac", "#90e4c0", "#a4fcd4",
    "#003c00", "#205c20", "#407c40", "#5c9c5c", "#74b474", "#8cd08c", "#a4e4a4", "#b8fcb8",
    "#143800", "#345c1c", "#507c38", "#6c9850", "#84b468", "#9ccc7c", "#b4e490", "#c8fca4",
    "#2c3000", "#4c501c", "#687034", "#848c4c", "#9ca864", "#b4c078", "#c8d48c", "#dceca0",
    "#442800", "#644818", "#846830", "#a08444", "#b89c58", "#d0b46c", "#e8cc7c", "#fce08c",
  ];
  const PAL = {
    black: "#000000", white: "#ececec", grey: "#909090", lgrey: "#b0b0b0", dgrey: "#404040",
    grassA: "#5c9c5c", grassB: "#6c9850", grassDk: "#407c40", leaf: "#205c20", leafHi: "#74b474",
    path: "#b89c58", pathDk: "#a08444",
    plazaA: "#909090", plazaB: "#b0b0b0",
    waterA: "#505cc0", waterB: "#6874d0", waterHi: "#a4b4fc",
    wood: "#844414", woodDk: "#702800", woodLt: "#ac783c",
    yellow: "#e8e884", red: "#c05858", orange: "#d0805c",
    // kept names used by shared code (minimap etc.)
    g1: "#5c9c5c", g2: "#74b474", g0: "#407c40", gDeep: "#205c20", p0: "#b89c58", s0: "#909090", s1: "#6c6c6c", w0: "#505cc0", out: "#000000",
  };

  // Footprints (tile top-left, size). Doors are on the south wall. Colours are NTSC entries.
  const LAYOUT = {
    town_hall: { x: 27, y: 3, w: 10, h: 7, roof: "#b03c3c", roof2: "#c05858", wall: "#ecc878", sign: "clock" },
    inbox:     { x: 12, y: 4, w: 8, h: 6, roof: "#c06848", roof2: "#d0805c", wall: "#ececec", sign: "mail" },
    studio:    { x: 44, y: 4, w: 8, h: 6, roof: "#404040", roof2: "#6c6c6c", wall: "#c49cec", sign: "play" },
    bank:      { x: 3, y: 14, w: 8, h: 6, roof: "#387c64", roof2: "#509c80", wall: "#ececec", sign: "coin" },
    library:   { x: 3, y: 24, w: 8, h: 6, roof: "#4c3cac", roof2: "#6858c0", wall: "#c06848", sign: "book" },
    travel:    { x: 53, y: 14, w: 8, h: 6, roof: "#386890", roof2: "#5084ac", wall: "#ecc878", sign: "globe" },
    workshop:  { x: 53, y: 24, w: 8, h: 6, roof: "#6c6c6c", roof2: "#909090", wall: "#b0b0b0", sign: "gear" },
    archive:   { x: 8, y: 34, w: 8, h: 6, roof: "#783ca4", roof2: "#8c58b8", wall: "#dcb468", sign: "scroll" },
    home:      { x: 28, y: 35, w: 8, h: 6, roof: "#ac5030", roof2: "#c06848", wall: "#fcbc94", sign: "heart" },
    recruiting:{ x: 48, y: 34, w: 8, h: 6, roof: "#cca05c", roof2: "#dcb468", wall: "#e8e884", sign: "hiring" },
  };
  const PLAZA = { x: 22, y: 13, w: 21, h: 16 };
  const FOUNTAIN = { x: 32.5 * T, y: 21 * T, r: 2.2 * T };
  const POND = { x: 21.5 * T, y: 37 * T, rx: 3.7 * T, ry: 2.5 * T };
  const inPond = (px, py, grow = 0) => ((px - POND.x) / (POND.rx + grow)) ** 2 + ((py - POND.y) / (POND.ry + grow)) ** 2 < 1;

  const PLAYER_LOOK = { shirt: "#8c58b8", pants: "#302098", hair: "#702800", skin: "#e09470", style: "short", star: true };
  const STYLES = {
    chief_of_staff: { style: "short", tie: true },
    inbox: { style: "long" }, content: { style: "spiky" }, finance: { style: "bun", glasses: true },
    research: { style: "short", glasses: true }, travel: { style: "bob" }, engineering: { style: "spiky", glasses: true },
    knowledge: { style: "long" },
  };
  const HAIRS = ["short", "bob", "spiky", "long", "bun"];

  // ------------------------------------------------------------------ utilities
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function mulberry32(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(20261029);
  const hash = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
  function canvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    return [c, g];
  }
  function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function shade(hex, amt) {
    const f = (v) => clamp(Math.round(v + amt * 255), 0, 255);
    const [r, g, b] = rgb(hex);
    return "#" + [f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  /** Paint a 1px outline around every opaque shape on the canvas. */
  function outline(c, color = PAL.out) {
    const g = c.getContext("2d"), { width: w, height: h } = c;
    const img = g.getImageData(0, 0, w, h), d = img.data, a = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3] > 40 ? 1 : 0;
    const [r, gg, b] = rgb(color);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (a[y * w + x]) continue;
      if ((x > 0 && a[y * w + x - 1]) || (x < w - 1 && a[y * w + x + 1]) || (y > 0 && a[(y - 1) * w + x]) || (y < h - 1 && a[(y + 1) * w + x])) {
        const i = (y * w + x) * 4; d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  /** Draw a tiny bitmap: rows of characters mapped to colors ('.' = clear). */
  function bitmap(g, x, y, rows, colors) {
    rows.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch === "." || !colors[ch]) return;
      g.fillStyle = colors[ch]; g.fillRect(x + i, y + j, 1, 1);
    }));
  }

  async function api(path, body) {
    // A page can supply its own backend (same routes, same shapes) instead of the
    // local server, e.g. a hosted demo: window.VILLAGE_BACKEND(path, body) -> data.
    if (window.VILLAGE_BACKEND) return window.VILLAGE_BACKEND(path, body);
    const res = await fetch(path, body === undefined ? {} : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { data });
    return data;
  }
  async function waitJob(id) {
    for (;;) {
      await new Promise((r) => setTimeout(r, 1000));
      const job = await api(`/api/jobs/${id}`);
      if (job.status === "done") return job.result;
      if (job.status === "error") throw new Error(job.error);
    }
  }
  function toast(text, error = false) {
    const el = document.createElement("div");
    el.className = "toast" + (error ? " error" : "");
    el.textContent = text;
    $("toasts").appendChild(el);
    while ($("toasts").children.length > (innerWidth < 600 ? 2 : 3)) $("toasts").firstChild.remove();
    setTimeout(() => el.remove(), 6500);
  }

  // ------------------------------------------------------------------ the map
  // 0 grass, 1 path, 2 plaza, 3 house (solid), 4 door, 5 tree (solid), 6 water/fountain (solid),
  // 7 flowers, 8 prop (solid), 9 bush (solid)
  const grid = new Uint8Array(W * H);
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 3 : grid[y * W + x]);
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) grid[y * W + x] = v; };
  const solid = (v) => v === 3 || v === 5 || v === 6 || v === 8 || v === 9 || v === 10;
  const doors = {};
  const under = new Uint8Array(W * H); // ground kind beneath props: 1 path, 2 plaza, else grass
  const props = [];          // lamps, benches, mailbox, signpost, flower beds
  const trees = [];          // {x, y, kind}

  function buildMap() {
    for (let y = PLAZA.y; y < PLAZA.y + PLAZA.h; y++)
      for (let x = PLAZA.x; x < PLAZA.x + PLAZA.w; x++) set(x, y, 2);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (Math.hypot((x + 0.5) * T - FOUNTAIN.x, (y + 0.5) * T - FOUNTAIN.y) < FOUNTAIN.r + 6) set(x, y, 6);
        else if (inPond((x + 0.5) * T, (y + 0.5) * T, 6)) set(x, y, 10);
    for (const [id, b] of Object.entries(LAYOUT)) {
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) set(x, y, 3);
      const dx = b.x + Math.floor(b.w / 2), dy = b.y + b.h - 1;
      set(dx, dy, 4);
      if (b.w >= 10) set(dx - 1, dy, 4);
      doors[id] = { x: dx, y: dy };
    }
    // Paths: breadth-first from each door to the plaza, then widen to 2 tiles.
    for (const d of Object.values(doors)) {
      const route = bfs({ x: d.x, y: d.y + 1 }, (x, y) => at(x, y) === 2, (v) => v === 3 || v === 6 || v === 4 || v === 10);
      for (const p of route || []) if (at(p.x, p.y) === 0) set(p.x, p.y, 1);
      set(d.x, d.y + 1, 1);
    }
    const widen = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) === 1) widen.push([x + 1, y], [x, y + 1]);
    for (const [x, y] of widen) if (at(x, y) === 0) set(x, y, 1);
    under.set(grid);
    // Plaza furniture: lamps at the corners, benches facing the fountain.
    const lamp = (x, y) => { set(x, y, 8); props.push({ kind: "lamp", x: x * T + 8, y: y * T + 14 }); };
    lamp(PLAZA.x + 1, PLAZA.y + 1); lamp(PLAZA.x + PLAZA.w - 2, PLAZA.y + 1);
    lamp(PLAZA.x + 1, PLAZA.y + PLAZA.h - 2); lamp(PLAZA.x + PLAZA.w - 2, PLAZA.y + PLAZA.h - 2);
    for (const bx of [27, 36]) { set(bx, 25, 8); set(bx + 1, 25, 8); props.push({ kind: "bench", x: bx * T + 16, y: 25 * T + 13 }); }
    const ib = doors.inbox; set(ib.x + 2, ib.y + 1, 8); props.push({ kind: "mailbox", x: (ib.x + 2) * T + 8, y: (ib.y + 1) * T + 14 });
    set(31, 30, 8); props.push({ kind: "signpost", x: 31 * T + 8, y: 30 * T + 14 });
    // Garden props by each house, only on free grass.
    const yard = (id, kind, ox, oy) => {
      const d = doors[id], x = d.x + ox, y = d.y + oy;
      if (at(x, y) !== 0) return;
      set(x, y, 8); props.push({ kind, x: x * T + 8, y: y * T + 14 });
    };
    yard("workshop", "barrel", -3, 1); yard("workshop", "crate", 3, 1); yard("workshop", "crate", 4, 1);
    yard("travel", "suitcase", -3, 1); yard("travel", "pot", 3, 1);
    yard("studio", "tripod", 3, 1); yard("studio", "pot", -3, 1);
    yard("bank", "pot", -2, 1); yard("bank", "pot", 2, 1);
    yard("library", "cart", 3, 1); yard("library", "pot", -3, 1);
    yard("recruiting", "noticeboard", -3, 1); yard("recruiting", "pot", 3, 1);
    yard("archive", "barrel", 3, 1); yard("archive", "pot", -3, 1);
    yard("town_hall", "pot", -3, 1); yard("town_hall", "pot", 2, 1);
    yard("home", "well", 4, 2);
    for (const ox of [-5, -4, -3, 3]) yard("home", "fence", ox, 1);
    // Trees, bushes and flowers on free grass, keeping a margin around everything built.
    const busy = (x, y) => { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (at(x + i, y + j) !== 0) return true; return false; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (at(x, y) !== 0) continue;
      const edge = x < 2 || y < 2 || x > W - 3 || y > H - 3;
      if ((edge && rand() < 0.6) || (!busy(x, y) && rand() < 0.07)) {
        set(x, y, 5); trees.push({ x: x * T + 8, y: y * T + 15, kind: rand() < 0.3 ? "pine" : "oak" });
      } else if (!busy(x, y) && rand() < 0.035) {
        set(x, y, 9); trees.push({ x: x * T + 8, y: y * T + 14, kind: "bush" });
      } else if (!busy(x, y) && rand() < 0.06) set(x, y, 7);
    }
  }

  function bfs(start, isGoal, blocked = solid) {
    const prev = new Int32Array(W * H).fill(-1);
    const q = [start.y * W + start.x];
    prev[q[0]] = q[0];
    for (let qi = 0; qi < q.length; qi++) {
      const cur = q[qi], cx = cur % W, cy = (cur / W) | 0;
      if (isGoal(cx, cy)) {
        const out = [];
        for (let c = cur; c !== prev[c]; c = prev[c]) out.push({ x: c % W, y: (c / W) | 0 });
        out.push(start);
        return out.reverse();
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (prev[n] !== -1 || blocked(grid[n])) continue;
        prev[n] = cur;
        q.push(n);
      }
    }
    return null;
  }
  const walkable = (v) => !solid(v);
  function pathTo(from, to) {
    const s = { x: clamp((from.x / T) | 0, 0, W - 1), y: clamp(((from.y - 2) / T) | 0, 0, H - 1) };
    const g = { x: clamp((to.x / T) | 0, 0, W - 1), y: clamp(((to.y - 2) / T) | 0, 0, H - 1) };
    const route = bfs(s, (x, y) => x === g.x && y === g.y, (v) => !walkable(v));
    return route ? route.slice(1).map((p) => ({ x: p.x * T + T / 2, y: p.y * T + T - 3 })) : [];
  }

  // ------------------------------------------------------------------ Atari art
  /** Snap any colour to the nearest NTSC palette entry. */
  const nearestCache = new Map();
  function ntsc(hex) {
    if (!hex) return PAL.grey;
    if (nearestCache.has(hex)) return nearestCache.get(hex);
    const [r, g, b] = rgb(hex);
    let best = NTSC[0], bd = Infinity;
    for (const c of NTSC) { const [r2, g2, b2] = rgb(c); const d = (r - r2) ** 2 * 0.3 + (g - g2) ** 2 * 0.59 + (b - b2) ** 2 * 0.11; if (d < bd) { bd = d; best = c; } }
    nearestCache.set(hex, best);
    return best;
  }
  /** Draw a bitmap of rows (one char per Atari pixel, '.' = clear) at pixel size `px`. */
  function blocks(g, x, y, rows, colors, px = AP) {
    rows.forEach((row, j) => [...row].forEach((ch, i) => {
      const col = colors[ch];
      if (ch === "." || !col) return;
      g.fillStyle = col; g.fillRect(x + i * px, y + j * px, px, px);
    }));
  }

  // 8x12 sprites. h hair, s skin, e eyes, c shirt, t tie, v vest, w reflective stripe, p pants, f feet, k star badge.
  const BODY = {
    down: ["..hhhh..", ".hhhhhh.", ".hssssh.", ".seasse.", "..ssss..", ".cccccc.", "cccttccc", "c.cttc.c", "s.cccc.s", "..pppp..", "..p..p..", ".ff..ff."],
    up: ["..hhhh..", ".hhhhhh.", ".hhhhhh.", ".hhhhhh.", "..ssss..", ".cccccc.", "cccccccc", "c.cccc.c", "s.cccc.s", "..pppp..", "..p..p..", ".ff..ff."],
    side: ["..hhhh..", ".hhhhhs.", ".hhssss.", ".hssseas", "..sssss.", "..cccc..", "..cccc..", "..ccsc..", "..cccc..", "..pppp..", "..pp.p..", "..ff.ff."],
  };
  const LEGS = {
    down: [["..pppp..", "..p..p..", ".ff..ff."], ["..pppp..", ".pp...p.", "ff....f."], ["..pppp..", ".p...pp.", ".f....ff"]],
    side: [["..pppp..", "..pp.p..", "..ff.ff."], ["..pppp..", ".pp..pp.", "ff....ff"], ["..pppp..", "..ppp...", "..fff..."]],
    sit: [["pppppp..", ".pp.pp..", "........"]],
  };
  const spriteCache = new Map();
  function charSprite(look, dir, frame, sitting = false) {
    const key = JSON.stringify([look, dir, frame, sitting]);
    if (spriteCache.has(key)) return spriteCache.get(key);
    const [c, g] = canvas(SPR_W, SPR_H);
    const side = dir === 1 || dir === 2, up = dir === 3;
    const rows = [...(side ? BODY.side : up ? BODY.up : BODY.down)];
    const legs = sitting ? LEGS.sit[0] : side ? LEGS.side[frame] : LEGS.down[frame];
    rows.splice(9, 3, ...legs);
    const style = look.style || "short";
    const swap = (r, i, ch) => { rows[r] = rows[r].slice(0, i) + ch + rows[r].slice(i + 1); };
    if (style === "long") for (const r of [2, 3, 4, 5]) { swap(r, 0, "h"); swap(r, 7, "h"); }
    if (style === "bob") for (const r of [2, 3]) { swap(r, 0, "h"); swap(r, 7, "h"); }
    if (style === "spiky") rows[0] = ".h.hh.h.";
    if (style === "bun") rows[0] = "...hh...";
    if (look.glasses && !up && !side) rows[3] = ".gesseg.";
    if (!look.tie) rows.forEach((r, i) => (rows[i] = r.replace(/t/g, "c")));
    if (look.star && !up) swap(6, side ? 4 : 2, "k");
    const vest = look.vest ? { c: "#e8e884", w: "#ececec" } : {};
    if (look.vest && !up) rows[7] = side ? "..wwww.." : "w.wwww.w";
    const colors = {
      h: ntsc(look.hair), s: ntsc(look.skin), e: "#000000", g: "#ececec", c: vest.c || ntsc(look.shirt), t: "#9c2020",
      w: vest.w, p: ntsc(look.pants), f: "#404040", k: "#fcfc98",
    };
    if (dir === 1) { g.translate(SPR_W, 0); g.scale(-1, 1); }
    blocks(g, 0, frame && !sitting ? -AP / 2 : 0, rows, colors);
    spriteCache.set(key, c);
    return c;
  }
  function lookOf(p) {
    if (p.id === "player") return { ...PLAYER_LOOK };
    const pal = p.palette || {};
    const extra = STYLES[p.id] || {};
    const style = extra.style || HAIRS[hash(p.id) % HAIRS.length];
    return { shirt: pal.shirt, pants: pal.pants, hair: pal.hair, skin: pal.skin, style, ...extra, vest: p.role === "worker" };
  }

  // 4x4 emblems on each house (Atari pixel = 2 world px).
  const EMBLEMS = {
    mail: [["wwww", "wrrw", "wwww"], { w: "#ececec", r: "#b03c3c" }],
    play: [["rrrr", "rwwr", "rwrr", "rrrr"], { r: "#b03c3c", w: "#ececec" }],
    coin: [[".yy.", "yddy", "yddy", ".yy."], { y: "#e8e884", d: "#b8b85c" }],
    book: [["wwww", "wbbw", "wwww"], { w: "#ececec", b: "#4c3cac" }],
    globe: [[".bb.", "bggb", "bbgb", ".bb."], { b: "#505cc0", g: "#5c9c5c" }],
    gear: [["g.g.", ".gg.", ".gg.", "g..g"], { g: "#dcdcdc" }],
    scroll: [["yyyy", "ybby", "yyyy"], { y: "#ecc878", b: "#844414" }],
    heart: [["r..r", "rrrr", ".rr."], { r: "#d07070" }],
  };

  function drawHouse(id) {
    const b = LAYOUT[id];
    const w = b.w * T, h = b.h * T, top = id === "town_hall" ? 48 : 20;
    const [c, g] = canvas(w, h + top);
    const P = (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y + top, ww, hh); };
    const roofH = Math.round((h * 0.5) / PF) * PF, bands = roofH / PF;
    // walls with an Atari stripe every other band
    P(PF, roofH, w - 2 * PF, h - roofH, b.wall);
    for (let y = roofH + PF * 2; y < h - PF; y += PF * 2) P(PF, y, w - 2 * PF, PF / 2, ntsc(shade(b.wall, -0.06)));
    P(PF, h - PF, w - 2 * PF, PF, PAL.dgrey);
    // stepped roof
    for (let k = 0; k < bands; k++) {
      const inset = Math.floor((bands - 1 - k) / 1.4) * PF;
      P(inset, k * PF, w - inset * 2, PF, k % 2 ? b.roof : b.roof2);
    }
    P(0, roofH - PF / 2, w, PF / 2, PAL.black);
    // windows and door
    const win = (x) => { P(x, roofH + PF * 2, PF * 3, PF * 3, "#fcfc98"); P(x + PF, roofH + PF * 2, PF / 2, PF * 3, b.wall); };
    win(PF * 3); win(w - PF * 6);
    const dw = b.w >= 10 ? PF * 6 : PF * 3, dx = Math.round((w / 2 - dw / 2) / PF) * PF;
    P(dx, h - PF * 5, dw, PF * 4, PAL.black);
    P(dx - PF / 2, h - PF * 5 - PF / 2, dw + PF, PF / 2, PAL.wood);
    // chimney
    if (id !== "town_hall") { P(w - PF * 6, -PF * 3, PF * 2, PF * 5, "#ac5030"); P(w - PF * 6, -PF * 3, PF * 2, PF / 2, PAL.dgrey); }
    // emblem above the door
    if (EMBLEMS[b.sign]) {
      const [rows, colors] = EMBLEMS[b.sign];
      P(w / 2 - PF * 2, roofH + PF, PF * 4, PF * 3.5, PAL.black);
      blocks(g, w / 2 - PF * 2 + AP * 2, top + roofH + PF + AP, rows, colors);
    }
    if (id === "recruiting") for (let x = PF; x < w - PF; x += PF * 2) { P(x, roofH, PF, PF * 1.5, "#b03c3c"); P(x + PF, roofH, PF, PF * 1.5, "#ececec"); }
    if (id === "bank") for (const x of [PF * 2, w - PF * 3]) P(x, roofH, PF, h - roofH - PF, "#ececec");
    if (id === "town_hall") {
      for (const x of [dx - PF * 4, dx - PF * 2, dx + dw + PF, dx + dw + PF * 3]) P(x, roofH, PF, h - roofH - PF, "#ececec");
      const tx = w / 2 - PF * 3;
      P(tx, -PF * 9, PF * 6, PF * 10, b.wall); P(tx + PF, -PF * 8, PF * 4, PF * 4, "#ececec");
      P(tx + PF * 3 - AP, -PF * 7, AP, PF * 2, PAL.black); P(tx + PF * 3 - AP, -PF * 6 + AP, PF, AP, PAL.black);
      for (let k = 0; k < 3; k++) P(tx + k * PF, -PF * (12 - k), PF * (6 - 2 * k), PF, b.roof);
      P(w / 2 - AP / 2, -PF * 12 - 16, AP, 16, PAL.dgrey);
    }
    if (id === "studio") P(w / 2 - AP / 2, -PF * 3, AP, PF * 3, PAL.dgrey);
    return { canvas: c, top, roofH };
  }

  function drawTree(kind) {
    const [c, g] = canvas(24, 32);
    const P = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    if (kind === "bush") {
      P(4, 20, 16, 4, PAL.leafHi); P(0, 24, 24, 4, PAL.grassDk); P(4, 28, 16, 4, PAL.leaf); P(8, 24, AP, AP, "#d07070"); P(16, 28, AP, AP, "#ececec");
      return c;
    }
    P(10, 22, 4, 10, PAL.wood);
    if (kind === "pine") {
      [4, 8, 12, 16, 20, 24].forEach((wd, k) => P(12 - wd / 2, k * 4, wd, 4, k % 2 ? PAL.leaf : "#387c64"));
    } else {
      [[8, PAL.leafHi], [16, PAL.grassA], [24, PAL.grassA], [24, PAL.grassDk], [16, PAL.grassDk]].forEach(([wd, col], k) => P(12 - wd / 2, k * 4 + 2, wd, 4, col));
      P(8, 6, AP, AP, "#a4e4a4");
    }
    return c;
  }

  function drawProp(kind) {
    const [c, g] = canvas(34, 30);
    const P = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    switch (kind) {
      case "lamp": P(16, 8, 2, 20, PAL.dgrey); P(12, 2, 10, 6, "#fcfc98"); P(12, 0, 10, 2, PAL.dgrey); P(14, 28, 6, 2, PAL.dgrey); break;
      case "bench": P(2, 14, 30, 4, PAL.wood); P(2, 10, 30, 2, PAL.woodDk); P(4, 18, 2, 8, PAL.dgrey); P(28, 18, 2, 8, PAL.dgrey); break;
      case "mailbox": P(16, 14, 2, 14, PAL.wood); P(10, 6, 14, 8, "#b03c3c"); P(22, 2, 2, 6, "#e8e884"); break;
      case "signpost": P(16, 8, 2, 20, PAL.wood); P(6, 6, 22, 6, PAL.woodLt); P(4, 8, 2, 2, PAL.woodLt); break;
      case "barrel": P(10, 10, 14, 18, PAL.wood); P(10, 14, 14, 2, PAL.dgrey); P(10, 22, 14, 2, PAL.dgrey); break;
      case "crate": P(8, 12, 18, 16, PAL.woodLt); P(8, 12, 18, 2, "#cca05c"); P(8, 19, 18, 2, PAL.wood); break;
      case "pot": P(12, 18, 10, 10, "#ac5030"); P(10, 8, 14, 10, PAL.grassA); P(12, 8, 2, 2, "#d07070"); P(20, 12, 2, 2, "#e8e884"); break;
      case "well": P(6, 16, 22, 12, PAL.grey); P(10, 18, 14, 4, "#3840b0"); P(6, 2, 2, 14, PAL.wood); P(26, 2, 2, 14, PAL.wood); P(4, 0, 26, 4, "#b03c3c"); break;
      case "tripod": P(16, 14, 2, 14, PAL.dgrey); P(12, 26, 10, 2, PAL.dgrey); P(10, 8, 14, 6, PAL.dgrey); P(12, 10, 4, 2, "#90cce8"); P(10, 6, 2, 2, "#b03c3c"); break;
      case "suitcase": P(10, 14, 14, 12, PAL.wood); P(14, 10, 6, 4, PAL.woodDk); P(12, 18, 4, 4, "#b03c3c"); break;
      case "noticeboard": P(10, 14, 2, 14, PAL.wood); P(22, 14, 2, 14, PAL.wood); P(6, 4, 22, 12, "#cca05c"); P(8, 6, 6, 6, "#ececec"); P(18, 6, 8, 4, "#e8e884"); break;
      case "cart": P(6, 12, 22, 8, PAL.woodLt); ["#b03c3c", "#5c9c5c", "#4c3cac", "#e8e884"].forEach((col, i) => P(8 + i * 5, 6, 3, 6, col)); P(8, 20, 6, 6, PAL.dgrey); P(20, 20, 6, 6, PAL.dgrey); break;
      case "fence": P(0, 16, 34, 2, "#ececec"); P(0, 22, 34, 2, "#ececec"); for (let x = 1; x < 34; x += 6) P(x, 12, 2, 16, "#ececec"); break;
    }
    return c;
  }

  /** The playfield: grass in Atari stripes, flat paths, checkered plaza, stepped water. */
  function drawGround() {
    const [c, g] = canvas(W * T, H * T);
    const P = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    const r = mulberry32(7);
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      const v = at(tx, ty), base = v === 8 ? under[ty * W + tx] : v, X = tx * T, Y = ty * T;
      if (base === 2 || base === 6) {
        for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) P(X + i * 8, Y + j * 8, 8, 8, (tx * 2 + i + ty * 2 + j) % 2 ? PAL.plazaA : PAL.plazaB);
      } else if (base === 1 || base === 4) {
        P(X, Y, T, T, PAL.path);
      } else {
        P(X, Y, T, 8, PAL.grassA); P(X, Y + 8, T, 8, PAL.grassB);
        if (v === 7) for (let i = 0; i < 3; i++) P(X + 2 + ((r() * 6) | 0) * 2, Y + 2 + ((r() * 6) | 0) * 2, AP, AP, ["#e8e884", "#d07070", "#ececec"][i]);
      }
    }
    // path edges, one Atari pixel
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      const v = at(tx, ty);
      if (v !== 1 && v !== 4) continue;
      const grass = (a) => a === 0 || a === 5 || a === 7 || a === 9;
      if (grass(at(tx, ty - 1))) P(tx * T, ty * T, T, AP, PAL.pathDk);
      if (grass(at(tx, ty + 1))) P(tx * T, ty * T + T - AP, T, AP, PAL.pathDk);
    }
    // pond and fountain, in 4px steps
    for (let y = POND.y - POND.ry - 8; y < POND.y + POND.ry + 8; y += PF) for (let x = POND.x - POND.rx - 8; x < POND.x + POND.rx + 8; x += PF) {
      const cx = x + 2, cy = y + 2;
      if (inPond(cx, cy)) P(x, y, PF, PF, ((y / PF) | 0) % 2 ? PAL.waterA : PAL.waterB);
      else if (inPond(cx, cy, 5)) P(x, y, PF, PF, "#d0b46c");
    }
    for (const [ox, oy] of [[-0.5, -0.2], [0.35, 0.3], [0.1, -0.45]]) P(Math.round((POND.x + ox * POND.rx) / PF) * PF, Math.round((POND.y + oy * POND.ry) / PF) * PF, PF * 2, PF, PAL.grassDk);
    const { x: fx, y: fy, r: fr } = FOUNTAIN;
    for (let y = fy - fr - 6; y < fy + fr + 6; y += PF) for (let x = fx - fr - 6; x < fx + fr + 6; x += PF) {
      const d = Math.hypot(x + 2 - fx, y + 2 - fy);
      if (d < fr - 2) P(x, y, PF, PF, ((y / PF) | 0) % 2 ? PAL.waterA : PAL.waterB);
      else if (d < fr + 4) P(x, y, PF, PF, PAL.lgrey);
    }
    return c;
  }

  // ------------------------------------------------------------------ entities
  const world = { houses: {}, trees: {}, props: {}, ground: null };
  const people = [];          // NPCs (agents)
  let roster = { agents: [], houses: [], review: [], brain: "…", guardrails: [] };
  const player = { id: "player", name: "You", x: 0, y: 0, dir: 3, frame: 0, anim: 0 };
  let scene = "town";        // "town" or a house id (interior)
  let showNav = false;
  let chatWith = null;
  let meeting = null;        // { agenda, done }
  const smoke = [], birds = [], dust = [], butterflies = [], fireflies = [];
  let lastM = 0;
  const qsHour = Number(new URLSearchParams(location.search).get("hour"));
  const hourNow = () => (Number.isFinite(qsHour) && qsHour > 0 ? qsHour : new Date().getHours() + new Date().getMinutes() / 60);

  function doorPx(id) {
    const d = doors[id] || { x: 32, y: 40 };
    return { x: d.x * T + T / 2, y: (d.y + 1) * T + T - 3 };
  }
  function yardPx(id, i = 0) {
    const d = doors[id];
    const opts = [[-2, 2], [2, 2], [-3, 1], [3, 1], [0, 3], [-1, 3]];
    for (let k = 0; k < opts.length; k++) {
      const [ox, oy] = opts[(k + i) % opts.length];
      if (walkable(at(d.x + ox, d.y + oy))) return { x: (d.x + ox) * T + T / 2, y: (d.y + oy) * T + T - 3 };
    }
    return doorPx(id);
  }

  function makePerson(a) {
    const home = a.role === "chief_of_staff" ? { x: player.x + 16, y: player.y } : yardPx(a.house, people.length);
    return {
      ...a, x: home.x, y: home.y, dir: 0, frame: 0, anim: 0, path: [], idle: 2 + rand() * 4,
      inside: a.role === "director" && rand() < 0.5, mode: "home", bubble: null, syncCooldown: {}, repath: 0,
    };
  }
  function syncPeople() {
    for (const a of roster.agents) {
      if (people.find((p) => p.id === a.id)) continue;
      const p = makePerson(a);
      if (a.role === "worker") { const r = doorPx("recruiting"); p.x = r.x; p.y = r.y; p.path = pathTo(p, yardPx(a.house, 3)); }
      people.push(p);
    }
  }
  const chief = () => people.find((p) => p.role === "chief_of_staff");
  const byName = (name) => people.find((p) => p.name.toLowerCase() === name.toLowerCase());

  // ------------------------------------------------------------------ input
  const keys = new Set();
  const typing = () => ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName);
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeAll(); document.activeElement?.blur(); return; }
    if (typing()) return;
    keys.add(e.key.toLowerCase());
    if (e.key.startsWith("Arrow")) e.preventDefault();
    const k = e.key.toLowerCase();
    if (k === "t") { const n = nearest(); if (n) { e.preventDefault(); openChat(n); } }
    if (k === "g") showNav = !showNav;
    if (k === "m" && !e.repeat) {
      const now = performance.now();
      if (now - lastM < 450) { e.preventDefault(); summonChief(); openChat(chief()); lastM = 0; }
      else lastM = now;
    }
  });
  addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  addEventListener("blur", () => keys.clear());

  // Touch controls: the D-pad holds arrow keys down; action buttons fire T / MM.
  document.querySelectorAll("#touch [data-key]").forEach((b) => {
    const k = b.dataset.key;
    const on = (e) => { e.preventDefault(); keys.add(k); b.classList.add("down"); };
    const off = (e) => { e.preventDefault(); keys.delete(k); b.classList.remove("down"); };
    b.addEventListener("pointerdown", on);
    for (const ev of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(ev, off);
  });
  $("touch-run")?.addEventListener("click", (e) => { e.currentTarget.classList.toggle("down"); keys[e.currentTarget.classList.contains("down") ? "add" : "delete"]("shift"); });
  $("touch-talk")?.addEventListener("click", () => { const n = nearest(); if (n) openChat(n); else toast("Walk up to someone first."); });
  $("touch-chief")?.addEventListener("click", () => { summonChief(); openChat(chief()); });

  // Where a person is drawn in the current scene (interiors have their own coordinates).
  const DESK = { x: ROOM_W / 2, y: 68 };
  function posOf(p) {
    if (scene === "town") return p;
    if (p.role === "chief_of_staff") return { x: p.rx, y: p.ry };
    if (p.inHall) return seatPositions()[people.filter((q) => q.inHall).indexOf(p) % 8];
    return DESK;
  }
  function nearest() {
    let best = null, bd = scene === "town" ? 26 : 34;
    for (const p of people) {
      if (!visible(p)) continue;
      const d = dist(posOf(p), player);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  function visible(p) {
    if (scene === "town") return !p.inside && !p.inHall;
    if (p.role === "chief_of_staff") return true; // follows you inside
    if (scene === "town_hall") return !!p.inHall;
    return p.house === scene && p.inside && p.role === "director";
  }

  // ------------------------------------------------------------------ movement
  function blockedAt(x, y) {
    if (scene !== "town") return roomBlocked(x, y);
    for (const [ox, oy] of [[-4, -3], [4, -3], [-4, 0], [4, 0]]) {
      if (solid(at(Math.floor((x + ox) / T), Math.floor((y + oy) / T)))) return true;
    }
    return false;
  }
  function movePlayer(dt) {
    if (typing()) return;
    let dx = 0, dy = 0;
    if (keys.has("arrowleft") || keys.has("a")) dx -= 1;
    if (keys.has("arrowright") || keys.has("d")) dx += 1;
    if (keys.has("arrowup") || keys.has("w")) dy -= 1;
    if (keys.has("arrowdown") || keys.has("s")) dy += 1;
    if (!dx && !dy) { player.frame = 0; return; }
    const speed = (keys.has("shift") ? RUN : WALK) * dt / Math.hypot(dx, dy);
    if (dx && !blockedAt(player.x + dx * speed, player.y)) player.x += dx * speed;
    if (dy && !blockedAt(player.x, player.y + dy * speed)) player.y += dy * speed;
    player.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 0;
    animate(player, dt * (keys.has("shift") ? 1.8 : 1));
    if (keys.has("shift") && scene === "town" && rand() < dt * 14) dust.push({ x: player.x + (rand() - 0.5) * 6, y: player.y - 1, life: 1 });
    if (scene === "town") {
      const tx = Math.floor(player.x / T), ty = Math.floor((player.y - 4) / T);
      if (at(tx, ty) === 4 && dy < 0) {
        const id = Object.keys(doors).find((k) => doors[k].y === ty && (doors[k].x === tx || (LAYOUT[k].w >= 10 && doors[k].x - 1 === tx)));
        if (id) enter(id);
      }
    } else if (player.y > ROOM_H + 2) leave();
  }
  function animate(p, dt) {
    p.anim += dt * 8;
    const cyc = Math.floor(p.anim) % 4;
    p.frame = cyc === 1 ? 1 : cyc === 3 ? 2 : 0;
  }
  function stepNpc(p, dt) {
    if (!p.path.length) { p.frame = 0; return true; }
    const n = p.path[0];
    const dx = n.x - p.x, dy = n.y - p.y, d = Math.hypot(dx, dy);
    const s = NPC * dt * (p.hurry ? 1.8 : 1);
    if (d <= s) { p.x = n.x; p.y = n.y; p.path.shift(); }
    else { p.x += (dx / d) * s; p.y += (dy / d) * s; }
    p.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 0;
    animate(p, dt);
    return false;
  }

  // ------------------------------------------------------------------ interiors
  function roomFurniture(id) {
    if (id === "town_hall") return [{ x: 62, y: 66, w: 116, h: 18 }];
    return [{ x: 96, y: 66, w: 48, h: 14 }, { x: 14, y: WALL_H, w: 14, h: 14 }, { x: ROOM_W - 28, y: WALL_H, w: 14, h: 14 }];
  }
  function roomBlocked(x, y) {
    if (x < 10 || x > ROOM_W - 10 || y < WALL_H + 6) return true;
    if (y > ROOM_H - 2 && Math.abs(x - ROOM_W / 2) > 12) return true;
    for (const r of roomFurniture(scene)) if (x > r.x - 4 && x < r.x + r.w + 4 && y > r.y && y < r.y + r.h + 3) return true;
    return false;
  }
  function enter(id) {
    scene = id;
    player.x = ROOM_W / 2; player.y = ROOM_H - 6; player.dir = 3;
    const c = chief(); if (c) { c.rx = ROOM_W / 2 + 18; c.ry = ROOM_H - 8; }
    toast(`Entered ${roster.houses.find((h) => h.id === id)?.label || id}`);
  }
  function leave() {
    const d = doorPx(scene);
    scene = "town";
    player.x = d.x; player.y = d.y + 2; player.dir = 0;
    const c = chief(); if (c) { c.x = d.x + 14; c.y = d.y + 4; c.path = []; }
  }
  function seatPositions() {
    const seats = [];
    for (let i = 0; i < 4; i++) seats.push({ x: 78 + i * 28, y: 66, dir: 0 }); // north side, facing down
    for (let i = 0; i < 4; i++) seats.push({ x: 78 + i * 28, y: 98, dir: 3 }); // south side, facing up
    return seats;
  }

  // ------------------------------------------------------------------ AI behaviours
  function updatePeople(dt, now) {
    const hour = hourNow();
    const workHours = hour >= 9 && hour < 18;
    for (const p of people) {
      if (p.bubble && p.bubble.until < now) p.bubble = null;
      if (p.role === "chief_of_staff") { followPlayer(p, dt); continue; }
      if (p.inHall) continue;
      if (p.role === "director") {
        if (p.mode === "summoned") {
          if (scene === "town" && p.path.length === 0 && dist(p, player) > 30) p.path = pathTo(p, player).slice(0, -1);
          stepNpc(p, dt);
          if ((p.summonedUntil || 0) < now) { p.mode = "home"; p.path = pathTo(p, yardPx(p.house)); }
          continue;
        }
        if (p.mode === "meeting") {
          if (stepNpc(p, dt)) { p.inHall = true; p.mode = "home"; }
          continue;
        }
        if (stepNpc(p, dt)) {
          p.idle -= dt;
          if (p.idle <= 0) {
            p.idle = 25 + rand() * 40;
            const wantInside = rand() < (workHours ? 0.7 : 0.3);
            if (wantInside !== p.inside) {
              p.inside = wantInside;
              const y = yardPx(p.house); p.x = y.x; p.y = y.y;
            }
          }
        }
      } else if (p.role === "worker") {
        if (stepNpc(p, dt)) {
          p.idle -= dt;
          if (p.idle <= 0) {
            p.idle = 3 + rand() * 6;
            const target = rand() < 0.5 ? yardPx(p.house, (rand() * 6) | 0)
              : { x: (PLAZA.x + 2 + rand() * (PLAZA.w - 4)) * T, y: (PLAZA.y + 2 + rand() * (PLAZA.h - 4)) * T };
            p.path = pathTo(p, target);
          }
        }
      }
      // face the human when they walk by
      if (!p.path.length && scene === "town" && !p.inside && dist(p, player) < 34) {
        const dx = player.x - p.x, dy = player.y - p.y;
        p.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 0;
      }
    }
    workerSync(now);
  }
  function followPlayer(p, dt) {
    if (scene !== "town") {
      const tx = player.x + 18, ty = player.y + 2;
      const d = Math.hypot(tx - p.rx, ty - p.ry);
      if (d > 20) {
        p.rx += ((tx - p.rx) / d) * NPC * 1.4 * dt; p.ry += ((ty - p.ry) / d) * NPC * 1.4 * dt; animate(p, dt);
        p.dir = Math.abs(tx - p.rx) > Math.abs(ty - p.ry) ? (tx < p.rx ? 1 : 2) : ty < p.ry ? 3 : 0;
      } else { p.frame = 0; p.dir = 0; }
      return;
    }
    const d = dist(p, player);
    p.hurry = d > 120;
    if (d > 28 && (!p.path.length || p.repath-- <= 0)) { p.path = pathTo(p, player).slice(0, -1); p.repath = 30; }
    if (d <= 22) p.path = [];
    stepNpc(p, dt);
  }
  function summonChief() {
    const c = chief();
    if (c && scene === "town" && dist(c, player) > 60) { c.path = pathTo(c, player).slice(0, -1); c.hurry = true; }
  }
  function workerSync(now) {
    const workers = people.filter((p) => p.role === "worker" && !p.inHall);
    for (let i = 0; i < workers.length; i++) for (let j = i + 1; j < workers.length; j++) {
      const a = workers[i], b = workers[j];
      if (dist(a, b) > 14 || (a.syncCooldown[b.id] || 0) > now) continue;
      a.syncCooldown[b.id] = b.syncCooldown[a.id] = now + 90000;
      a.bubble = { text: `Status sync with ${b.name}`, until: now + 3500 };
      b.bubble = { text: "Noted ✓", until: now + 3500 };
      api("/api/sync", { a: a.id, b: b.id }).catch(() => {});
    }
  }
  function callDirector(name) {
    const p = byName(name);
    if (!p || p.role !== "director") return false;
    if (scene !== "town") toast(`${p.name} will meet you outside.`);
    if (p.inside || p.inHall) { const d = doorPx(p.house); p.x = d.x; p.y = d.y; p.inside = false; p.inHall = false; }
    p.mode = "summoned"; p.summonedUntil = performance.now() + 60000; p.hurry = true;
    p.path = pathTo(p, player).slice(0, -1);
    p.bubble = { text: "On my way!", until: performance.now() + 3000 };
    return true;
  }

  // ------------------------------------------------------------------ rendering
  const cv = $("world"), ctx = cv.getContext("2d");
  const [lo, lg] = canvas(16, 16);   // the world at true pixel size
  let S = 3, dpr = 1, camX = 0, camY = 0;
  function resize() {
    dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
  }
  addEventListener("resize", resize);

  /** Render at true size, scale by whole device pixels, keep the focus clear of the toolbar. */
  function setView(worldW, worldH, zoom, fx, fy) {
    S = Math.max(2, Math.round(zoom * dpr));
    const vw = Math.ceil(cv.width / S), vh = Math.ceil(cv.height / S);
    if (lo.width !== vw + 1 || lo.height !== vh + 1) { lo.width = vw + 1; lo.height = vh + 1; lg.imageSmoothingEnabled = false; }
    const topPad = Math.ceil((($("toolbar")?.offsetHeight || 0) * dpr) / S);
    const avail = vh - topPad;
    camX = worldW <= vw ? -Math.floor((vw - worldW) / 2) : clamp(Math.round(fx - vw / 2), 0, worldW - vw);
    camY = worldH <= avail ? -Math.floor(topPad + (avail - worldH) / 2)
      : clamp(Math.round(fy - topPad - avail / 2), -topPad, worldH - vh);
    lg.setTransform(1, 0, 0, 1, -camX, -camY);
  }
  const toScreen = (x, y) => [(x - camX) * S, (y - camY) * S];
  const snap = (v, k = AP) => Math.round(v / k) * k;

  function drawPerson(p, x, y, opts = {}) {
    const s = charSprite(lookOf(p), opts.dir ?? p.dir, opts.sitting ? 0 : p.frame, !!opts.sitting);
    lg.fillStyle = "rgba(0,0,0,.3)"; lg.fillRect(snap(x) - 6, snap(y) - 1, 12, AP);
    lg.drawImage(s, snap(x - SPR_W / 2), snap(y - SPR_H + 1));
  }

  function zoomFor() { return innerWidth < 600 ? 2 : clamp(Math.round(Math.min(innerWidth / (26 * T), innerHeight / (15 * T))), 2, 4); }

  function renderTown(now) {
    setView(W * T, H * T, zoomFor(), player.x, player.y - 8);
    const vw = lo.width, vh = lo.height, t = now / 1000;
    lg.fillStyle = PAL.leaf; lg.fillRect(camX, camY, vw, vh);
    lg.drawImage(world.ground, 0, 0);
    const P = (x, y, w, h, col) => { lg.fillStyle = col; lg.fillRect(snap(x), snap(y), w, h); };

    // water rows scroll like an Atari river; the fountain spouts blocks
    const shift = Math.floor(t * 4) % 2;
    for (let y = POND.y - POND.ry; y < POND.y + POND.ry; y += PF * 2) for (let x = POND.x - POND.rx; x < POND.x + POND.rx; x += PF * 3) {
      if (inPond(x + 2, y + 2, -3) && ((x / PF + y / PF + shift) | 0) % 5 === 0) P(x, y, PF * 2, AP, PAL.waterHi);
    }
    const { x: fx, y: fy } = FOUNTAIN;
    P(fx - 4, fy - 10, 8, 12, PAL.lgrey); P(fx - 8, fy - 12, 16, 4, PAL.white);
    for (let i = 0; i < 6; i++) {
      const a = (t * 1.4 + i / 6) % 1;
      P(fx - 2 + (i - 2.5) * 4 * a, fy - 14 - Math.sin(a * Math.PI) * 12, AP, AP, i % 2 ? PAL.waterHi : PAL.white);
    }
    // ducks: two-block Atari sprites
    for (let i = 0; i < 2; i++) {
      const a = t * (0.12 + i * 0.05) + i * 2.6, left = Math.sin(a) * (i ? -1 : 1) > 0;
      const dx = POND.x + Math.cos(a) * POND.rx * (0.5 - i * 0.12) * (i ? -1 : 1), dy = POND.y + Math.sin(a) * POND.ry * 0.45;
      P(dx - 4, dy - 2, 8, 4, i ? PAL.white : "#ac783c"); P(left ? dx - 6 : dx + 2, dy - 6, 4, 4, i ? PAL.white : "#205c20"); P(left ? dx - 8 : dx + 6, dy - 4, 2, 2, "#e8e884");
    }
    for (const d of dust) P(d.x, d.y, AP, AP, `rgba(220,200,150,${d.life})`);
    const focus = nearest();
    if (focus && Math.floor(t * 4) % 2) { P(focus.x - 8, focus.y - 1, 4, AP, PAL.yellow); P(focus.x + 4, focus.y - 1, 4, AP, PAL.yellow); }

    const items = [];
    const inView = (x, y, m = 48) => x > camX - m && x < camX + vw + m && y > camY - m && y < camY + vh + 80;
    for (const id of Object.keys(LAYOUT)) {
      const b = LAYOUT[id], hs = world.houses[id];
      items.push({ y: (b.y + b.h) * T, draw: () => { lg.drawImage(hs.canvas, b.x * T, b.y * T - hs.top); houseLive(id, b, t); } });
    }
    for (const tr of trees) if (inView(tr.x, tr.y)) {
      const img = world.trees[tr.kind];
      items.push({ y: tr.y, draw: () => lg.drawImage(img, tr.x - 12, tr.y - 30) });
    }
    for (const pr of props) if (inView(pr.x, pr.y)) items.push({ y: pr.y, draw: () => lg.drawImage(world.props[pr.kind], pr.x - 17, pr.y - 28) });
    for (const p of people) if (visible(p) && inView(p.x, p.y)) items.push({ y: p.y, draw: () => drawPerson(p, p.x, p.y) });
    items.push({ y: player.y, draw: () => drawPerson(player, player.x, player.y) });
    items.sort((a, b) => a.y - b.y).forEach((i) => i.draw());

    for (const s of smoke) P(s.x, s.y, PF, PF, `rgba(200,200,200,${s.life * 0.8})`);
    for (const b of birds) for (let k = 0; k < 3; k++) {
      const up = Math.floor(t * 6 + k) % 2, bx = b.x - k * 12, by = b.y + (k % 2) * 6;
      P(bx - 4, by - up * 2, 4, AP, PAL.black); P(bx, by, AP, AP, PAL.black); P(bx + 2, by - up * 2, 4, AP, PAL.black);
    }
    const hr = hourNow(), day = hr >= 7 && hr < 19;
    if (day) for (const b of butterflies) if (Math.floor(t * 8 + b.ph) % 2) P(b.x, b.y, AP, AP, b.col);

    if (showNav) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        lg.fillStyle = solid(at(x, y)) ? "rgba(200,40,40,.35)" : "rgba(40,200,90,.22)";
        lg.fillRect(x * T, y * T, T, T);
      }
    }
    lighting(t, true);
    if (!day) for (const f of fireflies) if (Math.sin(t * 3 + f.ph) > 0.3) P(f.x, f.y, AP, AP, "#c8fca4");
    blit();

    for (const p of people) if (visible(p) && dist(p, player) < 7 * T) {
      nameTag(p.name, p.x, p.y - CHAR_H - 2, p.role === "worker" ? "#fcfc98" : p.role === "chief_of_staff" ? "#90cce8" : "#ececec");
    }
    const pending = new Set(roster.review.filter((r) => r.status === "pending_review").map((r) => r.agent));
    for (const p of people) if (visible(p) && pending.has(p.id) && !p.bubble) badge(p.x, p.y - CHAR_H - 14 - (Math.floor(t * 4) % 2) * 2);
    for (const p of people) if (visible(p) && p.bubble) speech(p.bubble.text, p.x, p.y - CHAR_H - 10);
    for (const [id, b] of Object.entries(LAYOUT)) {
      const d = doorPx(id);
      if (Math.hypot(d.x - player.x, d.y - player.y) < 5 * T) {
        const h = roster.houses.find((x) => x.id === id);
        if (h) nameTag(h.label.toUpperCase(), d.x, (b.y + b.h) * T + 12, "#fcfc98", true);
      }
    }
  }

  function houseLive(id, b, t) {
    const X = b.x * T, Y = b.y * T, w = b.w * T, flip = Math.floor(t * 3) % 2;
    const P = (x, y, ww, hh, col) => { lg.fillStyle = col; lg.fillRect(x, y, ww, hh); };
    if (id === "town_hall") { P(X + w / 2 + AP, Y - PF * 12 - 16, 12, 6, flip ? "#b03c3c" : "#c05858"); P(X + w / 2 + AP + (flip ? 8 : 6), Y - PF * 12 - 12, 6, 4, "#e8e884"); }
    if (id === "studio") P(X + w / 2 - PF, Y - PF * 5, PF * 2, PF * 2, flip ? "#fcfc98" : "#ececec");
  }

  /** Night swaps to a darker palette feel; lamps glow in stepped squares. */
  function lighting(t, town) {
    const h = hourNow();
    let tint = null, a = 0;
    if (h >= 20 || h < 5.5) { tint = "#1c209c"; a = 0.5; }
    else if (h >= 18) { tint = "#c06848"; a = ((h - 18) / 2) * 0.3; }
    else if (h < 7) { tint = "#d0805c"; a = ((7 - h) / 1.5) * 0.25; }
    if (!tint) return;
    lg.save(); lg.setTransform(1, 0, 0, 1, 0, 0);
    lg.globalCompositeOperation = "multiply"; lg.globalAlpha = a; lg.fillStyle = tint; lg.fillRect(0, 0, lo.width, lo.height);
    lg.restore();
    if (!town || a < 0.3) return;
    lg.save(); lg.globalCompositeOperation = "lighter";
    for (const pr of props) if (pr.kind === "lamp") for (let k = 3; k >= 1; k--) {
      lg.fillStyle = `rgba(232,232,132,${0.07 * (4 - k)})`; lg.fillRect(pr.x - k * 10, pr.y - 22 - k * 8, k * 20, k * 16);
    }
    for (const [, b] of Object.entries(LAYOUT)) {
      const roofH = Math.round((b.h * T * 0.5) / PF) * PF;
      lg.fillStyle = "rgba(252,252,152,.35)";
      lg.fillRect(b.x * T + PF * 3, b.y * T + roofH + PF * 2, PF * 3, PF * 3); lg.fillRect((b.x + b.w) * T - PF * 6, b.y * T + roofH + PF * 2, PF * 3, PF * 3);
    }
    lg.restore();
  }

  // CRT finish: scanlines on every Atari pixel row, plus a soft tube vignette.
  let crt = null, crtKey = "";
  function blit() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(lo, 0, 0, lo.width * S, lo.height * S);
    const key = `${cv.width}x${cv.height}x${S}`;
    if (key !== crtKey) {
      crtKey = key;
      const [line, lgc] = canvas(4, S * AP);
      lgc.fillStyle = "rgba(0,0,0,.22)"; lgc.fillRect(0, S * AP - Math.max(1, Math.round(S * 0.6)), 4, Math.max(1, Math.round(S * 0.6)));
      const vig = ctx.createRadialGradient(cv.width / 2, cv.height / 2, Math.min(cv.width, cv.height) * 0.4, cv.width / 2, cv.height / 2, Math.hypot(cv.width, cv.height) * 0.62);
      vig.addColorStop(0, "rgba(0,0,0,0)"); vig.addColorStop(1, "rgba(0,0,0,.45)");
      crt = { lines: ctx.createPattern(line, "repeat"), vig };
    }
    ctx.save(); ctx.translate(0, ((-camY * S) % (S * AP) + S * AP) % (S * AP));
    ctx.fillStyle = crt.lines; ctx.fillRect(0, -S * AP, cv.width, cv.height + S * AP * 2);
    ctx.restore();
    ctx.fillStyle = crt.vig; ctx.fillRect(0, 0, cv.width, cv.height);
  }

  function nameTag(text, wx, wy, color, sign = false) {
    const [sx, sy] = toScreen(wx, wy);
    const fs = Math.round(8 * dpr);
    ctx.font = `${fs}px ${UI_FONT}`;
    const w = Math.ceil(ctx.measureText(text).width) + 8 * dpr, h = fs + 8 * dpr;
    const x = Math.round(sx - w / 2), y = Math.round(sy - h);
    ctx.fillStyle = "#000"; ctx.fillRect(x, y, w, h);
    if (sign) { ctx.fillStyle = "#b03c3c"; ctx.fillRect(x, y + h - 2 * dpr, w, 2 * dpr); }
    ctx.fillStyle = color; ctx.textBaseline = "middle"; ctx.fillText(text, x + 4 * dpr, y + h / 2 + dpr);
  }
  function speech(text, wx, wy) {
    const [sx, sy] = toScreen(wx, wy);
    const fs = Math.round(8 * dpr);
    ctx.font = `${fs}px ${UI_FONT}`;
    const msg = text.length > 26 ? text.slice(0, 25) + "…" : text;
    const w = Math.ceil(ctx.measureText(msg).width) + 12 * dpr, h = fs + 12 * dpr;
    const x = Math.round(sx - w / 2), y = Math.round(sy - h - 6 * dpr);
    ctx.fillStyle = "#ececec"; ctx.fillRect(x, y, w, h); ctx.fillRect(sx - 2 * dpr, y + h, 4 * dpr, 4 * dpr);
    ctx.fillStyle = "#000"; ctx.textBaseline = "middle"; ctx.fillText(msg, x + 6 * dpr, y + h / 2 + dpr);
  }
  function badge(wx, wy) {
    const [sx, sy] = toScreen(wx, wy);
    const s = Math.round(14 * dpr), x = Math.round(sx - s / 2), y = Math.round(sy - s);
    ctx.fillStyle = "#e8e884"; ctx.fillRect(x, y, s, s);
    ctx.fillStyle = "#000"; ctx.fillRect(x + s / 2 - dpr, y + 3 * dpr, 2 * dpr, 5 * dpr); ctx.fillRect(x + s / 2 - dpr, y + 10 * dpr, 2 * dpr, 2 * dpr);
  }

  // ------------------------------------------------------------------ interior rendering
  const roomCache = {};
  function roomBackdrop(id) {
    if (roomCache[id]) return roomCache[id];
    const b = LAYOUT[id];
    const [c, g] = canvas(ROOM_W, ROOM_H + 4);
    const P = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    const wall2 = ntsc(shade(b.wall, -0.1));
    for (let y = 0; y < WALL_H; y += PF) P(0, y, ROOM_W, PF, (y / PF) % 2 ? b.wall : wall2);
    P(0, WALL_H - PF, ROOM_W, PF, PAL.wood);
    for (let y = WALL_H; y < ROOM_H; y += 8) for (let x = 0; x < ROOM_W; x += 8) P(x, y, 8, 8, ((x + y) / 8) % 2 ? PAL.wood : "#985c28");
    for (const wx of [20, ROOM_W - 44]) { P(wx, 8, 24, 20, "#90b4ec"); P(wx + 11, 8, 2, 20, b.wall); P(wx, 17, 24, 2, b.wall); }
    P(64, 4, 28, WALL_H - 8, PAL.woodDk);
    for (let s = 0; s < 3; s++) ["#b03c3c", "#5c9c5c", "#4c3cac", "#e8e884", "#ececec", "#d0805c"].forEach((col, i) => P(66 + i * 4, 6 + s * 10, 2, 8, col));
    P(ROOM_W / 2 - 18, 6, 36, WALL_H - 6, PAL.grey); P(ROOM_W / 2 - 10, 16, 20, WALL_H - 16, PAL.black);
    P(ROOM_W / 2 - 44, 86, 88, 24, b.roof); P(ROOM_W / 2 - 40, 90, 80, 16, b.roof2);
    P(ROOM_W / 2 - 12, ROOM_H, 24, 4, PAL.black);
    // the house's own wall feature
    const x = 146, y = 6;
    if (EMBLEMS[b.sign]) { P(x, y, 36, 26, PAL.black); const [rows, colors] = EMBLEMS[b.sign]; blocks(g, x + 6, y + 5, rows, colors, 6); }
    return (roomCache[id] = c);
  }

  function renderRoom(now) {
    const id = scene, t = now / 1000;
    const zoom = Math.min(innerWidth / (ROOM_W + 24), (innerHeight - 80) / (ROOM_H + 24));
    setView(ROOM_W, ROOM_H + 4, Math.max(1.5, zoom), player.x, player.y - 20);
    lg.fillStyle = PAL.black; lg.fillRect(camX, camY, lo.width, lo.height);
    lg.drawImage(roomBackdrop(id), 0, 0);
    const P = (x, y, w, h, col) => { lg.fillStyle = col; lg.fillRect(x, y, w, h); };
    const f = Math.floor(t * 6) % 3;
    [["#d0805c", 0], ["#e8e884", 1], ["#c05858", 2]].forEach(([col, k]) => P(ROOM_W / 2 - 8 + k * 6, WALL_H - 12 + ((f + k) % 3) * 2, 4, 10 - ((f + k) % 3) * 2, col));

    const items = [];
    const plant = (x) => items.push({ y: WALL_H + 14, draw: () => { P(x + 2, WALL_H + 6, 10, 8, "#ac5030"); P(x, WALL_H - 6, 14, 12, PAL.grassA); P(x + 4, WALL_H - 10, 6, 4, PAL.leafHi); } });
    if (id === "town_hall") {
      items.push({ y: 84, draw: () => { P(62, 66, 116, 16, PAL.woodDk); P(62, 66, 116, 4, PAL.woodLt); } });
      const seats = seatPositions();
      people.filter((p) => p.inHall).forEach((p, i) => {
        const s = seats[i % seats.length];
        items.push({ y: s.y, draw: () => drawPerson(p, s.x, s.y, { sitting: true, dir: s.dir }) });
      });
    } else {
      plant(12); plant(ROOM_W - 26);
      items.push({ y: 82, draw: () => {
        P(96, 68, 48, 14, PAL.woodDk); P(96, 68, 48, 4, PAL.woodLt);
        P(112, 58, 16, 10, PAL.dgrey); P(114, 60, 12, 6, Math.floor(t * 2) % 2 ? "#90cce8" : "#a4e0fc");
      } });
      for (const p of people) if (p.role === "director" && p.house === id && p.inside) {
        items.push({ y: DESK.y - 2, draw: () => drawPerson(p, DESK.x, DESK.y - 2, { sitting: true, dir: 0 }) });
      }
    }
    const c = chief();
    if (c && c.rx !== undefined) items.push({ y: c.ry, draw: () => drawPerson(c, c.rx, c.ry) });
    items.push({ y: player.y, draw: () => drawPerson(player, player.x, player.y) });
    items.sort((a, b) => a.y - b.y).forEach((i) => i.draw());
    lighting(t, false);
    blit();
    const tags = [];
    if (id === "town_hall") people.filter((p) => p.inHall).forEach((p, i) => { const s = seatPositions()[i % 8]; tags.push([p, s.x, s.y]); });
    else for (const p of people) if (p.role === "director" && p.house === id && p.inside) tags.push([p, DESK.x, DESK.y - 2]);
    for (const [p, x, y] of tags) nameTag(p.name, x, y - CHAR_H - 1, "#ececec");
    if (c && c.rx !== undefined) nameTag(c.name, c.rx, c.ry - CHAR_H - 2, "#90cce8");
    for (const [p, x, y] of tags) if (p.bubble) speech(p.bubble.text, x, y - CHAR_H - 10);
  }

  function updateFx(dt) {
    if (rand() < dt * 3) for (const [id, b] of Object.entries(LAYOUT)) if (id !== "town_hall" && rand() < 0.4)
      smoke.push({ x: (b.x + b.w) * T - PF * 5, y: b.y * T - PF * 4, life: 1 });
    for (const s of smoke) { s.y -= dt * 10; s.x += dt * 3; s.life -= dt * 0.35; }
    while (smoke.length && smoke[0].life <= 0) smoke.shift();
    for (const b of butterflies) { b.ph += dt; b.x += Math.cos(b.ph * 0.7 + b.seed) * dt * 14; b.y += Math.sin(b.ph * 1.1 + b.seed) * dt * 9; if (Math.hypot(b.x - b.hx, b.y - b.hy) > 40) { b.x += (b.hx - b.x) * dt; b.y += (b.hy - b.y) * dt; } }
    for (const f of fireflies) { f.ph += dt; f.x += Math.cos(f.ph * 0.6 + f.seed) * dt * 6; f.y += Math.sin(f.ph * 0.8 + f.seed) * dt * 5; }
    for (const d of dust) d.life -= dt * 2.5;
    while (dust.length && dust[0].life <= 0) dust.shift();
    if (birds.length < 1 && rand() < dt * 0.08) birds.push({ x: -20, y: 20 + rand() * (H * T - 80), v: 40 + rand() * 20 });
    for (const b of birds) b.x += b.v * dt;
    for (let i = birds.length - 1; i >= 0; i--) if (birds[i].x > W * T + 40) birds.splice(i, 1);
  }

  function updateHint() {
    let text = "ARROWS WALK · SHIFT RUN · T TALK · MM CHIEF · G MAP GRID · ? HELP";
    const n = nearest();
    if (n) text = `PRESS T TO TALK TO ${n.name.toUpperCase()}`;
    else if (scene !== "town") text = "WALK OUT THE BOTTOM DOOR TO LEAVE";
    if ($("hint").textContent !== text) $("hint").textContent = text;
    $("touch-talk")?.classList.toggle("ready", !!n);
  }

  // ------------------------------------------------------------------ main loop
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    movePlayer(dt);
    updatePeople(dt, now);
    updateFx(dt);
    if (scene === "town") renderTown(now); else renderRoom(now);
    updateHint();
    drawMinimap(now / 1000);
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------ UI: chat
  function closeAll() { for (const id of ["chat", "review", "hire", "help", "reader"]) $(id).classList.add("hidden"); chatWith = null; }
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => { $(b.dataset.close).classList.add("hidden"); if (b.dataset.close === "chat") chatWith = null; }));
  const logs = {};
  function openChat(p) {
    if (!p) return;
    chatWith = p;
    $("chat-name").textContent = p.name;
    $("chat-title").textContent = `${p.title} · ${p.model}${p.connectors?.length ? " · " + p.connectors.join(", ") : ""}`;
    const pc = $("portrait").getContext("2d"); pc.imageSmoothingEnabled = false; pc.clearRect(0, 0, 36, 36);
    pc.drawImage(charSprite(lookOf(p), 0, 0), 0, 0, SPR_W, 12, 2, 4, 32, 24);
    renderBelt(p);
    renderLog();
    $("chat").classList.remove("hidden");
    setTimeout(() => $("chat-input").focus(), 0);
  }
  // Each agent's tool belt: the user switches toolsets on and off; the brain only gets what is on.
  function renderBelt(p) {
    const box = $("toolbelt"); box.innerHTML = "";
    const info = roster.toolsets || {};
    for (const t of p.toolbelt || []) {
      const on = (p.active_tools || []).includes(t);
      const b = document.createElement("button");
      b.type = "button"; b.className = "tool" + (on ? " on" : ""); b.textContent = t.replace("mcp-", "");
      b.title = `${info[t] || t}: ${on ? "on" : "off"}`; b.setAttribute("aria-pressed", String(on));
      b.onclick = async () => {
        b.disabled = true;
        try {
          const updated = await api("/api/tools", { agent: p.id, toolset: t, enabled: !on });
          Object.assign(p, { active_tools: updated.active_tools });
          await refresh();
          toast(`${p.name}: ${t.replace("mcp-", "")} ${on ? "off" : "on"}`);
        } catch (err) { toast(err.message, true); }
        renderBelt(p);
      };
      box.appendChild(b);
    }
    const remote = roster.brain === "hermes-remote";
    box.querySelectorAll(".tool").forEach((b) => (b.disabled = remote));
    $("belt-note").textContent = remote ? "Tools are set on your Hermes server · risky ones ask for your OK in Review"
      : roster.brain === "hermes" ? "Hermes agent · tools apply on the next task" : roster.brain === "claude" ? "Tools take full effect with the Hermes brain" : "";
  }
  $("decisions-btn").addEventListener("click", async () => {
    if (!chatWith) return;
    const p = chatWith;
    $("reader-title").textContent = `${p.name}: decisions`;
    $("reader-body").textContent = "Loading…";
    $("reader").classList.remove("hidden");
    try {
      const { decisions } = await api(`/api/decisions/${p.id}`);
      $("reader-body").textContent = decisions.length ? decisions.map((d) =>
        `${d.at}  ${d.ok ? "OK " : "ERR"}  ${d.model}${d.api_calls != null ? `  ${d.api_calls} calls` : ""}${d.cost_usd != null ? `  ~$${Number(d.cost_usd).toFixed(3)}` : ""}\n` +
        `tools: ${(d.tools || []).join(", ") || "none"}\n> ${d.prompt}\n< ${d.reply}\n`).join("\n")
        : "No decisions yet. Give this agent a task.";
    } catch (err) { $("reader-body").textContent = err.message; }
  });

  function renderLog() {
    const box = $("chat-log"); box.innerHTML = "";
    for (const m of logs[chatWith.id] || []) {
      const d = document.createElement("div");
      d.className = "msg " + m.cls; d.textContent = m.text; box.appendChild(d);
    }
    box.scrollTop = box.scrollHeight;
  }
  function push(id, cls, text) { (logs[id] ||= []).push({ cls, text }); if (chatWith?.id === id) renderLog(); }
  $("chat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("chat-input").value.trim();
    if (!msg || !chatWith) return;
    const p = chatWith;
    let note = "";
    $("chat-input").value = "";
    push(p.id, "me", `You: ${msg}`);
    if (p.role === "chief_of_staff") {
      const m = msg.match(/\b(?:call|summon|get|bring|fetch)\s+(\w+)/i);
      if (m && callDirector(m[1])) { push(p.id, "", `${p.name}: Calling ${m[1]} over now.`); note = ` (The village has already sent ${m[1]} walking over to the user.)`; }
    }
    push(p.id, "thinking", `${p.name} is thinking…`);
    try {
      const { job } = await api("/api/chat", { agent: p.id, message: msg + note });
      const res = await waitJob(job);
      logs[p.id] = logs[p.id].filter((x) => x.cls !== "thinking");
      push(p.id, "", `${p.name}: ${res.reply}`);
      p.bubble = { text: "💬", until: performance.now() + 2500 };
      if (res.deliverable) { toast(`${p.name} filed “${res.deliverable.title}” for your review.`); await refresh(); }
    } catch (err) {
      logs[p.id] = logs[p.id].filter((x) => x.cls !== "thinking");
      push(p.id, "", `(${err.message})`);
    }
  });

  // ------------------------------------------------------------------ UI: to-do, meeting
  $("todo-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = $("todo").value.trim();
    if (!text) return;
    $("todo").value = ""; $("todo").blur();
    const c = chief();
    if (c) c.bubble = { text: "On it — routing…", until: performance.now() + 4000 };
    toast(`${c ? c.name : "Your Chief of Staff"} took the to-do: “${text.slice(0, 60)}”`);
    try {
      const { job } = await api("/api/task", { text });
      const res = await waitJob(job);
      const d = people.find((p) => p.id === res.routed_to);
      if (d) d.bubble = { text: "Done! In your review queue", until: performance.now() + 6000 };
      toast(`${d ? d.name : "Your team"} delivered “${res.deliverable.title}”. Open Review to approve.`);
      await refresh();
    } catch (err) { toast(`To-do failed: ${err.message}`, true); }
  });

  $("meeting-btn").addEventListener("click", async () => {
    if (meeting && meeting.done) return adjourn();
    if (meeting) return toast("The meeting is still underway at Town Hall.");
    const agenda = $("agenda").value;
    meeting = { agenda, done: false };
    for (const p of people) if (p.role === "director") {
      if (p.inside) { const d = doorPx(p.house); p.x = d.x; p.y = d.y; p.inside = false; }
      p.mode = "meeting"; p.hurry = true;
      p.path = pathTo(p, { x: doorPx("town_hall").x, y: doorPx("town_hall").y - 4 });
    }
    toast(`Meeting called: ${agenda}. Directors are heading to Town Hall.`);
    try {
      const { job } = await api("/api/meeting", { agenda });
      const res = await waitJob(job);
      toast(`Meeting briefing ready: “${res.deliverable.title}” (in Review).`);
      await refresh();
    } catch (err) { toast(`Meeting failed: ${err.message}`, true); }
    meeting.done = true;
    $("meeting-btn").textContent = "Adjourn";
  });
  function adjourn() {
    meeting = null; $("meeting-btn").textContent = "Meeting";
    for (const p of people) if (p.role === "director") {
      p.inHall = false; p.mode = "home"; p.hurry = false;
      const d = doorPx("town_hall"); p.x = d.x; p.y = d.y;
      p.path = pathTo(p, yardPx(p.house));
    }
    toast("Meeting adjourned.");
  }

  // ------------------------------------------------------------------ UI: review
  $("review-btn").addEventListener("click", () => { renderReview(); $("review").classList.toggle("hidden"); });
  const CHOICE_LABEL = { once: "Allow once", session: "Allow for this task", deny: "Deny" };
  function renderReview() {
    const list = $("review-list"); list.innerHTML = "";
    for (const ap of roster.approvals || []) {
      const who = roster.agents.find((a) => a.id === ap.agent);
      const el = document.createElement("div"); el.className = "item approval";
      el.innerHTML = `<div><span class="status pending_review">needs approval</span> <b></b></div><pre class="what"></pre><div class="row"></div>`;
      el.querySelector("b").textContent = `${who ? who.name : ap.agent} wants to run a tool`;
      el.querySelector(".what").textContent = ap.what;
      for (const choice of ap.choices) {
        const b = document.createElement("button"); b.className = choice === "deny" ? "bad" : "good"; b.textContent = CHOICE_LABEL[choice] || choice;
        b.onclick = async () => { b.disabled = true; try { await api("/api/approval", { id: ap.id, choice }); toast(`${CHOICE_LABEL[choice] || choice}: ${who ? who.name : ap.agent}`); } catch (err) { toast(err.message, true); } await refresh(); renderReview(); };
        el.querySelector(".row").appendChild(b);
      }
      list.appendChild(el);
    }
    const items = [...roster.review].reverse();
    if (!items.length && !(roster.approvals || []).length) list.innerHTML = '<p class="muted">No deliverables yet. Give your Chief of Staff a to-do.</p>';
    for (const it of items) {
      const who = roster.agents.find((a) => a.id === it.agent);
      const el = document.createElement("div"); el.className = "item";
      el.innerHTML = `<div><span class="status ${it.status}">${it.status.replace("_", " ")}</span> <b></b></div>
        <div class="muted"></div>
        <div class="row"><button class="read">Read</button>${window.VILLAGE_BACKEND ? "" : `<a target="_blank" href="/files/${encodeURI(it.pdf)}">PDF</a><a target="_blank" href="/files/${encodeURI(it.md)}">Markdown</a>`}</div>`;
      el.querySelector(".read").onclick = () => openReader(it);
      el.querySelector("b").textContent = it.title;
      el.querySelector(".muted").textContent = `${who ? who.name : it.agent} · ${it.created} · “${it.task.slice(0, 80)}”`;
      if (it.status === "pending_review") {
        const row = document.createElement("div"); row.className = "row";
        const label = it.action ? it.action.label : "Approve";
        for (const [d, cls, txt] of [["approved", "good", label], ["rejected", "bad", "Reject"]]) {
          const b = document.createElement("button"); b.className = cls; b.textContent = txt;
          b.onclick = async () => {
            b.disabled = true;
            try { const res = await api("/api/review", { id: it.id, decision: d }); if (res?.note) toast(res.note); }
            catch (err) { toast(err.message, true); }
            await refresh(); renderReview();
          };
          row.appendChild(b);
        }
        el.appendChild(row);
      }
      if (it.result_url) { const a = document.createElement("a"); a.href = it.result_url; a.target = "_blank"; a.rel = "noopener"; a.textContent = "Open in Gmail"; el.appendChild(a); }
      list.appendChild(el);
    }
  }
  async function openReader(it) {
    $("reader-title").textContent = it.title;
    $("reader-body").textContent = "Loading…";
    $("reader").classList.remove("hidden");
    try {
      $("reader-body").textContent = it.text ?? await (await fetch(`/files/${encodeURI(it.md)}`)).text();
    } catch (err) { $("reader-body").textContent = `Could not load the deliverable: ${err.message}`; }
  }

  // ------------------------------------------------------------------ UI: hiring
  $("hire-btn").addEventListener("click", () => {
    const sel = $("hire-director"); sel.innerHTML = "";
    for (const a of roster.agents.filter((a) => a.role === "director")) {
      const o = document.createElement("option"); o.value = a.id; o.textContent = `${a.name} — ${a.title}`; sel.appendChild(o);
    }
    $("candidates").innerHTML = "";
    $("hire").classList.toggle("hidden");
  });
  $("source-btn").addEventListener("click", async () => {
    const director = $("hire-director").value;
    const { candidates } = await api("/api/candidates", { director });
    const box = $("candidates"); box.innerHTML = "";
    if (!candidates.length) box.innerHTML = '<p class="muted">No candidates left in the pool.</p>';
    for (const c of candidates) {
      const el = document.createElement("div"); el.className = "item";
      el.innerHTML = "<b></b><div class='muted'></div><div class='row'></div>";
      el.querySelector("b").textContent = c.name;
      el.querySelector(".muted").textContent = `Interview at Town Hall: “${c.pitch}”`;
      const yes = document.createElement("button"); yes.className = "good"; yes.textContent = "Approve hire";
      yes.onclick = async () => {
        // Two-step approval in the page itself (embedded viewers suppress confirm()).
        if (!yes.dataset.armed) { yes.dataset.armed = "1"; yes.textContent = `Confirm: hire ${c.name}`; return; }
        try {
          await api("/api/hire", { director, name: c.name, approved_by_human: true });
          toast(`${c.name} hired. They're walking over from the Recruiting Office in a yellow vest.`);
          await refresh(); $("hire").classList.add("hidden");
        } catch (err) { toast(err.message, true); }
      };
      const no = document.createElement("button"); no.textContent = "Pass"; no.onclick = () => el.remove();
      el.querySelector(".row").append(yes, no);
      box.appendChild(el);
    }
  });
  $("help-btn").addEventListener("click", () => $("help").classList.toggle("hidden"));
  function setMap(on) {
    $("minimap").hidden = !on; $("map-btn").setAttribute("aria-pressed", String(on));
    try { localStorage.setItem("villageMap", on ? "1" : "0"); } catch {}
  }
  $("map-btn").addEventListener("click", () => setMap($("minimap").hidden));
  { let pref = null; try { pref = localStorage.getItem("villageMap"); } catch {} setMap(pref ? pref === "1" : innerWidth >= 900); }

  // ------------------------------------------------------------------ minimap
  let miniBase = null;
  function drawMinimap(t) {
    const m = $("minimap");
    m.style.visibility = scene === "town" ? "visible" : "hidden";
    if (m.hidden || scene !== "town") return;
    const g = m.getContext("2d");
    if (!miniBase) {
      const [c, mg] = canvas(W * 2, H * 2);
      const col = { 0: PAL.g1, 1: PAL.p0, 2: PAL.s0, 4: PAL.p0, 5: PAL.gDeep, 6: PAL.w0, 7: PAL.g2, 8: PAL.s1, 9: PAL.g0, 10: PAL.w0 };
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { mg.fillStyle = col[at(x, y)] || PAL.g1; mg.fillRect(x * 2, y * 2, 2, 2); }
      for (const b of Object.values(LAYOUT)) { mg.fillStyle = PAL.out; mg.fillRect(b.x * 2 - 1, b.y * 2 - 1, b.w * 2 + 2, b.h * 2 + 2); mg.fillStyle = b.roof; mg.fillRect(b.x * 2, b.y * 2, b.w * 2, b.h * 2); }
      miniBase = c;
    }
    g.imageSmoothingEnabled = false;
    g.drawImage(miniBase, 0, 0);
    for (const p of people) if (!p.inside && !p.inHall) { g.fillStyle = p.role === "worker" ? "#f2c230" : p.palette?.shirt || "#fff"; g.fillRect(Math.round(p.x / 8) - 1, Math.round(p.y / 8) - 2, 3, 3); }
    const blink = Math.sin(t * 6) > 0;
    const pp = scene === "town" ? player : doorPx(scene);
    g.fillStyle = PAL.out; g.fillRect(Math.round(pp.x / 8) - 2, Math.round(pp.y / 8) - 3, 5, 5);
    g.fillStyle = blink ? "#ffffff" : "#f2c230"; g.fillRect(Math.round(pp.x / 8) - 1, Math.round(pp.y / 8) - 2, 3, 3);
  }

  // ------------------------------------------------------------------ boot
  let knownApprovals = new Set();
  async function refresh() {
    roster = await api("/api/state");
    $("brain").textContent = roster.brain_label || ({ claude: "Claude CLI", hermes: "Hermes", "hermes-remote": "Hermes server" }[roster.brain] || "offline");
    if (roster.brain === "hermes-remote" && !refresh.polling) refresh.polling = setInterval(() => refresh().catch(() => {}), 4000);
    $("brain").className = "badge " + roster.brain;
    $("brain").title = { claude: "Agents think with your local claude CLI", hermes: "Each agent is its own Hermes Agent" }[roster.brain] || "No AI available here, placeholder replies";
    const seenApprovals = new Set((roster.approvals || []).map((a) => a.id));
    for (const ap of roster.approvals || []) if (!knownApprovals.has(ap.id)) {
      const who = people.find((p) => p.id === ap.agent);
      if (who) who.bubble = { text: "Needs your OK!", until: performance.now() + 8000 };
      toast(`${who ? who.name : ap.agent} needs your approval. Open Review.`);
    }
    knownApprovals = seenApprovals;
    if (!$("review").classList.contains("hidden")) renderReview();
    const pending = roster.review.filter((r) => r.status === "pending_review").length + seenApprovals.size;
    $("review-count").textContent = pending; $("review-count").hidden = !pending;
    $("guardrails").innerHTML = "";
    for (const g of roster.guardrails) { const li = document.createElement("li"); li.textContent = g; $("guardrails").appendChild(li); }
    if (roster.connectors) {
      $("connectors").innerHTML = "";
      for (const c of roster.connectors) { const li = document.createElement("li"); li.textContent = `${c.name}: ${c.status}`; $("connectors").appendChild(li); }
    }
    syncPeople();
  }

  buildMap();
  world.ground = drawGround();
  for (const k of ["oak", "pine", "bush"]) world.trees[k] = drawTree(k);
  for (const k of ["lamp", "bench", "mailbox", "signpost", "barrel", "crate", "pot", "well", "tripod", "suitcase", "noticeboard", "cart", "fence"]) world.props[k] = drawProp(k);
  for (const id of Object.keys(LAYOUT)) world.houses[id] = drawHouse(id);
  const flowerTiles = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) === 7) flowerTiles.push([x, y]);
  for (let i = 0; i < 9 && flowerTiles.length; i++) {
    const [fx, fy] = flowerTiles[(rand() * flowerTiles.length) | 0];
    butterflies.push({ x: fx * T + 8, y: fy * T + 4, hx: fx * T + 8, hy: fy * T + 4, ph: rand() * 6, seed: rand() * 6, col: ["#e8e884", "#eca0a0", "#90cce8", "#ececec"][i % 4] });
  }
  for (let i = 0; i < 40; i++) fireflies.push({ x: rand() * W * T, y: rand() * H * T, ph: rand() * 6, seed: rand() * 6 });
  player.x = FOUNTAIN.x; player.y = (PLAZA.y + PLAZA.h - 4) * T;
  resize();
  refresh().then(() => {
    const c = chief(); if (c) { c.x = player.x + 16; c.y = player.y; }
    let seen = false;
    try { seen = !!sessionStorage.getItem("seenHelp"); sessionStorage.setItem("seenHelp", "1"); } catch {}
    if (!seen) $("help").classList.remove("hidden");
  }).catch((err) => toast(`Could not reach the village server: ${err.message}`, true));
  requestAnimationFrame(frame);
  window.__village = { player, people, enter, leave, callDirector, refresh, get scene() { return scene; }, at, doors };
})();
