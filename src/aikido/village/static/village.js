/* Agent Village — a top-down 16-bit town where your AI agents live and work.
 *
 * Everything is drawn in code on a <canvas>: no image assets, no credits.
 * The world renders at its true pixel size into a small offscreen canvas and
 * is blown up by a whole number of *device* pixels, so every art pixel is a
 * crisp square on any screen; text (name tags, bubbles) is drawn afterwards
 * at full screen resolution.
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
  const SPR_W = 18, SPR_H = 26; // character sprite incl. 1px outline margin
  const CHAR_H = 24;
  const ROOM_W = 240, ROOM_H = CHAR_H * 5, WALL_H = 42; // characters are 1/5 of room height
  const UI_FONT = '"Pixelify Sans", "Silkscreen", ui-monospace, monospace';

  const PAL = {
    out: "#1d1420",
    g0: "#3d7a3a", g1: "#4b8c41", g2: "#5a9e48", g3: "#79b85a", gDeep: "#2f6131",
    p0: "#c9a46a", p1: "#b48d57", p2: "#dcbc85", pEdge: "#8a6a40",
    s0: "#bdb5a5", s1: "#b0a898", s2: "#c6bfaf", mortar: "#958e7f", curb: "#7d7668",
    w0: "#3a7bd5", w1: "#5b9ee8", w2: "#b3dcff",
    wd0: "#7a4a2a", wd1: "#5a3420", wd2: "#9c6639",
    glass: "#8fc7e8", glassHi: "#d9f1ff",
  };

  // Footprints (tile top-left, size). Doors are on the south wall.
  const LAYOUT = {
    town_hall: { x: 27, y: 3, w: 10, h: 7, roof: "#9b3a32", wall: "#e3d5b8", mat: "stone" },
    inbox:     { x: 12, y: 4, w: 8, h: 6, roof: "#c0504d", wall: "#f0e2c4", mat: "plank", sign: "mail" },
    studio:    { x: 44, y: 4, w: 8, h: 6, roof: "#3b3946", wall: "#d9d2e6", mat: "stucco", sign: "play" },
    bank:      { x: 3, y: 14, w: 8, h: 6, roof: "#2f6f45", wall: "#ece6d6", mat: "stone", sign: "coin" },
    library:   { x: 3, y: 24, w: 8, h: 6, roof: "#4a4590", wall: "#c9805e", mat: "brick", sign: "book" },
    travel:    { x: 53, y: 14, w: 8, h: 6, roof: "#23807d", wall: "#f1e5cd", mat: "plank", sign: "globe" },
    workshop:  { x: 53, y: 24, w: 8, h: 6, roof: "#6b7682", wall: "#cfc8bb", mat: "metal", sign: "gear" },
    archive:   { x: 8, y: 34, w: 8, h: 6, roof: "#74507e", wall: "#e8d9cc", mat: "stucco", sign: "scroll" },
    home:      { x: 28, y: 35, w: 8, h: 6, roof: "#b5562e", wall: "#f5e4c3", mat: "plank", sign: "heart" },
    recruiting:{ x: 48, y: 34, w: 8, h: 6, roof: "#d08a2c", wall: "#efe3cc", mat: "plank", sign: "hiring" },
  };
  const PLAZA = { x: 22, y: 13, w: 21, h: 16 };
  const FOUNTAIN = { x: 32.5 * T, y: 21 * T, r: 2.2 * T };

  const PLAYER_LOOK = { shirt: "#7a4fd0", pants: "#2c2a44", hair: "#3b2416", skin: "#d9a066", style: "short", hoodie: true };
  const STYLES = {
    chief_of_staff: { style: "short", tie: true, phone: true },
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
  const solid = (v) => v === 3 || v === 5 || v === 6 || v === 8 || v === 9;
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
    under.set(grid);
    // Plaza furniture: lamps at the corners, benches facing the fountain.
    const lamp = (x, y) => { set(x, y, 8); props.push({ kind: "lamp", x: x * T + 8, y: y * T + 14 }); };
    lamp(PLAZA.x + 1, PLAZA.y + 1); lamp(PLAZA.x + PLAZA.w - 2, PLAZA.y + 1);
    lamp(PLAZA.x + 1, PLAZA.y + PLAZA.h - 2); lamp(PLAZA.x + PLAZA.w - 2, PLAZA.y + PLAZA.h - 2);
    for (const bx of [27, 36]) { set(bx, 25, 8); set(bx + 1, 25, 8); props.push({ kind: "bench", x: bx * T + 16, y: 25 * T + 13 }); }
    const ib = doors.inbox; set(ib.x + 2, ib.y + 1, 8); props.push({ kind: "mailbox", x: (ib.x + 2) * T + 8, y: (ib.y + 1) * T + 14 });
    set(31, 30, 8); props.push({ kind: "signpost", x: 31 * T + 8, y: 30 * T + 14 });
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

  // ------------------------------------------------------------------ characters
  const spriteCache = new Map();
  /**
   * 16x24 chibi character (+1px outline margin). dir: 0 down, 1 left, 2 right, 3 up.
   * frame: 0 stand, 1 stride A, 2 stride B. Left is the right-facing sprite mirrored.
   */
  function charSprite(look, dir, frame, sitting = false) {
    const key = JSON.stringify([look, dir, frame, sitting]);
    if (spriteCache.has(key)) return spriteCache.get(key);
    if (dir === 1) {
      const src = charSprite(look, 2, frame, sitting);
      const [c, g] = canvas(SPR_W, SPR_H);
      g.translate(SPR_W, 0); g.scale(-1, 1); g.drawImage(src, 0, 0);
      spriteCache.set(key, c);
      return c;
    }
    const [c, g] = canvas(SPR_W, SPR_H);
    const P = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(1 + x, 1 + y, w, h); };
    const skin = look.skin, skinD = shade(skin, -0.13), hair = look.hair, hairD = shade(hair, -0.12), hairL = shade(hair, 0.12);
    const shirt = look.shirt, shirtD = shade(shirt, -0.14), shirtL = shade(shirt, 0.1);
    const pants = look.pants, pantsD = shade(pants, -0.1), shoe = "#3b2a22", shoeL = "#5a4234", eye = PAL.out;
    const side = dir === 2, up = dir === 3;
    const u = !sitting && frame ? -1 : 0; // body bob on stride frames
    const style = look.style || "short";

    // legs + shoes
    if (sitting) {
      if (!up) { P(4, 18, 8, 2, pants); P(4, 18, 8, 1, shade(pants, 0.06)); P(4, 20, 3, 1, shoe); P(9, 20, 3, 1, shoe); }
    } else if (!side) {
      const lUp = frame === 1 ? 1 : 0, rUp = frame === 2 ? 1 : 0;
      P(4, 18, 4, 4 - lUp, pants); P(7, 18, 1, 4 - lUp, pantsD);
      P(8, 18, 4, 4 - rUp, pants); P(11, 18, 1, 4 - rUp, pantsD);
      P(4, 22 - lUp, 4, 2, shoe); P(8, 22 - rUp, 4, 2, shoe);
      if (!up) { P(4, 22 - lUp, 4, 1, shoeL); P(8, 22 - rUp, 4, 1, shoeL); }
    } else if (frame === 0) {
      P(6, 18, 4, 4, pants); P(6, 18, 1, 4, pantsD); P(6, 22, 5, 2, shoe); P(6, 22, 5, 1, shoeL);
    } else {
      const f = frame === 1 ? 1 : -1;
      P(6 - 2 * f, 18, 3, 4, pantsD); P(6 - 2 * f, 22, 4, 2, shade(shoe, -0.05));
      P(7 + 2 * f, 18, 3, 4, pants); P(7 + 2 * f, 22, 4, 2, shoe); P(7 + 2 * f, 22, 4, 1, shoeL);
    }

    // torso
    if (!side) {
      P(4, 11 + u, 8, 7, shirt); P(4, 11 + u, 1, 7, shirtL); P(10, 11 + u, 2, 7, shirtD);
      P(4, 17 + u, 8, 1, pantsD);
      if (!up) { P(6, 11 + u, 4, 1, skinD); P(5, 12 + u, 1, 1, shirtL); P(10, 12 + u, 1, 1, shirtL); }
      if (look.vest) {
        P(4, 12 + u, 8, 5, "#f2c230"); P(10, 12 + u, 2, 5, "#d4a21c"); P(4, 15 + u, 8, 1, "#f4f4ee");
        if (!up) P(6, 12 + u, 4, 2, shirt);
      }
      if (look.tie && !up) { P(7, 12 + u, 2, 1, "#8e2a36"); P(7, 13 + u, 2, 3, "#b03a48"); }
      if (look.hoodie && !up) { P(6, 13 + u, 1, 2, "#efe6ff"); P(9, 13 + u, 1, 2, "#efe6ff"); P(5, 11 + u, 6, 1, shirtD); }
      if (look.badge && !up) P(9, 14 + u, 1, 1, "#ffd34d");
      // arms swing opposite to legs
      const aL = frame === 1 ? -1 : frame === 2 ? 1 : 0;
      if (sitting) { P(3, 12 + u, 1, 4, shirt); P(12, 12 + u, 1, 4, shirtD); P(3, 16 + u, 1, 1, skin); P(12, 16 + u, 1, 1, skin); }
      else {
        P(3, 12 + u + aL, 1, 5, shirt); P(12, 12 + u - aL, 1, 5, shirtD);
        P(3, 17 + u + aL, 1, 1, skin); P(12, 17 + u - aL, 1, 1, skinD);
      }
      if (look.phone && !up) { P(12, 15 + u, 2, 3, "#2b2b33"); P(13, 15 + u, 1, 2, "#8fe0ff"); }
    } else {
      P(5, 11 + u, 6, 7, shirt); P(5, 11 + u, 1, 7, shirtD); P(10, 11 + u, 1, 7, shirtL);
      P(5, 17 + u, 6, 1, pantsD);
      if (look.vest) { P(5, 12 + u, 6, 5, "#f2c230"); P(5, 15 + u, 6, 1, "#f4f4ee"); }
      if (look.tie) P(10, 12 + u, 1, 4, "#b03a48");
      const sw = sitting ? 1 : frame === 1 ? 2 : frame === 2 ? -1 : 0;
      P(7 + Math.min(sw, 1), 12 + u, 2, 5, shirtD); P(7 + sw, 17 + u, 2, 1, skin);
      if (look.phone) { P(9 + Math.max(sw, 0), 14 + u, 2, 3, "#2b2b33"); P(10 + Math.max(sw, 0), 14 + u, 1, 2, "#8fe0ff"); }
    }

    // head
    const hy = u;
    if (!side) {
      P(3, 2 + hy, 10, 8, skin); P(4, 10 + hy, 8, 1, skin);
      P(12, 4 + hy, 1, 6, skinD); P(5, 10 + hy, 7, 1, skinD);
      P(2, 6 + hy, 1, 2, skinD); P(13, 6 + hy, 1, 2, skinD); // ears
      if (up) {
        P(3, 1 + hy, 10, 9, hair); P(4, 0 + hy, 8, 1, hair); P(4, 9 + hy, 8, 1, hairD);
        P(5, 2 + hy, 2, 1, hairL);
        if (style === "long") { P(2, 4 + hy, 12, 9, hair); P(3, 11 + hy, 10, 2, hairD); }
        if (style === "bun") { P(6, -1 + hy, 4, 2, hairD); }
        if (style === "bob") P(2, 4 + hy, 12, 5, hair);
      } else {
        P(4, 0 + hy, 8, 1, hair); P(3, 1 + hy, 10, 3, hair); P(5, 1 + hy, 3, 1, hairL);
        P(3, 4 + hy, 2, 1, hair); P(9, 4 + hy, 4, 1, hair); P(3, 4 + hy, 10, 0, hair);
        if (style === "long") { P(2, 3 + hy, 2, 10, hair); P(12, 3 + hy, 2, 10, hairD); }
        if (style === "bob") { P(2, 3 + hy, 2, 6, hair); P(12, 3 + hy, 2, 6, hairD); }
        if (style === "bun") { P(6, -1 + hy, 4, 2, hairD); P(7, -1 + hy, 2, 1, hair); }
        if (style === "spiky") { P(4, -1 + hy, 1, 1, hair); P(7, -1 + hy, 1, 1, hair); P(10, -1 + hy, 1, 1, hair); }
        // face
        P(5, 6 + hy, 1, 2, eye); P(10, 6 + hy, 1, 2, eye);
        P(5, 6 + hy, 1, 1, "#4a3a5a"); P(10, 6 + hy, 1, 1, "#4a3a5a");
        P(4, 8 + hy, 1, 1, "#e79a8c"); P(11, 8 + hy, 1, 1, "#e79a8c");
        P(7, 9 + hy, 2, 1, shade(skin, -0.22));
        if (look.glasses) { P(4, 6 + hy, 3, 1, "#2e2a36"); P(9, 6 + hy, 3, 1, "#2e2a36"); P(7, 6 + hy, 2, 1, "#2e2a36"); }
      }
    } else {
      P(4, 2 + hy, 9, 8, skin); P(5, 10 + hy, 7, 1, skin); P(13, 6 + hy, 1, 2, skin);
      P(5, 10 + hy, 6, 1, skinD);
      P(4, 0 + hy, 8, 1, hair); P(4, 1 + hy, 9, 3, hair); P(4, 4 + hy, 4, 4, hair); P(6, 1 + hy, 3, 1, hairL);
      P(7, 6 + hy, 1, 2, skinD); // ear
      if (style === "long") P(3, 3 + hy, 4, 10, hair);
      if (style === "bob") P(3, 3 + hy, 4, 7, hair);
      if (style === "bun") P(3, 0 + hy, 3, 3, hairD);
      if (style === "spiky") { P(5, -1 + hy, 1, 1, hair); P(8, -1 + hy, 1, 1, hair); P(11, -1 + hy, 1, 1, hair); }
      P(10, 6 + hy, 1, 2, eye); P(10, 6 + hy, 1, 1, "#4a3a5a");
      P(11, 9 + hy, 1, 1, shade(skin, -0.22)); P(10, 8 + hy, 1, 1, "#e79a8c");
      if (look.glasses) P(9, 6 + hy, 4, 1, "#2e2a36");
    }
    outline(c);
    spriteCache.set(key, c);
    return c;
  }

  function lookOf(p) {
    if (p.id === "player") return { ...PLAYER_LOOK, badge: true };
    const pal = p.palette || {};
    const extra = STYLES[p.id] || {};
    const style = extra.style || HAIRS[hash(p.id) % HAIRS.length];
    return { shirt: pal.shirt, pants: pal.pants, hair: pal.hair, skin: pal.skin, style, ...extra, vest: p.role === "worker" };
  }

  // ------------------------------------------------------------------ buildings
  const ICONS = {
    mail: [["..........", ".wwwwwwww.", ".wrwwwwrw.", ".wwrwwrww.", ".wwwrrwww.", ".wwwwwwww.", ".........."], { w: "#fbfbf6", r: "#c0504d" }],
    play: [["..........", "..rrrrrr..", ".rrwrrrrr.", ".rrwwrrrr.", ".rrwwwrrr.", ".rrwwrrrr.", ".rrwrrrrr.", "..rrrrrr.."], { r: "#d8383a", w: "#ffffff" }],
    coin: [["...yyyy...", "..yYYYYy..", ".yYYdYYYy.", ".yYdddYYy.", ".yYYdYYYy.", "..yYYYYy..", "...yyyy..."], { y: "#b8860b", Y: "#f6c945", d: "#8a5d0a" }],
    book: [["..........", ".bbbb.bbbb", ".bwwb.bwwb", ".bwwbbbwwb", ".bwwbbbwwb", ".bbbbbbbbb", "....bb...."], { b: "#4a4590", w: "#f4ecd8" }],
    globe: [["...bbbb...", "..bggbbb..", ".bggggbbb.", ".bbggbbgb.", ".bbbbbggb.", "..bbbbbb..", "...bbbb..."], { b: "#3a7bd5", g: "#4fae5a" }],
    gear: [["...g..g...", "..gggggg..", ".gggddggg.", "..gd..dg..", ".gggddggg.", "..gggggg..", "...g..g..."], { g: "#9aa3ad", d: "#5b636c" }],
    scroll: [["..........", ".sssssss..", "sSwwwwwSs.", ".swlwlws..", ".swwwwws..", "sSwwwwwSs.", ".sssssss.."], { s: "#a87f4a", S: "#7a5530", w: "#f3e7c5", l: "#8a7a5a" }],
    heart: [["..........", "..rr..rr..", ".rRrrrrrr.", ".rrrrrrrr.", "..rrrrrr..", "...rrrr...", "....rr...."], { r: "#e0485c", R: "#ffb0bc" }],
  };
  const FONT = { // 3x5 pixel font for the HIRING sign
    H: ["#.#", "#.#", "###", "#.#", "#.#"], I: ["###", ".#.", ".#.", ".#.", "###"], R: ["##.", "#.#", "##.", "#.#", "#.#"],
    N: ["#.#", "###", "###", "###", "#.#"], G: [".##", "#..", "#.#", "#.#", ".##"],
  };

  function drawHouse(id) {
    const b = LAYOUT[id];
    const w = b.w * T, h = b.h * T, top = id === "town_hall" ? 62 : 34; // headroom for towers and chimneys
    const [c, g] = canvas(w + 2, h + top + 2);
    const P = (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(1 + x, 1 + top + y, ww, hh); };
    const r = mulberry32(hash(id));
    const roofH = Math.round(h * 0.5);
    const wallTop = roofH - 2, wx0 = 4, wx1 = w - 4;
    const wall = b.wall, wallD = shade(wall, -0.08), wallDD = shade(wall, -0.18);

    // --- walls (material) ---
    P(wx0, wallTop, wx1 - wx0, h - wallTop, wall);
    if (b.mat === "plank") for (let y = wallTop + 3; y < h - 4; y += 3) P(wx0, y, wx1 - wx0, 1, wallD);
    if (b.mat === "brick") for (let y = wallTop + 2, row = 0; y < h - 4; y += 3, row++) {
      P(wx0, y, wx1 - wx0, 1, shade(wall, -0.2));
      for (let x = wx0 + (row % 2) * 3; x < wx1; x += 6) P(x, y - 2, 1, 2, shade(wall, -0.2));
    }
    if (b.mat === "stone") for (let y = wallTop + 4, row = 0; y < h - 4; y += 5, row++) {
      P(wx0, y, wx1 - wx0, 1, wallD);
      for (let x = wx0 + (row % 2) * 5; x < wx1; x += 10) P(x, y - 4, 1, 4, wallD);
    }
    if (b.mat === "stucco") for (let i = 0; i < 40; i++) P(wx0 + ((r() * (wx1 - wx0)) | 0), wallTop + 2 + ((r() * (h - wallTop - 8)) | 0), 1, 1, wallD);
    if (b.mat === "metal") for (let x = wx0 + 2; x < wx1; x += 4) P(x, wallTop, 1, h - wallTop - 4, wallD);
    if (b.mat === "plank" || b.mat === "stucco") { P(wx0, wallTop, 3, h - wallTop, PAL.wd0); P(wx1 - 3, wallTop, 3, h - wallTop, PAL.wd1); }
    P(wx0, wallTop, wx1 - wx0, 3, "rgba(0,0,0,0.22)"); // shadow under the eaves
    // foundation
    for (let x = wx0; x < wx1; x += 6) { P(x, h - 4, 6, 4, x % 12 ? "#8d877c" : "#a09a8e"); P(x, h - 4, 1, 4, "#6f6a60"); }
    P(wx0, h - 4, wx1 - wx0, 1, "#6f6a60");

    // --- windows with shutters and flower boxes ---
    const win = (x) => {
      const y = roofH + 6;
      P(x - 3, y, 3, 12, shade(b.roof, -0.05)); P(x + 12, y, 3, 12, shade(b.roof, -0.05));
      P(x - 3, y + 3, 3, 1, shade(b.roof, -0.2)); P(x + 12, y + 3, 3, 1, shade(b.roof, -0.2));
      P(x, y, 12, 12, PAL.wd1); P(x + 1, y + 1, 10, 10, PAL.glass);
      P(x + 2, y + 2, 3, 1, PAL.glassHi); P(x + 2, y + 3, 1, 2, PAL.glassHi); P(x + 7, y + 6, 2, 1, PAL.glassHi);
      P(x + 6, y + 1, 1, 10, PAL.wd1); P(x + 1, y + 6, 10, 1, PAL.wd1);
      P(x - 1, y + 12, 14, 2, PAL.wd2); P(x, y + 14, 12, 3, PAL.wd0);
      ["#e0485c", "#ffd34d", "#ff9ec4", "#e0485c", "#ffffff"].forEach((col, i) => P(x + 1 + i * 2 + (i % 2), y + 13 - (i % 2), 1, 1, col));
      P(x + 1, y + 13, 10, 1, "#3d7a3a");
    };
    win(11); win(w - 23);

    // --- door ---
    const dw = b.w >= 10 ? 26 : 12, dx = Math.round(w / 2 - dw / 2) - (b.w >= 10 ? 0 : 0), dh = 22, dy = h - dh - 2;
    P(dx - 2, dy - 2, dw + 4, dh + 2, PAL.wd1);
    P(dx, dy, dw, dh, PAL.wd2);
    for (let x = dx + 3; x < dx + dw; x += 4) P(x, dy + 1, 1, dh - 1, PAL.wd0);
    P(dx, dy, 1, 1, PAL.wd1); P(dx + dw - 1, dy, 1, 1, PAL.wd1);
    P(dx + dw - 4, dy + 11, 2, 2, "#f6c945");
    P(dx - 3, h - 2, dw + 6, 2, "#9a9488"); P(dx - 3, h - 2, dw + 6, 1, "#b5afa2"); // step

    // --- roof: trapezoid with shingle rows, ridge highlight and eave ---
    const roof = b.roof;
    for (let y = 0; y < roofH; y++) {
      const inset = Math.round(((roofH - y) / roofH) * 12);
      const band = (y / 4) | 0, light = 0.08 - band * 0.018;
      let col = shade(roof, light);
      if (y % 4 === 3) col = shade(roof, light - 0.12);
      if (b.mat === "metal") col = shade(roof, (inset % 2 ? -0.04 : 0.04) + light);
      P(inset, y, w - inset * 2, 1, col);
      if (y % 4 !== 3 && b.mat !== "metal") for (let x = inset + ((band % 2) * 4); x < w - inset; x += 8) P(x, y, 1, 1, shade(roof, light - 0.1));
    }
    P(12, 0, w - 24, 2, shade(roof, 0.22)); // ridge
    P(0, roofH - 3, w, 3, shade(roof, -0.28)); P(0, roofH - 3, w, 1, shade(roof, -0.14)); // eave

    // --- chimney ---
    if (id !== "town_hall" && id !== "studio") {
      const cx = w - 26;
      P(cx, -10, 10, 16, "#8b4b3a");
      for (let y = -8; y < 6; y += 3) { P(cx, y, 10, 1, "#6e382b"); P(cx + ((y / 3) % 2 ? 2 : 6), y - 2, 1, 2, "#6e382b"); }
      P(cx - 1, -12, 12, 3, "#5a5a62");
    }

    // --- landmark details ---
    if (id === "town_hall") {
      const tx = w / 2 - 11;
      P(tx, -30, 22, 34, "#e9ddc2"); P(tx + 18, -30, 4, 34, "#cfc2a6");
      for (let y = -26; y < 4; y += 5) P(tx, y, 22, 1, "#d2c5a8");
      for (let y = -42; y < -30; y++) { const ins = Math.round(((y + 42) / 12) * -11 + 12); P(tx - 2 + (12 - ins), y, 26 - 2 * (12 - ins), 1, shade(roof, -0.05 + (y % 3 ? 0 : -0.08))); }
      g.fillStyle = "#fbf8ef"; g.beginPath(); g.arc(1 + w / 2, 1 + top - 16, 7, 0, 7); g.fill();
      P(w / 2 - 1, -21, 1, 6, PAL.out); P(w / 2 - 1, -16, 4, 1, PAL.out);
      P(w / 2 - 1, -58, 1, 16, "#4a4a52");
      for (const cx of [dx - 16, dx - 8, dx + dw + 4, dx + dw + 12]) { P(cx, roofH + 2, 4, h - roofH - 6, "#f7f2e6"); P(cx + 3, roofH + 2, 1, h - roofH - 6, "#cfc8b8"); P(cx - 1, roofH + 1, 6, 2, "#e0d8c6"); }
      P(dx - 20, h - 4, dw + 40, 2, "#b5afa2"); P(dx - 16, h - 6, dw + 32, 2, "#c7c1b4");
    }
    if (id === "studio") { // ring light mount (light itself is animated live)
      P(w / 2, -12, 1, 14, "#2b2b33"); P(w / 2 - 3, 1, 7, 2, "#2b2b33");
    }
    if (id === "recruiting") { // striped awning
      for (let x = 6; x < w - 6; x += 6) { P(x, roofH, 3, 6, "#f4efe6"); P(x + 3, roofH, 3, 6, "#d8463a"); }
      for (let x = 6; x < w - 6; x += 3) P(x, roofH + 6, 2, 1, x % 6 ? "#d8463a" : "#f4efe6");
    }
    if (id === "bank") for (const cx of [9, w - 13]) { P(cx, roofH, 4, h - roofH - 4, "#fbf8ef"); P(cx + 3, roofH, 1, h - roofH - 4, "#d9d2c2"); }

    // --- hanging sign above the door ---
    if (b.sign === "hiring") {
      const sx = w / 2 - 15, sy = roofH + 7;
      P(sx, sy, 30, 10, PAL.wd1); P(sx + 1, sy + 1, 28, 8, "#f2c230");
      let x = sx + 2;
      for (const ch of "HIRING") { bitmap(g, 1 + x, 1 + top + sy + 2, FONT[ch], { "#": PAL.out }); x += 4 + (ch === "I" ? 0 : 0); }
    } else if (b.sign) {
      const [rows, colors] = ICONS[b.sign];
      const sx = w / 2 - 7, sy = dy - 13;
      P(sx + 2, sy - 3, 1, 3, "#4a4a52"); P(sx + 11, sy - 3, 1, 3, "#4a4a52");
      P(sx, sy, 14, 11, PAL.wd1); P(sx + 1, sy + 1, 12, 9, "#efe3c8");
      bitmap(g, 1 + sx + 2, 1 + top + sy + 2, rows, colors);
    }
    outline(c);
    return { canvas: c, top, roofH };
  }

  // ------------------------------------------------------------------ nature + props
  function drawTree(kind) {
    if (kind === "bush") {
      const [c, g] = canvas(20, 16);
      const blob = (x, y, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
      blob(10, 9, 7, PAL.gDeep); blob(9, 8, 6, PAL.g1); blob(7, 6, 3, PAL.g3);
      g.fillStyle = "#e0485c"; g.fillRect(12, 6, 1, 1); g.fillRect(6, 10, 1, 1); g.fillStyle = "#ffffff"; g.fillRect(14, 10, 1, 1);
      return outline(c);
    }
    const [c, g] = canvas(30, 40);
    const r = mulberry32(kind === "pine" ? 3 : 9);
    g.fillStyle = PAL.wd1; g.fillRect(13, 26, 5, 12); g.fillStyle = PAL.wd0; g.fillRect(13, 26, 2, 12);
    g.fillRect(11, 36, 2, 2); g.fillRect(18, 36, 2, 2);
    if (kind === "pine") {
      for (let i = 0; i < 4; i++) {
        const y0 = 4 + i * 6, half = 5 + i * 3;
        for (let y = 0; y < 9; y++) {
          const hw = Math.round((y / 9) * half);
          g.fillStyle = y > 6 ? "#24502c" : i % 2 ? "#2f6b3a" : "#357a40"; g.fillRect(15 - hw, y0 + y, hw * 2 + 1, 1);
          g.fillStyle = "#4b9a56"; g.fillRect(15 - hw, y0 + y, 1, 1);
        }
      }
    } else {
      const blob = (x, y, rad, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); };
      blob(15, 16, 13, PAL.gDeep); blob(14, 14, 12, PAL.g0); blob(12, 12, 9, PAL.g1); blob(10, 9, 5, PAL.g2);
      for (let i = 0; i < 40; i++) {
        const a = r() * 6.28, d = r() * 11, x = 15 + Math.cos(a) * d, y = 15 + Math.sin(a) * d;
        g.fillStyle = y > 16 ? PAL.gDeep : r() < 0.5 ? PAL.g2 : PAL.g3; g.fillRect(x | 0, y | 0, 1, 1);
      }
      g.fillStyle = PAL.g3; g.fillRect(8, 7, 2, 1); g.fillRect(7, 8, 1, 2);
    }
    return outline(c);
  }

  function drawProp(kind) {
    const [c, g] = canvas(34, 30);
    const P = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    if (kind === "lamp") {
      P(15, 8, 2, 20, "#3a3a44"); P(16, 8, 1, 20, "#55555f"); P(13, 27, 6, 2, "#3a3a44");
      P(12, 2, 8, 7, "#3a3a44"); P(13, 3, 6, 5, "#ffe9a0"); P(14, 4, 2, 2, "#fff8de"); P(11, 1, 10, 2, "#2a2a32");
    } else if (kind === "bench") {
      P(2, 14, 30, 3, PAL.wd2); P(2, 14, 30, 1, shade(PAL.wd2, 0.1)); P(2, 18, 30, 3, PAL.wd2);
      P(2, 10, 30, 3, PAL.wd0); P(4, 21, 2, 6, "#3a3a44"); P(28, 21, 2, 6, "#3a3a44");
    } else if (kind === "mailbox") {
      P(15, 14, 2, 14, "#5a3420"); P(10, 6, 12, 9, "#c0504d"); P(10, 6, 12, 2, "#d9706c"); P(21, 4, 1, 5, "#ffd34d"); P(22, 4, 3, 2, "#ffd34d");
    } else if (kind === "signpost") {
      P(15, 6, 2, 22, PAL.wd1); P(6, 6, 20, 6, PAL.wd2); P(6, 6, 20, 1, shade(PAL.wd2, 0.12)); P(4, 8, 2, 2, PAL.wd2);
      P(9, 8, 12, 1, PAL.wd0); P(11, 10, 8, 1, PAL.wd0);
    }
    return outline(c);
  }

  function drawGround() {
    const [c, g] = canvas(W * T, H * T);
    const img = g.createImageData(W * T, H * T), d = img.data;
    const r = mulberry32(7);
    const cols = {};
    const put = (x, y, hex) => { const v = cols[hex] || (cols[hex] = rgb(hex)); const i = (y * W * T + x) * 4; d[i] = v[0]; d[i + 1] = v[1]; d[i + 2] = v[2]; d[i + 3] = 255; };
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      const v = at(tx, ty);
      const base = v === 8 ? under[ty * W + tx] : v;
      const kind = base === 2 || base === 6 ? "plaza" : base === 1 || base === 4 ? "path" : "grass";
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
        const X = tx * T + x, Y = ty * T + y, n = r();
        let col;
        if (kind === "grass") col = n < 0.1 ? PAL.g0 : n < 0.2 ? PAL.g2 : PAL.g1;
        else if (kind === "path") col = n < 0.08 ? PAL.p1 : n < 0.14 ? PAL.p2 : PAL.p0;
        else {
          const row = (Y / 6) | 0, off = (row % 2) * 6, bx = ((X + off) / 12) | 0;
          const tint = hash(`${bx},${row}`) % 5;
          col = Y % 6 === 5 || (X + off) % 12 === 0 ? PAL.mortar : tint === 0 ? PAL.s1 : tint === 1 ? PAL.s2 : PAL.s0;
          if (Y % 6 === 0 && (X + off) % 12 !== 0) col = shade(col, 0.04);
        }
        put(X, Y, col);
      }
    }
    g.putImageData(img, 0, 0);
    const P = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    // path & plaza edges, grass tufts and flowers
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      const v = at(tx, ty), X = tx * T, Y = ty * T;
      const isGround = (a) => a === 0 || a === 5 || a === 7 || a === 9;
      if (v === 1 || v === 4) {
        if (isGround(at(tx, ty - 1))) { P(X, Y, T, 1, PAL.pEdge); for (let i = 0; i < 4; i++) P(X + ((r() * 15) | 0), Y + 1, 1, 1, PAL.g1); }
        if (isGround(at(tx, ty + 1))) P(X, Y + T - 1, T, 1, PAL.pEdge);
        if (isGround(at(tx - 1, ty))) P(X, Y, 1, T, PAL.pEdge);
        if (isGround(at(tx + 1, ty))) P(X + T - 1, Y, 1, T, PAL.pEdge);
      }
      if (v === 2) {
        if (at(tx, ty - 1) !== 2 && at(tx, ty - 1) !== 6 && at(tx, ty - 1) !== 8) P(X, Y, T, 2, PAL.curb);
        if (at(tx, ty + 1) !== 2 && at(tx, ty + 1) !== 6 && at(tx, ty + 1) !== 8) P(X, Y + T - 2, T, 2, PAL.curb);
        if (at(tx - 1, ty) !== 2 && at(tx - 1, ty) !== 6 && at(tx - 1, ty) !== 8) P(X, Y, 2, T, PAL.curb);
        if (at(tx + 1, ty) !== 2 && at(tx + 1, ty) !== 6 && at(tx + 1, ty) !== 8) P(X + T - 2, Y, 2, T, PAL.curb);
      }
      if (v === 0 && r() < 0.35) { const x = X + 2 + ((r() * 11) | 0), y = Y + 3 + ((r() * 10) | 0); P(x, y, 1, 2, PAL.g0); P(x + 1, y - 1, 1, 3, PAL.g3); P(x + 2, y, 1, 2, PAL.g0); }
      if (v === 7) for (let i = 0; i < 4; i++) {
        const x = X + 2 + ((r() * 11) | 0), y = Y + 2 + ((r() * 11) | 0), col = ["#ffd34d", "#ff8fa3", "#ffffff", "#b48cff"][(r() * 4) | 0];
        P(x, y + 1, 1, 2, PAL.g0); P(x - 1, y, 3, 1, col); P(x, y - 1, 1, 3, col); P(x, y, 1, 1, "#fff6c8");
      }
    }
    // shadows cast by buildings (light from the top-left)
    g.fillStyle = "rgba(20,30,25,0.2)";
    for (const b of Object.values(LAYOUT)) {
      const x1 = (b.x + b.w) * T - 4, y0 = b.y * T + Math.round(b.h * T * 0.5) + 4, y1 = (b.y + b.h) * T;
      g.beginPath(); g.moveTo(x1, y0); g.lineTo(x1 + 6, y0 + 6); g.lineTo(x1 + 6, y1 + 4); g.lineTo(b.x * T + 10, y1 + 4); g.lineTo(b.x * T + 6, y1); g.lineTo(x1, y1); g.closePath(); g.fill();
    }
    for (const t of trees) if (t.kind !== "bush") { g.beginPath(); g.ellipse(t.x + 3, t.y + 1, 11, 4, 0, 0, 7); g.fill(); }
    // fountain: stone rim, basin and pedestal
    const { x: fx, y: fy, r: fr } = FOUNTAIN;
    const ring = (rad, col) => { g.fillStyle = col; g.beginPath(); g.arc(fx, fy, rad, 0, 7); g.fill(); };
    ring(fr + 4, PAL.out); ring(fr + 3, "#8f8a80"); ring(fr + 1, "#b4aea2"); ring(fr - 2, PAL.out); ring(fr - 3, PAL.w0);
    g.fillStyle = "#c9c3b6"; g.beginPath(); g.arc(fx, fy, fr + 1, Math.PI * 1.05, Math.PI * 1.6); g.lineTo(fx, fy); g.fill();
    ring(fr - 3, PAL.w0); ring(fr - 7, "#3270c4");
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
  const smoke = [], birds = [], sparkles = [];
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

  /** Pick an integer device-pixel scale, size the world canvas, place the camera. */
  function setView(worldW, worldH, zoom, fx, fy) {
    S = Math.max(2, Math.round(zoom * dpr));
    const vw = Math.ceil(cv.width / S), vh = Math.ceil(cv.height / S);
    if (lo.width !== vw + 1 || lo.height !== vh + 1) { lo.width = vw + 1; lo.height = vh + 1; lg.imageSmoothingEnabled = false; }
    const topPad = Math.ceil((($("toolbar")?.offsetHeight || 0) * dpr) / S); // keep the focus clear of the toolbar
    const avail = vh - topPad;
    camX = worldW <= vw ? -Math.floor((vw - worldW) / 2) : clamp(Math.round(fx - vw / 2), 0, worldW - vw);
    camY = worldH <= avail ? -Math.floor(topPad + (avail - worldH) / 2)
      : clamp(Math.round(fy - topPad - avail / 2), -topPad, worldH - vh);
    lg.setTransform(1, 0, 0, 1, -camX, -camY);
  }
  const toScreen = (x, y) => [(x - camX) * S, (y - camY) * S];

  function drawPerson(p, x, y, opts = {}) {
    const s = charSprite(lookOf(p), opts.dir ?? p.dir, opts.sitting ? 0 : p.frame, !!opts.sitting);
    lg.fillStyle = "rgba(20,20,30,.28)";
    lg.beginPath(); lg.ellipse(Math.round(x), Math.round(y), 6, 2, 0, 0, 7); lg.fill();
    lg.drawImage(s, Math.round(x - SPR_W / 2), Math.round(y - SPR_H + 1));
  }

  function zoomFor() { return innerWidth < 600 ? 2 : clamp(Math.round(Math.min(innerWidth / (26 * T), innerHeight / (15 * T))), 2, 4); }

  function renderTown(now) {
    setView(W * T, H * T, zoomFor(), player.x, player.y - 8);
    const vw = lo.width, vh = lo.height, t = now / 1000;
    lg.fillStyle = PAL.gDeep; lg.fillRect(camX, camY, vw, vh);
    lg.drawImage(world.ground, 0, 0);

    // fountain water: ripples, sparkles, spout
    const { x: fx, y: fy } = FOUNTAIN;
    for (let i = 0; i < 3; i++) {
      lg.strokeStyle = `rgba(210,240,255,${0.45 - i * 0.12})`; lg.lineWidth = 1;
      lg.beginPath(); lg.arc(fx, fy, ((t * 9 + i * 8) % 24) + 6, 0, 7); lg.stroke();
    }
    if (Math.random() < 0.3) sparkles.push({ x: fx + (Math.random() - 0.5) * 50, y: fy + (Math.random() - 0.5) * 40, life: 1 });
    for (const s of sparkles) if (Math.hypot(s.x - fx, s.y - fy) < FOUNTAIN.r - 4) { lg.fillStyle = `rgba(255,255,255,${s.life})`; lg.fillRect(s.x | 0, s.y | 0, 1, 1); }
    const ell = (cx, cy, rx, ry, col) => { lg.fillStyle = col; lg.beginPath(); lg.ellipse(cx, cy, rx, ry, 0, 0, 7); lg.fill(); };
    ell(fx, fy + 3, 10, 5, PAL.out); ell(fx, fy + 3, 9, 4, "#a9a397"); ell(fx, fy + 2, 7, 3, PAL.w1);
    lg.fillStyle = PAL.out; lg.fillRect(fx - 3, fy - 9, 6, 11);
    lg.fillStyle = "#cfc9bc"; lg.fillRect(fx - 2, fy - 9, 4, 11); lg.fillStyle = "#e3ddd0"; lg.fillRect(fx - 2, fy - 9, 1, 11);
    ell(fx, fy - 10, 7, 3, PAL.out); ell(fx, fy - 10, 6, 2, "#bdb7aa"); ell(fx, fy - 10.5, 4, 1, PAL.w2);
    for (let i = 0; i < 8; i++) {
      const a = (t * 1.6 + i / 8) % 1, ang = (i / 8) * Math.PI * 2;
      lg.fillStyle = i % 2 ? PAL.w2 : "#ffffff";
      lg.fillRect(fx + Math.cos(ang) * a * 10, fy - 14 - Math.sin(a * Math.PI) * 9 + Math.sin(ang) * a * 4, 1, 1);
    }

    // y-sorted drawables
    const items = [];
    const inView = (x, y, m = 48) => x > camX - m && x < camX + vw + m && y > camY - m && y < camY + vh + 80;
    for (const id of Object.keys(LAYOUT)) {
      const b = LAYOUT[id], hs = world.houses[id];
      items.push({ y: (b.y + b.h) * T, draw: () => { lg.drawImage(hs.canvas, b.x * T - 1, b.y * T - hs.top - 1); houseLive(id, b, t); } });
    }
    for (const tr of trees) if (inView(tr.x, tr.y)) {
      const img = world.trees[tr.kind];
      items.push({ y: tr.y, draw: () => lg.drawImage(img, tr.x - (img.width >> 1), tr.y - img.height + 3) });
    }
    for (const pr of props) if (inView(pr.x, pr.y)) {
      const img = world.props[pr.kind];
      items.push({ y: pr.y, draw: () => lg.drawImage(img, pr.x - 17, pr.y - 28) });
    }
    for (const p of people) if (visible(p) && inView(p.x, p.y)) items.push({ y: p.y, draw: () => drawPerson(p, p.x, p.y) });
    items.push({ y: player.y, draw: () => drawPerson(player, player.x, player.y) });
    items.sort((a, b) => a.y - b.y).forEach((i) => i.draw());

    // smoke and birds
    for (const s of smoke) { lg.fillStyle = `rgba(235,235,240,${s.life * 0.7})`; const r = 2 + (1 - s.life) * 4; lg.fillRect(Math.round(s.x - r / 2), Math.round(s.y - r / 2), Math.ceil(r), Math.ceil(r)); }
    lg.fillStyle = PAL.out;
    for (const b of birds) for (let k = 0; k < 3; k++) {
      const flap = Math.sin(t * 10 + k) > 0 ? -1 : 1;
      const bx = Math.round(b.x - k * 12), by = Math.round(b.y + (k % 2) * 7);
      lg.fillRect(bx - 3, by + flap, 3, 1); lg.fillRect(bx, by, 1, 1); lg.fillRect(bx + 1, by + flap, 3, 1);
    }

    if (showNav) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        lg.fillStyle = solid(at(x, y)) ? "rgba(220,40,40,.35)" : "rgba(40,220,90,.22)";
        lg.fillRect(x * T, y * T, T, T);
      }
    }
    lighting(t, true);
    blit();

    // text overlay at screen resolution
    for (const p of people) if (visible(p) && dist(p, player) < 7 * T) {
      nameTag(p.name, p.x, p.y - CHAR_H - 2, p.role === "worker" ? "#f2c230" : p.role === "chief_of_staff" ? "#9fd3ff" : "#fff6dc");
    }
    for (const p of people) if (visible(p) && p.bubble) speech(p.bubble.text, p.x, p.y - CHAR_H - 10);
    for (const [id, b] of Object.entries(LAYOUT)) {
      const d = doorPx(id);
      if (Math.hypot(d.x - player.x, d.y - player.y) < 5 * T) {
        const h = roster.houses.find((x) => x.id === id);
        if (h) nameTag(h.label, d.x, (b.y + b.h) * T + 12, "#ffe08a", true);
      }
    }
  }

  function houseLive(id, b, t) {
    const X = b.x * T, Y = b.y * T, w = b.w * T, roofH = world.houses[id].roofH;
    if (id === "town_hall") { // waving flag on the clock tower
      for (let i = 0; i < 14; i++) {
        const wave = Math.round(Math.sin(t * 5 + i * 0.55) * 1.5);
        lg.fillStyle = i < 7 ? "#c0392b" : "#f2c230"; lg.fillRect(X + w / 2 + 1 + i, Y - 58 + wave, 1, 8);
        lg.fillStyle = PAL.out; lg.fillRect(X + w / 2 + 1 + i, Y - 59 + wave, 1, 1); lg.fillRect(X + w / 2 + 1 + i, Y - 50 + wave, 1, 1);
      }
    }
    if (id === "studio") { // the ring light glows
      const glow = 0.65 + Math.sin(t * 3) * 0.25, cx = X + w / 2 + 1, cy = Y - 14;
      lg.fillStyle = `rgba(255,248,210,${glow * 0.22})`; lg.beginPath(); lg.arc(cx, cy, 14, 0, 7); lg.fill();
      lg.strokeStyle = PAL.out; lg.lineWidth = 4; lg.beginPath(); lg.arc(cx, cy, 8, 0, 7); lg.stroke();
      lg.strokeStyle = `rgba(255,252,230,${0.75 + glow * 0.25})`; lg.lineWidth = 2; lg.beginPath(); lg.arc(cx, cy, 8, 0, 7); lg.stroke();
      lg.lineWidth = 1;
    }
    const h = hourNow();
    if (h >= 18.5 || h < 6.5) { // warm windows after dark
      lg.fillStyle = "rgba(255,206,110,.55)";
      for (const wx of [12, w - 22]) lg.fillRect(X + wx, Y + roofH + 7, 10, 10);
    }
  }

  /** Time-of-day tint, then lamp and window glow on top. */
  function lighting(t, town) {
    const h = hourNow();
    let tint = null, a = 0;
    if (h >= 20 || h < 5.5) { tint = "#2a3570"; a = 0.55; }
    else if (h >= 18) { tint = "#c86a50"; a = ((h - 18) / 2) * 0.35; }
    else if (h < 7) { tint = "#d88a6a"; a = ((7 - h) / 1.5) * 0.3; }
    if (!tint) return;
    lg.save(); lg.setTransform(1, 0, 0, 1, 0, 0);
    lg.globalCompositeOperation = "multiply"; lg.globalAlpha = a; lg.fillStyle = tint; lg.fillRect(0, 0, lo.width, lo.height);
    lg.restore();
    if (!town || a < 0.3) return;
    lg.save(); lg.globalCompositeOperation = "lighter";
    for (const pr of props) if (pr.kind === "lamp") {
      const gr = lg.createRadialGradient(pr.x, pr.y - 22, 1, pr.x, pr.y - 22, 34 + Math.sin(t * 3) * 1.5);
      gr.addColorStop(0, "rgba(255,210,120,.55)"); gr.addColorStop(1, "rgba(255,210,120,0)");
      lg.fillStyle = gr; lg.fillRect(pr.x - 40, pr.y - 60, 80, 80);
    }
    lg.restore();
  }

  function blit() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(lo, 0, 0, lo.width * S, lo.height * S);
  }

  function nameTag(text, wx, wy, color, sign = false) {
    const [sx, sy] = toScreen(wx, wy);
    const fs = Math.round(11 * dpr);
    ctx.font = `600 ${fs}px ${UI_FONT}`;
    const w = Math.ceil(ctx.measureText(text).width) + 10 * dpr, h = fs + 6 * dpr;
    const x = Math.round(sx - w / 2), y = Math.round(sy - h);
    ctx.fillStyle = sign ? "rgba(58,36,22,.92)" : "rgba(24,18,32,.82)"; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = sign ? "#c99a5b" : "rgba(255,255,255,.18)"; ctx.fillRect(x, y, w, dpr); ctx.fillRect(x, y + h - dpr, w, dpr);
    ctx.fillStyle = color; ctx.textBaseline = "middle"; ctx.fillText(text, x + 5 * dpr, y + h / 2 + dpr * 0.5);
  }
  function speech(text, wx, wy) {
    const [sx, sy] = toScreen(wx, wy);
    const fs = Math.round(12 * dpr);
    ctx.font = `500 ${fs}px ${UI_FONT}`;
    const msg = text.length > 34 ? text.slice(0, 33) + "…" : text;
    const w = Math.ceil(ctx.measureText(msg).width) + 14 * dpr, h = fs + 10 * dpr;
    const x = Math.round(sx - w / 2), y = Math.round(sy - h - 6 * dpr);
    ctx.fillStyle = "#1d1420"; ctx.fillRect(x - dpr, y - dpr, w + 2 * dpr, h + 2 * dpr);
    ctx.fillStyle = "#fffaf0"; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#1d1420"; ctx.fillRect(sx - 3 * dpr, y + h + dpr, 6 * dpr, 2 * dpr); ctx.fillRect(sx - dpr, y + h + 3 * dpr, 2 * dpr, 2 * dpr);
    ctx.fillStyle = "#fffaf0"; ctx.fillRect(sx - 2 * dpr, y + h, 4 * dpr, 2 * dpr);
    ctx.fillStyle = "#2a2030"; ctx.textBaseline = "middle"; ctx.fillText(msg, x + 7 * dpr, y + h / 2 + dpr * 0.5);
  }

  // ------------------------------------------------------------------ interior rendering
  const roomCache = {};
  function roomBackdrop(id) {
    if (roomCache[id]) return roomCache[id];
    const b = LAYOUT[id], r = mulberry32(hash(id) + 1);
    const [c, g] = canvas(ROOM_W, ROOM_H + 4);
    const P = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    const paper = shade(b.wall, -0.04), paperD = shade(b.wall, -0.1);
    P(0, 0, ROOM_W, WALL_H, paper);
    for (let x = 0; x < ROOM_W; x += 8) P(x, 0, 3, WALL_H - 12, paperD);
    P(0, WALL_H - 12, ROOM_W, 10, PAL.wd2); for (let x = 0; x < ROOM_W; x += 12) P(x, WALL_H - 12, 1, 10, PAL.wd0);
    P(0, WALL_H - 12, ROOM_W, 1, shade(PAL.wd2, 0.15)); P(0, WALL_H - 2, ROOM_W, 2, PAL.wd1);
    P(0, 0, ROOM_W, 3, shade(b.roof, -0.2));
    // floor planks
    for (let y = WALL_H, row = 0; y < ROOM_H; y += 6, row++) {
      for (let x = -((row * 17) % 30); x < ROOM_W; x += 30) {
        P(x, y, 30, 6, ["#9a6538", "#8f5d33", "#a46d3e"][(r() * 3) | 0]);
        P(x, y, 1, 6, "#6e4224");
      }
      P(0, y + 5, ROOM_W, 1, "#6e4224");
    }
    P(0, WALL_H, ROOM_W, 3, "rgba(0,0,0,.25)");
    // windows with light shafts
    for (const wx of [24, ROOM_W - 52]) {
      P(wx - 1, 5, 30, 24, PAL.wd1); P(wx + 1, 7, 26, 20, "#9fd3ff"); P(wx + 3, 9, 6, 1, "#e6f6ff"); P(wx + 3, 10, 1, 4, "#e6f6ff");
      P(wx + 13, 7, 2, 20, PAL.wd1); P(wx + 1, 16, 26, 2, PAL.wd1); P(wx - 2, 29, 32, 2, PAL.wd2);
      g.fillStyle = "rgba(255,245,200,.10)"; g.beginPath(); g.moveTo(wx + 1, WALL_H); g.lineTo(wx + 27, WALL_H); g.lineTo(wx + 47, ROOM_H); g.lineTo(wx + 15, ROOM_H); g.fill();
    }
    // bookshelf
    P(70, 4, 30, WALL_H - 6, PAL.wd1); P(72, 6, 26, WALL_H - 10, "#3b2414");
    for (let s = 0; s < 3; s++) {
      for (let x = 73; x < 97;) { const bw = 2 + ((r() * 2) | 0), bh = 7 + ((r() * 3) | 0); P(x, 6 + s * 10 + (10 - bh), bw, bh, ["#c0504d", "#3a7d44", "#5b5ea6", "#e07b39", "#d9c27a"][(r() * 5) | 0]); x += bw + (r() < 0.2 ? 1 : 0); }
      P(72, 15 + s * 10, 26, 2, PAL.wd2);
    }
    // fireplace (fire animated live)
    P(ROOM_W / 2 - 18, 6, 36, WALL_H - 4, "#8b4b3a");
    for (let y = 8; y < WALL_H - 2; y += 4) for (let x = ROOM_W / 2 - 18 + ((y / 4) % 2) * 3; x < ROOM_W / 2 + 18; x += 6) P(x, y, 1, 3, "#6e382b");
    P(ROOM_W / 2 - 18, 6, 36, 3, "#5a5a62"); P(ROOM_W / 2 - 10, 18, 20, WALL_H - 16, "#1a1010");
    // rug with border
    P(ROOM_W / 2 - 46, 84, 92, 28, shade(b.roof, -0.05)); P(ROOM_W / 2 - 43, 87, 86, 22, shade(b.roof, 0.08));
    for (let x = ROOM_W / 2 - 40; x < ROOM_W / 2 + 40; x += 6) P(x, 97, 3, 2, shade(b.roof, -0.12));
    // doormat
    P(ROOM_W / 2 - 12, ROOM_H - 6, 24, 6, "#6b5a3a"); P(ROOM_W / 2 - 12, ROOM_H, 24, 4, PAL.out);
    roomCache[id] = c;
    return c;
  }

  function renderRoom(now) {
    const id = scene, t = now / 1000;
    const zoom = Math.min(innerWidth / (ROOM_W + 24), (innerHeight - 80) / (ROOM_H + 24));
    setView(ROOM_W, ROOM_H + 4, Math.max(1.5, zoom), player.x, player.y - 20);
    lg.fillStyle = "#120e18"; lg.fillRect(camX, camY, lo.width, lo.height);
    lg.drawImage(roomBackdrop(id), 0, 0);
    // fire
    for (let i = 0; i < 6; i++) {
      const f = Math.sin(t * 11 + i * 1.7) * 2;
      lg.fillStyle = i % 2 ? "#ffb347" : "#ff6b35"; lg.fillRect(ROOM_W / 2 - 8 + i * 3, WALL_H - 10 - f, 3, 8 + f);
      lg.fillStyle = "#ffe08a"; lg.fillRect(ROOM_W / 2 - 7 + i * 3, WALL_H - 5, 1, 3);
    }
    lg.save(); lg.globalCompositeOperation = "lighter";
    const gr = lg.createRadialGradient(ROOM_W / 2, WALL_H, 2, ROOM_W / 2, WALL_H, 46 + Math.sin(t * 7) * 2);
    gr.addColorStop(0, "rgba(255,150,60,.35)"); gr.addColorStop(1, "rgba(255,150,60,0)");
    lg.fillStyle = gr; lg.fillRect(ROOM_W / 2 - 50, WALL_H - 50, 100, 100); lg.restore();

    const items = [];
    const P = (x, y, w, h, col) => { lg.fillStyle = col; lg.fillRect(x, y, w, h); };
    const plant = (x) => items.push({ y: WALL_H + 14, draw: () => {
      P(x + 3, WALL_H + 6, 8, 8, "#a0522d"); P(x + 3, WALL_H + 6, 8, 2, "#c0703d");
      for (const [dx, dy, c] of [[0, -6, "#3d7a3a"], [5, -10, "#4b8c41"], [9, -5, "#3d7a3a"], [3, -3, "#5a9e48"], [7, -8, "#79b85a"]]) P(x + dx, WALL_H + 6 + dy, 5, 5, c);
    } });
    if (id === "town_hall") {
      items.push({ y: 84, draw: () => {
        P(62, 66, 116, 18, PAL.out); P(63, 67, 114, 15, "#7a4a2a"); P(63, 67, 114, 3, "#9c6639");
        for (let i = 0; i < 4; i++) { P(70 + i * 28, 72, 12, 7, "#f4ecd8"); P(72 + i * 28, 74, 8, 1, "#9a8a6a"); }
      } });
      // banner
      P(ROOM_W / 2 - 8, 3, 16, 3, "#c9a46a");
      const seats = seatPositions();
      people.filter((p) => p.inHall).forEach((p, i) => {
        const s = seats[i % seats.length];
        items.push({ y: s.y, draw: () => drawPerson(p, s.x, s.y, { sitting: true, dir: s.dir }) });
      });
    } else {
      plant(14); plant(ROOM_W - 28);
      items.push({ y: 80, draw: () => {
        P(96, 66, 48, 14, PAL.out); P(97, 67, 46, 11, "#6a3f22"); P(97, 67, 46, 3, "#8a5631");
        P(112, 58, 16, 10, PAL.out); P(113, 59, 14, 7, "#7fd1ff"); P(114, 60, 4, 1, "#e6f6ff"); P(119, 67, 2, 2, "#3a3a44");
        P(100, 68, 6, 3, "#f4ecd8"); P(134, 66, 4, 4, "#e0485c");
        themedProp(id, t);
      } });
      for (const p of people) if (p.role === "director" && p.house === id && p.inside) {
        items.push({ y: DESK.y, draw: () => drawPerson(p, DESK.x, DESK.y, { sitting: true, dir: 0 }) });
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
    else for (const p of people) if (p.role === "director" && p.house === id && p.inside) tags.push([p, DESK.x, DESK.y]);
    for (const [p, x, y] of tags) nameTag(p.name, x, y - CHAR_H - 1, "#fff6dc");
    if (c && c.rx !== undefined) nameTag(c.name, c.rx, c.ry - CHAR_H - 2, "#9fd3ff");
    for (const [p, x, y] of tags) if (p.bubble) speech(p.bubble.text, x, y - CHAR_H - 10);
  }

  function themedProp(id, t) {
    const P = (x, y, w, h, col) => { lg.fillStyle = col; lg.fillRect(x, y, w, h); };
    const x = ROOM_W - 64, y = WALL_H + 2;
    switch (id) {
      case "studio": {
        const glow = 0.7 + Math.sin(t * 3) * 0.2;
        lg.strokeStyle = PAL.out; lg.lineWidth = 3; lg.beginPath(); lg.arc(x, y + 2, 6, 0, 7); lg.stroke();
        lg.strokeStyle = `rgba(255,250,225,${glow})`; lg.lineWidth = 1.5; lg.beginPath(); lg.arc(x, y + 2, 6, 0, 7); lg.stroke(); lg.lineWidth = 1;
        P(x - 1, y + 8, 2, 14, "#2b2b33"); P(x - 5, y + 21, 10, 2, "#2b2b33"); break;
      }
      case "bank": P(x - 9, y, 18, 18, PAL.out); P(x - 8, y + 1, 16, 16, "#5b6670"); P(x - 7, y + 2, 14, 14, "#6f7b86"); lg.fillStyle = "#cfd6dd"; lg.beginPath(); lg.arc(x, y + 9, 4, 0, 7); lg.fill(); P(x - 1, y + 8, 2, 2, PAL.out); break;
      case "travel": P(x - 1, y + 12, 2, 8, PAL.wd1); P(x - 5, y + 19, 10, 2, PAL.wd1); lg.fillStyle = PAL.out; lg.beginPath(); lg.arc(x, y + 5, 8, 0, 7); lg.fill(); lg.fillStyle = "#3a7bd5"; lg.beginPath(); lg.arc(x, y + 5, 7, 0, 7); lg.fill(); P(x - 4, y + 1, 4, 3, "#4fae5a"); P(x + 1, y + 6, 4, 3, "#4fae5a"); break;
      case "inbox": P(x - 9, y, 18, 20, PAL.out); P(x - 8, y + 1, 16, 18, "#9aa3ad"); for (let i = 0; i < 3; i++) { P(x - 7, y + 2 + i * 6, 14, 5, "#b9c1c9"); P(x - 2, y + 4 + i * 6, 4, 1, PAL.out); } break;
      case "workshop": P(x - 11, y + 2, 22, 14, PAL.out); P(x - 10, y + 3, 20, 12, "#1e2a24"); for (let i = 0; i < 3; i++) P(x - 8, y + 5 + i * 3, ((t * 9 + i * 5) % 15) | 0, 1, "#6fcf7f"); break;
      case "library": case "archive": P(x - 9, y, 18, 20, PAL.out); P(x - 8, y + 1, 16, 18, "#8e6c8a"); for (let i = 0; i < 3; i++) { P(x - 7, y + 2 + i * 6, 14, 5, "#d8c9a0"); P(x - 1, y + 4 + i * 6, 2, 1, PAL.out); } break;
      case "recruiting": P(x - 13, y + 2, 26, 12, PAL.out); P(x - 12, y + 3, 24, 10, "#f2c230"); { let cx = x - 11; for (const ch of "HIRING") { bitmap(lg, cx, y + 5, FONT[ch], { "#": PAL.out }); cx += 4; } } break;
      case "home": P(x - 10, y + 4, 20, 14, PAL.out); P(x - 9, y + 5, 18, 12, "#c0504d"); P(x - 9, y + 5, 18, 3, "#d9706c"); break;
    }
  }

  function updateFx(dt) {
    if (rand() < dt * 3) for (const [id, b] of Object.entries(LAYOUT)) if (id !== "town_hall" && id !== "studio" && rand() < 0.5)
      smoke.push({ x: b.x * T + b.w * T - 20 + rand() * 4, y: b.y * T - 12, life: 1 });
    for (const s of smoke) { s.y -= dt * 9; s.x += dt * (3 + Math.sin(s.y / 6)); s.life -= dt * 0.28; }
    while (smoke.length && smoke[0].life <= 0) smoke.shift();
    for (const s of sparkles) s.life -= dt * 2;
    while (sparkles.length && sparkles[0].life <= 0) sparkles.shift();
    if (birds.length < 1 && rand() < dt * 0.08) birds.push({ x: -20, y: 20 + rand() * (H * T - 80), v: 40 + rand() * 20 });
    for (const b of birds) b.x += b.v * dt;
    for (let i = birds.length - 1; i >= 0; i--) if (birds[i].x > W * T + 40) birds.splice(i, 1);
  }

  function updateHint() {
    let text = "←↑↓→ walk · Shift run · T talk · MM Chief of Staff · G nav mesh · ? help";
    const n = nearest();
    if (n) text = `Press T to talk to ${n.name} (${n.title})`;
    else if (scene !== "town") text = "Walk out the bottom door to leave";
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
    const pc = $("portrait").getContext("2d"); pc.imageSmoothingEnabled = false; pc.clearRect(0, 0, 32, 32);
    pc.drawImage(charSprite(lookOf(p), 0, 0), 0, 0, SPR_W, 16, 0, 2, 36, 32);
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
  function renderReview() {
    const list = $("review-list"); list.innerHTML = "";
    const items = [...roster.review].reverse();
    if (!items.length) list.innerHTML = '<p class="muted">No deliverables yet. Give your Chief of Staff a to-do.</p>';
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

  // ------------------------------------------------------------------ boot
  async function refresh() {
    roster = await api("/api/state");
    $("brain").textContent = roster.brain_label || (roster.brain === "claude" ? "Claude CLI" : "offline");
    $("brain").className = "badge " + roster.brain;
    $("brain").title = roster.brain === "claude" ? "Agents are thinking with Claude" : "No Claude available here — placeholder replies";
    const pending = roster.review.filter((r) => r.status === "pending_review").length;
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
  for (const k of ["lamp", "bench", "mailbox", "signpost"]) world.props[k] = drawProp(k);
  for (const id of Object.keys(LAYOUT)) world.houses[id] = drawHouse(id);
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
