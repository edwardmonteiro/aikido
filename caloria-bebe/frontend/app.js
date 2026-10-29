"use strict";

// API base: same origin by default (Caddy proxies /api). Override for local dev:
// localStorage.setItem("apiBase", "http://localhost:8000")
const API = (() => { try { return localStorage.getItem("apiBase") || ""; } catch { return ""; } })();
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
const KINDS = {
  formula: "Fórmula", breast_milk: "Leite materno (mamadeira)", breast: "Peito", solid: "Sólidos",
};
const app = document.getElementById("app");

// --- state & api -----------------------------------------------------------
const store = {
  get token() { try { return localStorage.getItem("token"); } catch { return null; } },
  set token(v) { try { v ? localStorage.setItem("token", v) : localStorage.removeItem("token"); } catch {} },
};
let foods = null;

async function api(path, { method = "GET", body, query } = {}) {
  const url = new URL(API + "/api" + path, location.origin);
  if (query) Object.entries(query).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const headers = { "Content-Type": "application/json" };
  if (store.token) headers.Authorization = "Bearer " + store.token;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401 && !path.startsWith("/auth")) { store.token = null; go("#/login"); throw new Error("Sessão expirada"); }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errorText(data.detail) || `Erro ${res.status}`);
  return data;
}
function errorText(detail) {
  if (!detail) return "";
  if (typeof detail === "string") return detail;
  return detail.map((d) => d.msg.replace(/^Value error, /, "")).join("; ");
}

// --- tiny helpers ----------------------------------------------------------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n, d = 0) => n == null ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: d });
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: TZ }); // YYYY-MM-DD
const go = (hash) => { if (location.hash !== hash) location.hash = hash; else route(); };
function localInputNow() {
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
function withOffset(local) { return new Date(local).toISOString(); } // browser-local → UTC ISO
function formData(form) {
  const out = {};
  for (const [k, v] of new FormData(form)) if (v !== "") out[k] = v;
  return out;
}
function bindForm(form, handler) {
  const err = form.querySelector(".error");
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); if (err) err.textContent = "";
    const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
    try { await handler(formData(form)); } catch (x) { if (err) err.textContent = x.message; }
    finally { btn.disabled = false; }
  });
}
function nav(user) {
  document.getElementById("nav").innerHTML = user
    ? `<span>${esc(user.name)}</span><button class="link" id="logout">Sair</button>` : "";
  const b = document.getElementById("logout");
  if (b) b.onclick = () => { store.token = null; go("#/login"); };
}

// --- views -----------------------------------------------------------------
function viewAuth(mode) {
  nav(null);
  const reg = mode === "register";
  app.innerHTML = `
    <div class="card auth">
      <h1>${reg ? "Criar conta" : "Entrar"}</h1>
      <form>
        ${reg ? `<label>Nome<input name="name" required autocomplete="name"></label>` : ""}
        <label>E-mail<input name="email" type="email" required autocomplete="email"></label>
        <label>Senha<input name="password" type="password" required minlength="${reg ? 8 : 1}"
          autocomplete="${reg ? "new-password" : "current-password"}"></label>
        <p class="error"></p>
        <button type="submit">${reg ? "Criar conta" : "Entrar"}</button>
      </form>
      <p class="muted">${reg ? `Já tem conta? <a href="#/login">Entrar</a>` : `Novo por aqui? <a href="#/register">Criar conta</a>`}</p>
    </div>`;
  bindForm(app.querySelector("form"), async (d) => {
    const r = await api(reg ? "/auth/register" : "/auth/login", { method: "POST", body: d });
    store.token = r.access_token; go("#/");
  });
}

async function viewBabies() {
  const [me, babies] = await Promise.all([api("/me"), api("/babies")]);
  nav(me);
  app.innerHTML = `
    <h1>Seus bebês</h1>
    <div class="grid babies">
      ${babies.map((b) => `<a class="card" href="#/baby/${b.id}">
          <h2>${b.sex === "female" ? "👧" : "👦"} ${esc(b.name)}</h2>
          <span class="muted">Nascimento: ${new Date(b.birth_date + "T12:00").toLocaleDateString("pt-BR")}</span>
        </a>`).join("")}
      <div class="card">
        <h2>Adicionar bebê</h2>
        <form>
          <label>Nome<input name="name" required></label>
          <div class="row">
            <label>Nascimento<input name="birth_date" type="date" max="${today()}" required></label>
            <label>Sexo<select name="sex"><option value="female">Menina</option><option value="male">Menino</option></select></label>
          </div>
          <label>Peso atual (kg)<input name="weight_kg" type="number" step="0.01" min="0.5" max="39" placeholder="ex.: 5,4"></label>
          <p class="error"></p>
          <button type="submit">Adicionar</button>
        </form>
      </div>
    </div>`;
  bindForm(app.querySelector("form"), async ({ weight_kg, ...d }) => {
    const b = await api("/babies", { method: "POST", body: d });
    if (weight_kg) await api(`/babies/${b.id}/weights`, { method: "POST", body: { measured_on: today(), weight_kg: +weight_kg } });
    go(`#/baby/${b.id}`);
  });
}

