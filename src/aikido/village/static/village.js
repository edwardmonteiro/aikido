/* Agent Village — a top-down 16-bit town where your AI agents live and work.
 *
 * Everything is drawn procedurally on a <canvas>: no image assets, no credits.
 * The server (aikido village) owns the agents' brains, memory and guardrails;
 * this file is the world, the controls and the UI.
 */
(() => {
  "use strict";

  // ------------------------------------------------------------------ constants
  const T = 16;                 // tile size, world px
  const W = 64, H = 44;         // map size, tiles
  const WALK = 70, RUN = 130;   // px / second
  const NPC = 55;
  const CHAR_W = 12, CHAR_H = 20;
  const ROOM_W = 220, ROOM_H = CHAR_H * 5, WALL_H = 34; // characters are 1/5 of room height

  const PLAYER_PALETTE = { shirt: "#7a4fd0", pants: "#2a2440", hair: "#3b2416", skin: "#d9a066" };

  // Footprints (tile top-left, size). Doors are on the south wall.
  const LAYOUT = {
    town_hall: { x: 27, y: 3, w: 10, h: 7, roof: "#7b2d26", wall: "#e8d9b5" },
    inbox:     { x: 12, y: 4, w: 8, h: 6, roof: "#b0413e", wall: "#f1e3c6" },
    studio:    { x: 44, y: 4, w: 8, h: 6, roof: "#2b2b2b", wall: "#d8d0e8" },
    bank:      { x: 3, y: 14, w: 8, h: 6, roof: "#2e6b3a", wall: "#efe9da" },
    library:   { x: 3, y: 24, w: 8, h: 6, roof: "#3f3a7a", wall: "#e9dcc3" },
    travel:    { x: 53, y: 14, w: 8, h: 6, roof: "#1f7a7a", wall: "#f2e6cf" },
    workshop:  { x: 53, y: 24, w: 8, h: 6, roof: "#55606b", wall: "#d6d0c4" },
    archive:   { x: 8, y: 34, w: 8, h: 6, roof: "#6b4a73", wall: "#eadbd0" },
    home:      { x: 28, y: 35, w: 8, h: 6, roof: "#a0522d", wall: "#f6e7c8" },
    recruiting:{ x: 48, y: 34, w: 8, h: 6, roof: "#c9862b", wall: "#f1e6d0" },
  };
  const PLAZA = { x: 22, y: 13, w: 21, h: 16 };
  const FOUNTAIN = { x: 32.5 * T, y: 21 * T, r: 2.2 * T };

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
  function canvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    return [c, g];
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => clamp(Math.round(v + amt * 255), 0, 255);
    const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
    return `rgb(${r},${g},${b})`;
  }

  async function api(path, body) {
    const res = await fetch(path, body === undefined ? {} : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { data });
    return data;
  }
  async function waitJob(id) {
    for (;;) {
      await new Promise((r) => setTimeout(r, 1200));
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
    setTimeout(() => el.remove(), 7000);
  }

  // ------------------------------------------------------------------ the map
  // 0 grass, 1 path, 2 plaza, 3 house (solid), 4 door, 5 tree (solid), 6 water/fountain (solid), 7 flowers
  const grid = new Uint8Array(W * H);
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 3 : grid[y * W + x]);
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) grid[y * W + x] = v; };
  const solid = (v) => v === 3 || v === 5 || v === 6;
  const doors = {};

  function buildMap() {
    for (let y = PLAZA.y; y < PLAZA.y + PLAZA.h; y++)
      for (let x = PLAZA.x; x < PLAZA.x + PLAZA.w; x++) set(x, y, 2);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (Math.hypot((x + 0.5) * T - FOUNTAIN.x, (y + 0.5) * T - FOUNTAIN.y) < FOUNTAIN.r) set(x, y, 6);
    for (const [id, b] of Object.entries(LAYOUT)) {
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) set(x, y, 3);
      const dx = b.x + Math.floor(b.w / 2), dy = b.y + b.h - 1;
      set(dx, dy, 4);
      if (b.w >= 10) set(dx - 1, dy, 4);
      doors[id] = { x: dx, y: dy };
    }
    // Paths: breadth-first from each door to the plaza, then widen to 2 tiles.
    for (const d of Object.values(doors)) {
      const route = bfs({ x: d.x, y: d.y + 1 }, (x, y) => at(x, y) === 2, (v) => v === 3 || v === 6 || v === 4);
      for (const p of route || []) if (at(p.x, p.y) === 0) set(p.x, p.y, 1);
      set(d.x, d.y + 1, 1);
    }
    const widen = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) === 1) widen.push([x + 1, y], [x, y + 1]);
    for (const [x, y] of widen) if (at(x, y) === 0) set(x, y, 1);
    // Trees and flowers on free grass, keeping a margin around everything built.
    const busy = (x, y) => { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (at(x + i, y + j) !== 0) return true; return false; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (at(x, y) !== 0) continue;
      const edge = x < 2 || y < 2 || x > W - 3 || y > H - 3;
      if ((edge && rand() < 0.55) || (!busy(x, y) && rand() < 0.07)) set(x, y, 5);
      else if (!busy(x, y) && rand() < 0.05) set(x, y, 7);
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

  // ------------------------------------------------------------------ sprites
  const spriteCache = new Map();
  // dir: 0 down, 1 left, 2 right, 3 up. frame: 0 stand, 1 stride A, 2 stride B.
  function charSprite(pal, dir, frame, opts = {}) {
    const key = JSON.stringify([pal, dir, frame, opts]);
    if (spriteCache.has(key)) return spriteCache.get(key);
    const [c, g] = canvas(CHAR_W, CHAR_H);
    const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    const bob = frame === 0 ? 0 : 1;
    const sit = opts.sitting;
    const outline = "#1a1420";
    // legs
    if (sit) {
      px(3, 15, 6, 3, pal.pants); px(3, 18, 2, 1, outline); px(7, 18, 2, 1, outline);
    } else if (dir === 0 || dir === 3) {
      const l = frame === 1 ? 2 : 0, r = frame === 2 ? 2 : 0;
      px(3, 15, 3, 4 - l, pal.pants); px(6, 15, 3, 4 - r, pal.pants);
      px(3, 19 - l, 3, 1, outline); px(6, 19 - r, 3, 1, outline);
    } else {
      const s = dir === 1 ? -1 : 1;
      if (frame === 0) { px(4, 15, 4, 4, pal.pants); px(4, 19, 4, 1, outline); }
      else {
        const a = frame === 1 ? 1 : -1;
        px(5 + 2 * a * s - 1, 15, 3, 4, pal.pants); px(5 - 2 * a * s - 1, 15, 3, 4, shade(pal.pants, -0.08));
        px(5 + 2 * a * s - 1, 19, 3, 1, outline); px(5 - 2 * a * s - 1, 19, 3, 1, outline);
      }
    }
    const y0 = bob;
    // torso
    px(2, 8 + y0, 8, 7, pal.shirt);
    px(2, 14 + y0, 8, 1, shade(pal.shirt, -0.12));
    if (opts.vest) {
      px(3, 8 + y0, 6, 7, "#f5d300"); px(3, 12 + y0, 6, 1, "#c8c8c8");
      if (dir !== 3) px(5, 8 + y0, 2, 3, pal.shirt);
    }
    if (opts.badge) px(dir === 2 ? 3 : 7, 9 + y0, 2, 2, "#ffd34d");
    // arms (swing on stride)
    const sw = frame === 0 ? 0 : frame === 1 ? 1 : -1;
    if (dir === 0 || dir === 3) {
      px(1, 9 + y0 + sw, 1, 5, pal.shirt); px(10, 9 + y0 - sw, 1, 5, pal.shirt);
      px(1, 14 + y0 + sw, 1, 1, pal.skin); px(10, 14 + y0 - sw, 1, 1, pal.skin);
    } else {
      const ax = dir === 1 ? 5 : 6;
      px(ax, 9 + y0, 2, 5, shade(pal.shirt, -0.06)); px(ax + sw, 14 + y0, 2, 1, pal.skin);
    }
    if (opts.phone && dir !== 3) {
      const hx = dir === 1 ? 4 : dir === 2 ? 7 : 10;
      px(hx, 11 + y0, 2, 3, "#222"); px(hx, 11 + y0, 2, 1, "#7fd1ff");
    }
    // head
    px(2, 1 + y0, 8, 7, pal.skin);
    px(2, 0 + y0, 8, 2, pal.hair);
    if (dir === 0) {
      px(2, 2 + y0, 1, 3, pal.hair); px(9, 2 + y0, 1, 3, pal.hair);
      px(4, 4 + y0, 1, 2, outline); px(7, 4 + y0, 1, 2, outline);
      px(5, 6 + y0, 2, 1, shade(pal.skin, -0.15));
    } else if (dir === 3) {
      px(2, 1 + y0, 8, 6, pal.hair);
    } else {
      const back = dir === 1 ? 7 : 2, eye = dir === 1 ? 3 : 8;
      px(back, 1 + y0, 3, 5, pal.hair); px(eye, 4 + y0, 1, 2, outline);
    }
    spriteCache.set(key, c);
    return c;
  }

  function drawHouse(id) {
    const b = LAYOUT[id];
    const w = b.w * T, h = b.h * T;
    const [c, g] = canvas(w, h + 2 * T);
    const oy = 2 * T; // headroom for towers / signs
    const roofH = Math.round(h * 0.5);
    const px = (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y + oy, ww, hh); };
    // walls
    px(4, roofH - 2, w - 8, h - roofH + 2, b.wall);
    for (let y = roofH + 4; y < h; y += 6) px(4, y, w - 8, 1, shade(b.wall, -0.06));
    px(4, h - 3, w - 8, 3, shade(b.wall, -0.2));
    // roof: stepped gable with shingles
    for (let r = 0; r < roofH; r++) {
      const inset = Math.max(0, Math.round((roofH - r) * 0.35) - 2);
      px(inset, r, w - inset * 2, 1, r % 4 === 3 ? shade(b.roof, -0.12) : b.roof);
    }
    px(0, roofH - 2, w, 2, shade(b.roof, -0.25));
    // windows
    const win = (x) => { px(x, roofH + 6, 10, 9, "#3b4a63"); px(x + 1, roofH + 7, 8, 7, "#9fd3ff"); px(x + 4, roofH + 7, 1, 7, "#3b4a63"); px(x + 1, roofH + 10, 8, 1, "#3b4a63"); };
    win(10); win(w - 20);
    // door
    const dx = (Math.floor(b.w / 2) - (b.w >= 10 ? 1 : 0)) * T, dw = b.w >= 10 ? 2 * T : T;
    px(dx + 2, h - 18, dw - 4, 18, "#5a3a22"); px(dx + 3, h - 17, dw - 6, 16, "#7a4f2e");
    px(dx + dw - 6, h - 9, 2, 2, "#ffd34d");
    // chimney
    if (id !== "town_hall") px(w - 22, -6, 8, 14, "#7d5a4a");
    houseEmblem(g, id, w, roofH, oy, h);
    return c;
  }

  function houseEmblem(g, id, w, roofH, oy, h) {
    const px = (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y + oy, ww, hh); };
    const cx = w / 2;
    const sign = (col) => { px(cx - 9, roofH - 14, 18, 11, "#3a2a1a"); px(cx - 8, roofH - 13, 16, 9, col); };
    switch (id) {
      case "town_hall":
        px(cx - 10, -26, 20, 30, "#e8d9b5"); px(cx - 12, -30, 24, 5, "#7b2d26");
        g.fillStyle = "#fff"; g.beginPath(); g.arc(cx, -14 + oy, 6, 0, 7); g.fill();
        px(cx, -18, 1, 4, "#222"); px(cx, -14, 4, 1, "#222");
        px(cx - 1, -44, 2, 16, "#444"); // flagpole (flag animated)
        break;
      case "inbox": sign("#fff"); px(cx - 7, roofH - 12, 14, 7, "#f4f4f4"); g.strokeStyle = "#c0504d"; g.beginPath(); g.moveTo(cx - 7, roofH - 12 + oy); g.lineTo(cx, roofH - 8 + oy); g.lineTo(cx + 7, roofH - 12 + oy); g.stroke(); break;
      case "studio": sign("#c0392b"); px(cx - 2, roofH - 11, 5, 5, "#fff"); break; // ring light drawn live
      case "bank":
        sign("#e8d07a"); g.fillStyle = "#2e6b3a"; g.font = "bold 9px monospace"; g.fillText("$", cx - 3, roofH - 5 + oy);
        for (let i = 0; i < 4; i++) px(14 + i * ((w - 34) / 3), roofH + 2, 4, h - roofH - 6, "#fffaf0");
        break;
      case "library": sign("#f0e6d2"); ["#c0504d", "#3a7d44", "#5b5ea6", "#e07b39"].forEach((col, i) => px(cx - 6 + i * 3, roofH - 12, 2, 7, col)); break;
      case "travel": sign("#bfe7ff"); g.fillStyle = "#1f7a7a"; g.beginPath(); g.arc(cx, roofH - 8.5 + oy, 4, 0, 7); g.fill(); px(cx - 4, roofH - 9, 8, 1, "#bfe7ff"); break;
      case "workshop": sign("#ddd"); g.fillStyle = "#55606b"; g.beginPath(); g.arc(cx, roofH - 8.5 + oy, 4, 0, 7); g.fill(); px(cx - 1, roofH - 10, 2, 2, "#ddd"); break;
      case "archive": sign("#f5ecd0"); px(cx - 6, roofH - 11, 12, 6, "#d8c9a0"); px(cx - 6, roofH - 11, 12, 1, "#8e6c8a"); break;
      case "recruiting": px(cx - 16, roofH - 14, 32, 11, "#3a2a1a"); px(cx - 15, roofH - 13, 30, 9, "#f5d300"); g.fillStyle = "#222"; g.font = "bold 7px monospace"; g.fillText("HIRING", cx - 12, roofH - 6 + oy); break;
      case "home": g.fillStyle = "#e05a6a"; g.beginPath(); g.arc(cx - 2.5, roofH - 10 + oy, 3, 0, 7); g.arc(cx + 2.5, roofH - 10 + oy, 3, 0, 7); g.fill(); g.beginPath(); g.moveTo(cx - 5.5, roofH - 9 + oy); g.lineTo(cx, roofH - 3 + oy); g.lineTo(cx + 5.5, roofH - 9 + oy); g.fill(); break;
    }
  }

  function drawTree() {
    const [c, g] = canvas(T + 8, T * 2);
    g.fillStyle = "#5a3a22"; g.fillRect(9, 20, 6, 12);
    const blob = (x, y, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
    blob(12, 12, 10, "#2f6b2f"); blob(8, 10, 6, "#3d8a3d"); blob(15, 8, 5, "#4aa04a");
    return c;
  }

  function drawGround() {
    const [c, g] = canvas(W * T, H * T);
    const r = mulberry32(7);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = at(x, y), X = x * T, Y = y * T;
      if (v === 2 || v === 6) {
        g.fillStyle = (x + y) % 2 ? "#cfc2a6" : "#c6b897"; g.fillRect(X, Y, T, T);
        g.fillStyle = "#b3a585"; g.fillRect(X, Y + T - 1, T, 1); g.fillRect(X + T - 1, Y, 1, T);
      } else if (v === 1 || v === 4) {
        g.fillStyle = "#d8c08a"; g.fillRect(X, Y, T, T);
        for (let i = 0; i < 4; i++) { g.fillStyle = "#c4aa72"; g.fillRect(X + ((r() * 14) | 0), Y + ((r() * 14) | 0), 2, 2); }
      } else {
        g.fillStyle = (x * 7 + y * 3) % 5 ? "#5fa04e" : "#5a9a49"; g.fillRect(X, Y, T, T);
        for (let i = 0; i < 3; i++) { g.fillStyle = "#4e8c3f"; g.fillRect(X + ((r() * 15) | 0), Y + ((r() * 14) | 0), 1, 2); }
        if (v === 7) for (let i = 0; i < 3; i++) {
          g.fillStyle = ["#ffd34d", "#ff8fa3", "#ffffff"][i]; g.fillRect(X + 3 + i * 4, Y + 5 + ((i * 5) % 7), 2, 2);
        }
      }
    }
    // fountain basin
    g.fillStyle = "#8d8d96"; g.beginPath(); g.arc(FOUNTAIN.x, FOUNTAIN.y, FOUNTAIN.r + 2, 0, 7); g.fill();
    g.fillStyle = "#3f7fbf"; g.beginPath(); g.arc(FOUNTAIN.x, FOUNTAIN.y, FOUNTAIN.r - 2, 0, 7); g.fill();
    g.fillStyle = "#a5a5ae"; g.fillRect(FOUNTAIN.x - 3, FOUNTAIN.y - 8, 6, 10);
    return c;
  }

  // ------------------------------------------------------------------ entities
  const world = { houses: {}, tree: null, ground: null };
  const people = [];          // NPCs (agents)
  let roster = { agents: [], houses: [], review: [], brain: "…", guardrails: [] };
  const player = { id: "player", name: "You", x: doorPx("home").x, y: 0, dir: 0, frame: 0, anim: 0, pal: PLAYER_PALETTE, scene: "town" };
  let scene = "town";        // "town" or a house id (interior)
  let showNav = false;
  let chatWith = null;
  let meeting = null;        // { agenda, job, done }
  const smoke = [], birds = [];
  let lastM = 0;

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
    const home = a.role === "chief_of_staff" ? doorPx("home") : yardPx(a.house, people.length);
    return {
      ...a, x: home.x, y: home.y, dir: 0, frame: 0, anim: 0, path: [], idle: 2 + rand() * 4,
      inside: a.role === "director" && rand() < 0.5, mode: "home", bubble: null, syncCooldown: {}, repath: 0,
      pal: a.palette,
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

  // Where a person is drawn in the current scene (interiors have their own coordinates).
  function posOf(p) {
    if (scene === "town") return p;
    if (p.role === "chief_of_staff") return { x: p.rx, y: p.ry };
    if (p.inHall) { const s = seatPositions()[people.filter((q) => q.inHall).indexOf(p) % 8]; return s; }
    return { x: 110, y: 50 };
  }
  function nearest() {
    let best = null, bd = scene === "town" ? 26 : 30;
    for (const p of people) {
      if (!visible(p)) continue;
      const d = dist(posOf(p), player);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  function visible(p) {
    if (scene === "town") return !p.inside && !p.inHall;
    if (scene === "town_hall" && (p.inHall || p.role === "chief_of_staff")) return true;
    if (p.role === "chief_of_staff") return true; // follows you inside
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
    if (scene === "town") {
      const tx = Math.floor(player.x / T), ty = Math.floor((player.y - 4) / T);
      if (at(tx, ty) === 4 && dy < 0) {
        const id = Object.keys(doors).find((k) => doors[k].y === ty && (doors[k].x === tx || (LAYOUT[k].w >= 10 && doors[k].x - 1 === tx)));
        if (id) enter(id);
      }
    } else if (player.y > WALL_H + (ROOM_H - WALL_H) + 2) leave();
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
  function roomBlocked(x, y) {
    if (x < 8 || x > ROOM_W - 8 || y < WALL_H + 4) return true;
    if (y > ROOM_H - 2 && Math.abs(x - ROOM_W / 2) > 12) return true;
    for (const r of roomFurniture(scene)) if (x > r.x - 4 && x < r.x + r.w + 4 && y > r.y && y < r.y + r.h + 3) return true;
    return false;
  }
  function roomFurniture(id) {
    if (id === "town_hall") return [{ x: 60, y: 58, w: 100, h: 16 }];
    return [{ x: 90, y: 50, w: 40, h: 12 }];
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
    for (let i = 0; i < 4; i++) seats.push({ x: 70 + i * 26, y: 56, dir: 0 }); // north side (faces down)
    for (let i = 0; i < 4; i++) seats.push({ x: 70 + i * 26, y: 86, dir: 3 }); // south side
    return seats;
  }

  // ------------------------------------------------------------------ AI behaviours
  function updatePeople(dt, now) {
    const hour = new Date().getHours();
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
              : { x: (PLAZA.x + 1 + rand() * (PLAZA.w - 2)) * T, y: (PLAZA.y + 1 + rand() * (PLAZA.h - 2)) * T };
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
      if (d > 20) { p.rx += ((tx - p.rx) / d) * NPC * 1.4 * dt; p.ry += ((ty - p.ry) / d) * NPC * 1.4 * dt; animate(p, dt); p.dir = Math.abs(tx - p.rx) > Math.abs(ty - p.ry) ? (tx < p.rx ? 1 : 2) : ty < p.ry ? 3 : 0; }
      else { p.frame = 0; p.dir = 0; }
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
    if (scene !== "town") { toast(`${p.name} will meet you outside.`); }
    if (p.inside || p.inHall) { const d = doorPx(p.house); p.x = d.x; p.y = d.y; p.inside = false; p.inHall = false; }
    p.mode = "summoned"; p.summonedUntil = performance.now() + 60000; p.hurry = true;
    p.path = pathTo(p, player).slice(0, -1);
    p.bubble = { text: "On my way!", until: performance.now() + 3000 };
    return true;
  }

  // ------------------------------------------------------------------ rendering
  const cv = $("world"), ctx = cv.getContext("2d");
  let scale = 3;
  function resize() {
    cv.width = innerWidth; cv.height = innerHeight;
    ctx.imageSmoothingEnabled = false;
  }
  addEventListener("resize", resize);

  function drawSprite(p, x, y, opts = {}) {
    const s = charSprite(p.pal, opts.dir ?? p.dir, opts.sitting ? 0 : p.frame, {
      vest: p.role === "worker", phone: p.role === "chief_of_staff", badge: p.id === "player", sitting: !!opts.sitting,
    });
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath(); ctx.ellipse(x, y, 5, 2, 0, 0, 7); ctx.fill();
    ctx.drawImage(s, Math.round(x - CHAR_W / 2), Math.round(y - CHAR_H));
  }
  function label(text, x, y, color = "#fff") {
    ctx.font = scene === "town" ? "6px monospace" : "4px monospace";
    const w = ctx.measureText(text).width + 4;
    ctx.fillStyle = "rgba(20,18,28,.7)"; ctx.fillRect(Math.round(x - w / 2), Math.round(y - 7), w, 8);
    ctx.fillStyle = color; ctx.fillText(text, Math.round(x - w / 2 + 2), Math.round(y - 1));
  }
  function bubble(text, x, y) {
    ctx.font = "6px monospace";
    const w = Math.min(120, ctx.measureText(text).width + 6);
    ctx.fillStyle = "#fff"; ctx.fillRect(Math.round(x - w / 2), Math.round(y - 12), w, 10);
    ctx.fillRect(Math.round(x - 1), Math.round(y - 2), 2, 2);
    ctx.fillStyle = "#222"; ctx.fillText(text.slice(0, 30), Math.round(x - w / 2 + 3), Math.round(y - 4));
  }

  function renderTown(now) {
    scale = Math.max(2, Math.round(Math.min(innerWidth / (26 * T), innerHeight / (16 * T))));
    const vw = cv.width / scale, vh = cv.height / scale;
    const camX = clamp(player.x - vw / 2, 0, Math.max(0, W * T - vw));
    const camY = clamp(player.y - vh / 2, -40, Math.max(0, H * T - vh));
    ctx.setTransform(scale, 0, 0, scale, -Math.round(camX * scale), -Math.round(camY * scale));
    ctx.fillStyle = "#3d6b33"; ctx.fillRect(camX, camY, vw, vh);
    ctx.drawImage(world.ground, 0, 0);

    // fountain water
    const t = now / 1000;
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(200,235,255,${0.5 - i * 0.12})`;
      ctx.beginPath(); ctx.arc(FOUNTAIN.x, FOUNTAIN.y, ((t * 10 + i * 9) % 26) + 4, 0, 7); ctx.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const a = (t * 2 + i) % 1;
      ctx.fillStyle = "#cfefff";
      ctx.fillRect(FOUNTAIN.x - 1 + Math.sin(i * 2) * a * 8, FOUNTAIN.y - 10 - Math.sin(a * Math.PI) * 10, 2, 2);
    }

    // y-sorted drawables: houses, trees, people
    const items = [];
    for (const id of Object.keys(LAYOUT)) { const b = LAYOUT[id]; items.push({ y: (b.y + b.h) * T, draw: () => drawHouseLive(id, b, now) }); }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) === 5) {
      const X = x * T, Y = y * T;
      if (X > camX - 32 && X < camX + vw + 16 && Y > camY - 32 && Y < camY + vh + 32) items.push({ y: Y + T, draw: () => ctx.drawImage(world.tree, X - 4, Y - T) });
    }
    for (const p of people) if (visible(p)) items.push({ y: p.y, draw: () => drawSprite(p, p.x, p.y) });
    items.push({ y: player.y, draw: () => drawSprite(player, player.x, player.y) });
    items.sort((a, b) => a.y - b.y).forEach((i) => i.draw());

    // smoke, birds
    for (const s of smoke) { ctx.fillStyle = `rgba(230,230,230,${s.life})`; ctx.beginPath(); ctx.arc(s.x, s.y, 2 + (1 - s.life) * 4, 0, 7); ctx.fill(); }
    ctx.fillStyle = "#2a2a2a";
    for (const b of birds) for (let k = 0; k < 3; k++) {
      const flap = Math.sin(t * 10 + k) > 0 ? -1 : 1;
      const bx = b.x - k * 10, by = b.y + (k % 2) * 6;
      ctx.fillRect(bx - 3, by + flap, 3, 1); ctx.fillRect(bx, by, 1, 1); ctx.fillRect(bx + 1, by + flap, 3, 1);
    }

    if (showNav) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        ctx.fillStyle = solid(at(x, y)) ? "rgba(220,40,40,.35)" : "rgba(40,220,90,.25)";
        ctx.fillRect(x * T, y * T, T, T);
      }
    }
    for (const p of people) if (visible(p)) {
      label(p.name, p.x, p.y - CHAR_H - 1, p.role === "worker" ? "#f5d300" : "#fff");
      if (p.bubble) bubble(p.bubble.text, p.x, p.y - CHAR_H - 9);
    }
    for (const [id, b] of Object.entries(LAYOUT)) {
      const h = roster.houses.find((x) => x.id === id);
      if (h) label(h.label, (b.x + b.w / 2) * T, b.y * T - 2, "#ffe9a8");
    }
  }

  function drawHouseLive(id, b, now) {
    const X = b.x * T, Y = b.y * T - 2 * T;
    ctx.drawImage(world.houses[id], X, Y);
    const t = now / 1000, w = b.w * T, roofH = Math.round(b.h * T * 0.5);
    if (id === "town_hall") { // waving flag
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = i < 6 ? "#c0392b" : "#f5d300";
        ctx.fillRect(X + w / 2 + 1 + i, Y + 2 * T - 44 + Math.sin(t * 6 + i * 0.6) * 1.5, 1, 7);
      }
    }
    if (id === "studio") { // ring light on the roof
      const glow = 0.6 + Math.sin(t * 3) * 0.25;
      ctx.strokeStyle = `rgba(255,250,220,${glow})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X + w / 2, Y + 2 * T - 6, 7, 0, 7); ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = `rgba(255,250,200,${glow * 0.25})`; ctx.beginPath(); ctx.arc(X + w / 2, Y + 2 * T - 6, 13, 0, 7); ctx.fill();
      ctx.fillStyle = "#333"; ctx.fillRect(X + w / 2 - 1, Y + 2 * T + 1, 2, roofH - 16);
    }
    // windows glow at night
    const hour = new Date().getHours();
    if (hour >= 19 || hour < 6) { ctx.fillStyle = "rgba(255,210,100,.35)"; ctx.fillRect(X + 11, Y + 2 * T + roofH + 7, 8, 7); ctx.fillRect(X + w - 19, Y + 2 * T + roofH + 7, 8, 7); }
  }

  function renderRoom(now) {
    const id = scene;
    scale = Math.max(2, Math.floor(Math.min(innerWidth / (ROOM_W + 20), (innerHeight - 70) / (ROOM_H + 20))));
    const ox = Math.round((cv.width / scale - ROOM_W) / 2), oy = Math.round((cv.height / scale - ROOM_H) / 2 + 20 / scale);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#120f18"; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(scale, 0, 0, scale, ox * scale, oy * scale);
    const b = LAYOUT[id], t = now / 1000;
    // wall + floor ("$100k office")
    ctx.fillStyle = shade(b.wall, -0.05); ctx.fillRect(0, 0, ROOM_W, WALL_H);
    ctx.fillStyle = shade(b.roof, -0.1); ctx.fillRect(0, WALL_H - 4, ROOM_W, 4);
    for (let x = 0; x < ROOM_W; x += 12) for (let y = WALL_H; y < ROOM_H; y += 6) {
      ctx.fillStyle = ((x / 12 + y / 6) | 0) % 2 ? "#8a5a36" : "#94643d"; ctx.fillRect(x, y, Math.min(12, ROOM_W - x), 6);
    }
    ctx.fillStyle = "#120f18"; ctx.fillRect(ROOM_W / 2 - 12, ROOM_H - 2, 24, 4);
    // windows with sky
    for (const wx of [20, ROOM_W - 44]) { ctx.fillStyle = "#3b4a63"; ctx.fillRect(wx, 6, 24, 18); ctx.fillStyle = "#9fd3ff"; ctx.fillRect(wx + 2, 8, 20, 14); }
    // fireplace with flicker
    ctx.fillStyle = "#6b4a3a"; ctx.fillRect(ROOM_W / 2 - 14, 8, 28, 26); ctx.fillStyle = "#1a1010"; ctx.fillRect(ROOM_W / 2 - 9, 18, 18, 16);
    for (let i = 0; i < 5; i++) {
      const f = Math.sin(t * 12 + i * 1.7) * 2;
      ctx.fillStyle = i % 2 ? "#ffb347" : "#ff6b35"; ctx.fillRect(ROOM_W / 2 - 7 + i * 3, 26 - 4 - f, 3, 8 + f);
    }
    // rug + plants + bookshelf
    ctx.fillStyle = shade(b.roof, 0.05); ctx.fillRect(ROOM_W / 2 - 40, 68, 80, 24);
    ctx.fillStyle = "#3a7d44"; ctx.fillRect(10, 40, 8, 10); ctx.fillStyle = "#6b4a3a"; ctx.fillRect(11, 50, 6, 5);
    ctx.fillStyle = "#3a7d44"; ctx.fillRect(ROOM_W - 18, 40, 8, 10); ctx.fillStyle = "#6b4a3a"; ctx.fillRect(ROOM_W - 17, 50, 6, 5);
    ctx.fillStyle = "#5a3a22"; ctx.fillRect(56, 6, 28, 28);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) { ctx.fillStyle = ["#c0504d", "#3a7d44", "#5b5ea6", "#e07b39"][(r + k) % 4]; ctx.fillRect(58 + k * 4, 8 + r * 9, 3, 7); }
    themedProp(id, t);

    const items = [];
    if (id === "town_hall") {
      items.push({ y: 74, draw: () => { ctx.fillStyle = "#5a3a22"; ctx.fillRect(60, 58, 100, 16); ctx.fillStyle = "#7a4f2e"; ctx.fillRect(61, 59, 98, 13); } });
      const seats = seatPositions();
      people.filter((p) => p.inHall).forEach((p, i) => {
        const s = seats[i % seats.length];
        items.push({ y: s.y, draw: () => { drawSprite(p, s.x, s.y, { sitting: true, dir: s.dir }); label(p.name, s.x, s.y - CHAR_H + 2); } });
      });
    } else {
      items.push({ y: 62, draw: () => { ctx.fillStyle = "#4a2f1c"; ctx.fillRect(90, 50, 40, 12); ctx.fillStyle = "#222"; ctx.fillRect(104, 44, 12, 7); ctx.fillStyle = "#7fd1ff"; ctx.fillRect(105, 45, 10, 5); } });
      for (const p of people) if (p.role === "director" && p.house === id && p.inside) {
        items.push({ y: 50, draw: () => { drawSprite(p, 110, 50, { sitting: true, dir: 0 }); label(`${p.name} · ${p.title}`, 110, 30); if (p.bubble) bubble(p.bubble.text, 110, 24); } });
      }
    }
    const c = chief();
    if (c && c.rx !== undefined) items.push({ y: c.ry, draw: () => { drawSprite(c, c.rx, c.ry); label(c.name, c.rx, c.ry - CHAR_H - 1); } });
    items.push({ y: player.y, draw: () => drawSprite(player, player.x, player.y) });
    items.sort((a, b) => a.y - b.y).forEach((i) => i.draw());
  }

  function themedProp(id, t) {
    const x = ROOM_W - 70, y = 40;
    switch (id) {
      case "studio": ctx.strokeStyle = `rgba(255,250,220,${0.7 + Math.sin(t * 3) * 0.2})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y - 6, 6, 0, 7); ctx.stroke(); ctx.lineWidth = 1; ctx.fillStyle = "#333"; ctx.fillRect(x - 1, y, 2, 14); break;
      case "bank": ctx.fillStyle = "#555"; ctx.fillRect(x - 8, y, 16, 16); ctx.fillStyle = "#999"; ctx.beginPath(); ctx.arc(x, y + 8, 4, 0, 7); ctx.fill(); break;
      case "travel": ctx.fillStyle = "#1f7a7a"; ctx.beginPath(); ctx.arc(x, y + 4, 7, 0, 7); ctx.fill(); ctx.fillStyle = "#6fcf7f"; ctx.fillRect(x - 3, y, 4, 4); ctx.fillStyle = "#5a3a22"; ctx.fillRect(x - 1, y + 11, 2, 6); break;
      case "inbox": ctx.fillStyle = "#bbb"; ctx.fillRect(x - 8, y, 16, 16); ctx.fillStyle = "#fff"; for (let i = 0; i < 3; i++) ctx.fillRect(x - 6, y + 2 + i * 5, 12, 3); break;
      case "workshop": ctx.fillStyle = "#333"; ctx.fillRect(x - 10, y, 20, 12); ctx.fillStyle = "#6fcf7f"; for (let i = 0; i < 3; i++) ctx.fillRect(x - 8, y + 2 + i * 3, ((t * 8 + i * 5) % 14) | 0, 1); break;
      case "library": case "archive": ctx.fillStyle = "#8e6c8a"; ctx.fillRect(x - 8, y, 16, 18); ctx.fillStyle = "#d8c9a0"; for (let i = 0; i < 3; i++) ctx.fillRect(x - 6, y + 2 + i * 6, 12, 4); break;
      case "recruiting": ctx.fillStyle = "#f5d300"; ctx.fillRect(x - 10, y, 20, 10); ctx.fillStyle = "#222"; ctx.font = "5px monospace"; ctx.fillText("INTERVIEWS", x - 13, y + 7); break;
    }
  }

  function updateFx(dt, now) {
    if (rand() < dt * 4) for (const [id, b] of Object.entries(LAYOUT)) if (id !== "town_hall" && rand() < 0.4)
      smoke.push({ x: b.x * T + b.w * T - 18 + rand() * 2, y: b.y * T - 8, life: 0.6 });
    for (const s of smoke) { s.y -= dt * 10; s.x += dt * 4; s.life -= dt * 0.25; }
    while (smoke.length && smoke[0].life <= 0) smoke.shift();
    if (birds.length < 1 && rand() < dt * 0.08) birds.push({ x: -20, y: 20 + rand() * (H * T - 80), v: 40 + rand() * 20 });
    for (const b of birds) b.x += b.v * dt;
    for (let i = birds.length - 1; i >= 0; i--) if (birds[i].x > W * T + 40) birds.splice(i, 1);
  }

  function updateHint() {
    let text = "←↑↓→ walk · Shift run · T talk · MM Chief of Staff · G nav mesh · ? help";
    const n = nearest();
    if (n) text = `Press T to talk to ${n.name} (${n.title})`;
    else if (scene !== "town") text = "Walk out the bottom door to leave";
    $("hint").textContent = text;
  }

  // ------------------------------------------------------------------ main loop
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    movePlayer(dt);
    updatePeople(dt, now);
    updateFx(dt, now);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (scene === "town") renderTown(now); else renderRoom(now);
    updateHint();
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------ UI: chat
  function closeAll() { for (const id of ["chat", "review", "hire", "help"]) $(id).classList.add("hidden"); chatWith = null; }
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => { $(b.dataset.close).classList.add("hidden"); if (b.dataset.close === "chat") chatWith = null; }));
  const logs = {};
  function openChat(p) {
    if (!p) return;
    chatWith = p;
    $("chat-name").textContent = p.name;
    $("chat-title").textContent = `${p.title} · ${p.model}`;
    const pc = $("portrait").getContext("2d"); pc.imageSmoothingEnabled = false; pc.clearRect(0, 0, 24, 24);
    pc.drawImage(charSprite(p.pal, 0, 0, { vest: p.role === "worker", phone: p.role === "chief_of_staff" }), 0, 0, CHAR_W, 12, 0, 0, 24, 24);
    renderLog();
    $("chat").classList.remove("hidden");
    setTimeout(() => $("chat-input").focus(), 0);
  }
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
    c.bubble = { text: "On it — routing…", until: performance.now() + 4000 };
    toast(`${c.name} took the to-do: “${text.slice(0, 60)}”`);
    try {
      const { job } = await api("/api/task", { text });
      const res = await waitJob(job);
      const d = people.find((p) => p.id === res.routed_to);
      if (d) d.bubble = { text: "Done! In your review queue", until: performance.now() + 6000 };
      toast(`${d ? d.name : "Your team"} delivered “${res.deliverable.title}” — open Review to approve.`);
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
  function renderReview() {
    const list = $("review-list"); list.innerHTML = "";
    const items = [...roster.review].reverse();
    if (!items.length) list.innerHTML = '<p class="muted">No deliverables yet. Give your Chief of Staff a to-do.</p>';
    for (const it of items) {
      const who = roster.agents.find((a) => a.id === it.agent);
      const el = document.createElement("div"); el.className = "item";
      el.innerHTML = `<div><span class="status ${it.status}">${it.status.replace("_", " ")}</span> <b></b></div>
        <div class="muted"></div>
        <div><a target="_blank" href="/files/${encodeURI(it.pdf)}">PDF</a><a target="_blank" href="/files/${encodeURI(it.md)}">Markdown</a></div>`;
      el.querySelector("b").textContent = it.title;
      el.querySelector(".muted").textContent = `${who ? who.name : it.agent} · ${it.created} · “${it.task.slice(0, 80)}”`;
      if (it.status === "pending_review") {
        const row = document.createElement("div"); row.className = "row";
        for (const [d, cls, txt] of [["approved", "good", "Approve"], ["rejected", "bad", "Reject"]]) {
          const b = document.createElement("button"); b.className = cls; b.textContent = txt;
          b.onclick = async () => { await api("/api/review", { id: it.id, decision: d }); await refresh(); renderReview(); };
          row.appendChild(b);
        }
        el.appendChild(row);
      }
      list.appendChild(el);
    }
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
        if (!confirm(`Hire ${c.name} as an intern for ${$("hire-director").selectedOptions[0].textContent}?`)) return;
        try {
          await api("/api/hire", { director, name: c.name, approved_by_human: true });
          toast(`${c.name} hired — they're walking over from the Recruiting Office in a yellow vest.`);
          await refresh(); $("hire").classList.add("hidden");
        } catch (err) { toast(err.message, true); }
      };
      const no = document.createElement("button"); no.textContent = "Pass"; no.onclick = () => el.remove();
      el.querySelector(".row").append(yes, no);
      box.appendChild(el);
    }
  });
  $("help-btn").addEventListener("click", () => $("help").classList.toggle("hidden"));

  // ------------------------------------------------------------------ boot
  async function refresh() {
    roster = await api("/api/state");
    $("brain").textContent = roster.brain === "claude" ? "Claude CLI" : "offline";
    $("brain").className = "badge " + roster.brain;
    $("brain").title = roster.brain === "claude" ? "Agents think via your local `claude` CLI (subscription, no API key)" : "No `claude` CLI found — placeholder replies";
    $("review-count").textContent = roster.review.filter((r) => r.status === "pending_review").length;
    $("guardrails").innerHTML = "";
    for (const g of roster.guardrails) { const li = document.createElement("li"); li.textContent = g; $("guardrails").appendChild(li); }
    syncPeople();
  }

  buildMap();
  world.ground = drawGround();
  world.tree = drawTree();
  for (const id of Object.keys(LAYOUT)) world.houses[id] = drawHouse(id);
  player.x = FOUNTAIN.x; player.y = (PLAZA.y + PLAZA.h - 3) * T; player.dir = 3;
  resize();
  refresh().then(() => {
    const c = chief(); if (c) { c.x = player.x + 16; c.y = player.y; }
    let seen = false;
    try { seen = !!sessionStorage.getItem("seenHelp"); sessionStorage.setItem("seenHelp", "1"); } catch {}
    if (!seen) $("help").classList.remove("hidden");
  }).catch((err) => toast(`Could not reach the village server: ${err.message}`, true));
  requestAnimationFrame(frame);
  window.__village = { player, people, enter, leave, callDirector, get scene() { return scene; }, at, doors };
})();
