/* Mobile port of `aikido daily` (src/aikido/commands/daily.py).
 * The rendered Markdown must stay byte-identical to DailyCapture._render so a
 * log captured on the phone drops straight into 01_weekly_cadence/{week}/.
 * tests/test_android_daily.py checks TAG_KEYWORDS and DAY_TYPES stay in sync. */
(function () {
  "use strict";

  var TAG_KEYWORDS = {
    "pricing": ["pricing", "price", "seat"],
    "sso": ["sso", "auth"],
    "onboarding": ["onboard", "signup"],
    "churn": ["churn", "cancel"],
    "enterprise": ["enterprise", "sales"],
    "revenue": ["revenue", "mrr"],
    "runway": ["runway", "burn"]
  };
  var DAY_TYPES = ["meeting-heavy", "shipping", "firefighting", "planning", "research"];
  var DEFAULTS = { ships: "none", blockers: "none", customer: "none", people: "solo" };
  var DRAFT_KEY = "aikido-daily-draft";

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  // ISO-8601 week label, matching datetime.isocalendar(): YYYY-Www.
  function weekOf(date) {
    var p = date.split("-");
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    var dow = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dow); // Thursday decides the ISO year
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return d.getUTCFullYear() + "-W" + pad(week);
  }

  function deriveTags(text) {
    var lowered = text.toLowerCase();
    var tags = [];
    Object.keys(TAG_KEYWORDS).forEach(function (tag) {
      if (TAG_KEYWORDS[tag].some(function (k) { return lowered.indexOf(k) !== -1; })) {
        tags.push("#" + tag);
      }
    });
    return tags.length ? tags.join(" ") : "#daily";
  }

  function render(d) {
    return "## Daily Log: " + d.date + "\n" +
      "### Type\n" + d.type + "\n" +
      "### Ships\n" + d.ships + "\n" +
      "### Blockers\n" + d.blockers + "\n" +
      "### Customer Moment\n" + d.customer + "\n" +
      "### Takeaway\n" + d.takeaway + "\n" +
      "### People\n" + d.people + "\n" +
      "### Tags\n" + d.tags;
  }

  var form = document.getElementById("daily");
  var fields = ["date", "type", "ships", "blockers", "customer", "takeaway", "people"];
  var preview = document.getElementById("preview");
  var pathEl = document.getElementById("path");
  var status = document.getElementById("status");

  var typeSel = form.elements.type;
  DAY_TYPES.forEach(function (t) {
    var o = document.createElement("option");
    o.value = o.textContent = t;
    typeSel.appendChild(o);
  });
  typeSel.value = "shipping";

  function collect() {
    var d = {};
    fields.forEach(function (f) {
      var v = form.elements[f].value.trim();
      d[f] = v || DEFAULTS[f] || "";
    });
    d.date = d.date || today();
    d.tags = deriveTags(d.ships + " " + d.blockers + " " + d.customer + " " + d.takeaway);
    return d;
  }

  function filename(d) { return d.date + "_daily.md"; }

  function update() {
    var d = collect();
    preview.textContent = render(d);
    pathEl.textContent = "01_weekly_cadence/" + weekOf(d.date) + "/" + filename(d);
    try {
      var raw = {};
      fields.forEach(function (f) { raw[f] = form.elements[f].value; });
      localStorage.setItem(DRAFT_KEY, JSON.stringify(raw));
    } catch (e) { /* storage unavailable: drafts just don't persist */ }
  }

  function flash(msg) {
    status.textContent = msg;
    setTimeout(function () { if (status.textContent === msg) status.textContent = ""; }, 2500);
  }

  function ready() {
    if (form.elements.takeaway.value.trim()) return true;
    form.elements.takeaway.focus();
    flash("A one-sentence takeaway is required.");
    return false;
  }

  var bridge = window.AikidoAndroid;

  document.getElementById("save").addEventListener("click", function () {
    if (!ready()) return;
    var d = collect();
    if (bridge) {
      bridge.save(filename(d), render(d));
    } else {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([render(d)], { type: "text/markdown" }));
      a.download = filename(d);
      a.click();
    }
  });

  document.getElementById("share").addEventListener("click", function () {
    if (!ready()) return;
    var d = collect();
    if (bridge) {
      bridge.share(filename(d), render(d));
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(render(d)).then(function () { flash("Copied to clipboard."); });
    }
  });

  document.getElementById("reset").addEventListener("click", function () {
    form.reset();
    form.elements.date.value = today();
    typeSel.value = "shipping";
    update();
  });

  try {
    var saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (saved) fields.forEach(function (f) { if (saved[f] != null) form.elements[f].value = saved[f]; });
  } catch (e) { /* ignore a corrupt draft */ }
  if (!form.elements.date.value) form.elements.date.value = today();

  form.addEventListener("input", update);
  form.addEventListener("change", update);
  update();

  if (!bridge) document.getElementById("share").textContent = "Copy";
})();