async function viewBaby(id, day) {
  day = day || today();
  foods = foods || await api("/foods");
  const [me, baby, s, feedings, weights, hist] = await Promise.all([
    api("/me"), api(`/babies/${id}`),
    api(`/babies/${id}/summary`, { query: { date: day, tz: TZ } }),
    api(`/babies/${id}/feedings`, { query: { date: day, tz: TZ } }),
    api(`/babies/${id}/weights`),
    api(`/babies/${id}/history`, { query: { days: 14, tz: TZ } }),
  ]);
  nav(me);
  const pct = s.percent_of_target;
  const barCls = pct == null ? "" : pct < 70 ? "low" : pct < 90 ? "mid" : "";
  const maxH = Math.max(1, ...hist.map((h) => Math.max(h.total_kcal, h.target_kcal || 0)));
  const tgt = hist.at(-1)?.target_kcal;

  app.innerHTML = `
    <p><a href="#/">← Bebês</a></p>
    <h1>${esc(baby.name)} <span class="muted">· ${s.age_months} ${s.age_months === 1 ? "mês" : "meses"}${s.weight_kg ? ` · ${fmt(s.weight_kg, 2)} kg` : ""}</span></h1>
    <div class="daynav">
      <input type="date" id="day" value="${day}" max="${today()}">
      ${day !== today() ? `<button class="ghost" id="today">Hoje</button>` : ""}
    </div>
    <div class="grid">
      <div class="card">
        <h2>Calorias do dia</h2>
        <div class="big">${fmt(s.total_kcal)} <small class="muted">kcal</small></div>
        ${s.target_kcal ? `
          <div class="bar ${barCls}"><span style="width:${Math.min(100, pct)}%"></span></div>
          <div class="muted">${fmt(pct)}% da meta de ${fmt(s.target_kcal)} kcal (${fmt(s.kcal_per_kg_reference)} kcal/kg)</div>`
        : `<p class="muted">${s.kcal_per_kg_reference ? "Registre o peso para calcular a meta diária." : "Metas disponíveis até 24 meses."}</p>`}
        <div class="chips">
          ${Object.entries(s.by_kind).map(([k, v]) => `<span class="chip"><span class="dot" style="background:var(--${k})"></span>${KINDS[k]}: ${fmt(v)} kcal</span>`).join("")}
          ${s.total_ml ? `<span class="chip">${fmt(s.total_ml)} ml</span>` : ""}
        </div>
        ${s.unknown_kcal_feedings ? `<p class="muted">${s.unknown_kcal_feedings} mamada(s) no peito sem volume estimado — não somadas.</p>` : ""}
      </div>
      <div class="card">
        <h2>Registrar alimentação</h2>
        <form id="feed">
          <div class="row">
            <label>Tipo<select name="kind" id="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
            <label>Quando<input name="fed_at" type="datetime-local" value="${day === today() ? localInputNow() : day + "T12:00"}" required></label>
          </div>
          <div class="row">
            <label data-for="formula breast_milk breast">Volume (ml)<input name="amount_ml" type="number" min="1" max="1000" step="1"></label>
            <label data-for="breast">Duração (min)<input name="duration_min" type="number" min="1" max="180"></label>
            <label data-for="solid">Alimento<select name="food_id"><option value="">— outro —</option>${foods.map((f) => `<option value="${f.id}">${esc(f.name)} (${fmt(f.kcal_per_100g)} kcal/100g)</option>`).join("")}</select></label>
            <label data-for="solid">Quantidade (g)<input name="amount_g" type="number" min="1" max="1000"></label>
          </div>
          <label>kcal (opcional — substitui a estimativa)<input name="kcal" type="number" min="0" max="2000" step="0.1"></label>
          <p class="error"></p>
          <button type="submit">Salvar</button>
        </form>
      </div>
    </div>
    <div class="card">
      <h2>Registros de ${new Date(day + "T12:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</h2>
      ${feedings.length ? `<ul class="list">${feedings.map((f) => `<li>
          <span><span class="dot" style="background:var(--${f.kind})"></span>
            <strong>${new Date(f.fed_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</strong>
            · ${KINDS[f.kind]}${f.amount_ml ? ` · ${fmt(f.amount_ml)} ml` : ""}${f.amount_g ? ` · ${fmt(f.amount_g)} g` : ""}${f.duration_min ? ` · ${f.duration_min} min` : ""}${f.food_id ? ` · ${esc(foods.find((x) => x.id === f.food_id)?.name)}` : ""}</span>
          <span>${f.kcal == null ? "<span class='muted'>? kcal</span>" : fmt(f.kcal) + " kcal"}
            <button class="link" data-del-feed="${f.id}" aria-label="Excluir">✕</button></span>
        </li>`).join("")}</ul>` : `<p class="muted">Nenhum registro neste dia.</p>`}
    </div>
    <div class="grid">
      <div class="card">
        <h2>Últimos 14 dias</h2>
        <div class="history">
          ${tgt ? `<div class="target" style="bottom:${(100 * tgt) / maxH}%" title="Meta atual"></div>` : ""}
          ${hist.map((h) => `<div class="col" title="${h.date}: ${fmt(h.total_kcal)} kcal">
              <span class="b" style="height:${(100 * h.total_kcal) / maxH}%"></span>
              <small>${+h.date.slice(8)}</small></div>`).join("")}
        </div>
        <p class="muted">Linha tracejada: meta diária atual.</p>
      </div>
      <div class="card">
        <h2>Peso</h2>
        <form id="weight">
          <div class="row">
            <label>Data<input name="measured_on" type="date" value="${today()}" max="${today()}" required></label>
            <label>Peso (kg)<input name="weight_kg" type="number" step="0.01" min="0.5" max="39" required></label>
          </div>
          <p class="error"></p>
          <button type="submit">Registrar peso</button>
        </form>
        <ul class="list">${weights.slice().reverse().map((w) => `<li>
          <span>${new Date(w.measured_on + "T12:00").toLocaleDateString("pt-BR")}</span>
          <span>${fmt(w.weight_kg, 2)} kg <button class="link" data-del-weight="${w.id}" aria-label="Excluir">✕</button></span></li>`).join("")}</ul>
      </div>
    </div>
    <p><button class="ghost" id="delbaby">Excluir ${esc(baby.name)}</button></p>`;

  const reload = () => viewBaby(id, day);
  const kindSel = app.querySelector("#kind");
  const syncKind = () => app.querySelectorAll("[data-for]").forEach((el) => {
    const on = el.dataset.for.split(" ").includes(kindSel.value);
    el.hidden = !on; if (!on) el.querySelector("input,select").value = "";
  });
  kindSel.onchange = syncKind; syncKind();

  bindForm(app.querySelector("#feed"), async (d) => {
    const body = { kind: d.kind, fed_at: withOffset(d.fed_at) };
    for (const k of ["amount_ml", "amount_g", "duration_min", "food_id", "kcal"]) if (d[k]) body[k] = +d[k];
    await api(`/babies/${id}/feedings`, { method: "POST", body }); reload();
  });
  bindForm(app.querySelector("#weight"), async (d) => {
    await api(`/babies/${id}/weights`, { method: "POST", body: { ...d, weight_kg: +d.weight_kg } }); reload();
  });
  app.querySelector("#day").onchange = (e) => e.target.value && go(`#/baby/${id}/${e.target.value}`);
  const t = app.querySelector("#today"); if (t) t.onclick = () => go(`#/baby/${id}`);
  app.querySelectorAll("[data-del-feed]").forEach((b) => b.onclick = async () => {
    if (confirm("Excluir este registro?")) { await api(`/feedings/${b.dataset.delFeed}`, { method: "DELETE" }); reload(); }
  });
  app.querySelectorAll("[data-del-weight]").forEach((b) => b.onclick = async () => {
    if (confirm("Excluir este peso?")) { await api(`/weights/${b.dataset.delWeight}`, { method: "DELETE" }); reload(); }
  });
  app.querySelector("#delbaby").onclick = async () => {
    if (confirm(`Excluir ${baby.name} e todos os registros? Isso não pode ser desfeito.`)) {
      await api(`/babies/${id}`, { method: "DELETE" }); go("#/");
    }
  };
}

// --- router ----------------------------------------------------------------
async function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  try {
    if (parts[0] === "login" || parts[0] === "register") return viewAuth(parts[0]);
    if (!store.token) return go("#/login");
    if (parts[0] === "baby" && parts[1]) return await viewBaby(+parts[1], parts[2]);
    return await viewBabies();
  } catch (e) {
    app.innerHTML = `<div class="card"><p class="error">${esc(e.message)}</p><a href="#/">Voltar</a></div>`;
  }
}
window.addEventListener("hashchange", route);
route();
