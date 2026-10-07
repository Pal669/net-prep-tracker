// NET Prep Tracker — reads data/tracker.json (built by Economics/tracker/build_tracker.py) and renders it.
(function () {
  "use strict";
  var D = null;
  var view = document.getElementById("view");
  var tip = document.getElementById("tip");
  var TABS = [["today", "Today"], ["syllabus", "Syllabus"], ["performance", "Performance"], ["activity", "Activity"], ["tests", "Tests"]];
  var STATUS = ["not_started", "learning", "understood", "practising", "mastered"];
  var SVAR = { not_started: "--s-not", learning: "--s-learning", understood: "--s-understood", practising: "--s-practising", mastered: "--s-mastered" };
  var LVL = { high: ["!", "Act now"], medium: ["!", "Attention"], low: ["~", "Watch"], good: ["+", "Good"], info: ["i", "Info"] };
  var paperSel = "P2";

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmtDate(iso) { if (!iso) return ""; var d = new Date(iso + "T00:00:00"); return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
  function pctOf(a, b) { return b ? Math.round(100 * a / b) : 0; }

  // ---------- theme (per-viewer convenience only)
  var root = document.documentElement;
  try { var saved = localStorage.getItem("theme"); if (saved) root.setAttribute("data-theme", saved); } catch (e) {}
  document.getElementById("theme").addEventListener("click", function () {
    var cur = root.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    var next = cur === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch (e) {}
  });

  // ---------- tooltip
  function bindTips(el) {
    el.querySelectorAll("[data-tip]").forEach(function (n) {
      function show(ev) {
        tip.innerHTML = n.getAttribute("data-tip"); tip.hidden = false;
        var r = n.getBoundingClientRect(), x = ev && ev.clientX != null ? ev.clientX : r.left + r.width / 2, y = ev && ev.clientY != null ? ev.clientY : r.top;
        var w = tip.offsetWidth, h = tip.offsetHeight;
        tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, x - w / 2)) + "px";
        tip.style.top = Math.max(8, y - h - 12) + "px";
      }
      n.addEventListener("mousemove", show); n.addEventListener("focus", show);
      n.addEventListener("mouseleave", function () { tip.hidden = true; }); n.addEventListener("blur", function () { tip.hidden = true; });
    });
  }

  // ---------- tabs
  var tabsEl = document.getElementById("tabs");
  TABS.forEach(function (t) {
    var b = document.createElement("button");
    b.type = "button"; b.textContent = t[1]; b.setAttribute("role", "tab"); b.dataset.tab = t[0];
    b.addEventListener("click", function () { go(t[0]); });
    tabsEl.appendChild(b);
  });
  function go(tab) {
    tabsEl.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.tab === tab ? "true" : "false"); });
    try { localStorage.setItem("tab", tab); } catch (e) {}
    if (location.hash !== "#" + tab) history.replaceState(null, "", "#" + tab);
    view.innerHTML = RENDER[tab]();
    bindTips(view);
    view.querySelectorAll("[data-paper]").forEach(function (b) { b.addEventListener("click", function () { paperSel = b.dataset.paper; go("syllabus"); }); });
  }

  // ---------- building blocks
  function stat(label, value, note) { return '<div class="card stat"><div class="label">' + label + '</div><div class="value">' + value + '</div>' + (note ? '<div class="note">' + note + "</div>" : "") + "</div>"; }
  function segBar(counts, total) {
    var html = '<div class="seg" role="img" aria-label="' + STATUS.map(function (s) { return D.status_labels[s] + " " + counts[s]; }).join(", ") + '">';
    STATUS.slice().reverse().forEach(function (s) {
      if (!counts[s]) return;
      html += '<span style="width:' + (100 * counts[s] / total) + '%;background:var(' + SVAR[s] + ')" data-tip="' + esc(D.status_labels[s]) + ": " + counts[s] + ' topic' + (counts[s] === 1 ? "" : "s") + '"></span>';
    });
    return html + "</div>";
  }
  function legend() {
    return '<div class="legend">' + STATUS.slice().reverse().map(function (s) { return '<span><b style="background:var(' + SVAR[s] + ')"></b>' + esc(D.status_labels[s]) + "</span>"; }).join("") + "</div>";
  }
  function chip(s) { return '<span class="chip"><b style="background:var(' + SVAR[s] + ')"></b>' + esc(D.status_labels[s].replace(" (test pending)", "")) + "</span>"; }
  function accBars(items, opts) {
    opts = opts || {};
    if (!items.length) return '<p class="empty">' + (opts.empty || "No graded answers yet.") + "</p>";
    var th = D.thresholds;
    return '<div class="bars">' + items.map(function (it) {
      var p = it.pct == null ? 0 : it.pct;
      var thin = it.n < (opts.minN || 1);
      var t = esc(it.label) + "<br>" + it.right + " of " + it.n + " correct (" + p + "%)" + (thin ? "<br><em>Too few answers to judge</em>" : "");
      return '<div class="bar-row" tabindex="0" data-tip="' + t + '"><span class="lab">' + esc(it.label) + '</span><span class="bar-track">' +
        '<span class="ref" style="left:' + th.weak_pct + '%"></span><span class="ref" style="left:' + th.strong_pct + '%"></span>' +
        '<span class="bar-fill" style="width:' + p + '%;' + (thin ? "opacity:.45" : "") + '"></span></span><span class="v">' + p + '%<small> n=' + it.n + "</small></span></div>";
    }).join("") + '</div><p class="small" style="margin-top:8px">Dashed lines: ' + th.weak_pct + "% (weak) and " + th.strong_pct + "% (strong). Faded bars have too few answers to judge.</p>";
  }
  function nudgeList(ns) {
    if (!ns.length) return '<p class="empty">Nothing needs attention right now.</p>';
    return ns.map(function (n) {
      var l = LVL[n.level] || LVL.info;
      return '<div class="nudge"><span class="lvl ' + n.level + '"><i aria-hidden="true">' + l[0] + "</i>" + l[1] + '</span><div><div class="t">' + esc(n.title) +
        '</div><div class="w">' + esc(n.why) + "</div>" + (n.action ? '<div class="a">' + esc(n.action) + "</div>" : "") + "</div></div>";
    }).join("");
  }
  function paperByKey(k) { return D.papers.filter(function (p) { return p.key === k; })[0]; }
  function unitLabel(p, u) { return (p.key === "P1" ? "I-" : "") + u.unit + " " + u.name; }

  // ---------- views
  var RENDER = {
    today: function () {
      var p2 = paperByKey("P2"), p1 = paperByKey("P1"), ex = D.exam, o = D.overall;
      var html = '<div class="grid g4">' +
        stat("Days to exam", ex.days_left, fmtDate(ex.date) + ' <span class="tag">' + esc(ex.label) + "</span>") +
        stat("Paper II done", pctOf(p2.done, p2.total) + "%", p2.done + " of " + p2.total + " topics understood or better") +
        stat("Paper I done", pctOf(p1.done, p1.total) + "%", p1.done + " of " + p1.total + " topics") +
        stat("Accuracy", o.n ? o.pct + "%" : "&ndash;", o.n + " graded answers · " + D.streak + "-day streak") + "</div>";
      html += '<div class="grid g2"><div class="card"><h2>What to do now</h2>' + nudgeList(D.nudges) + "</div>";
      var nu = D.next_up;
      html += '<div class="card"><h2>Next lesson</h2>' + (nu ? "<p><strong>" + esc(nu.id + " " + nu.name) + '</strong></p><p class="muted">Unit ' + nu.unit + " — " + esc(nu.unit_name) + " · " + chip(nu.status) + "</p>" +
        (nu.note ? '<p class="small">' + esc(nu.note) + "</p>" : "") + '<p class="small">Say "next lesson" to the economics teacher.</p>' : '<p class="empty">All Paper II topics are done.</p>');
      var pc = D.pace;
      html += '<h3 style="margin-top:14px">Pace (Paper II)</h3><ul class="list">' +
        "<li><span>Topics left</span><span class=num>" + pc.remaining + "</span></li>" +
        "<li><span>Needed per week to finish by the exam</span><span class=num>" + pc.needed_per_week + "</span></li>" +
        "<li><span>Your rate (last 14 days)</span><span class=num>" + pc.rate_per_week + "/week</span></li>" +
        "<li><span>Projected finish</span><span class=num>" + (pc.projected_finish ? fmtDate(pc.projected_finish) : "needs a completed topic") + "</span></li></ul>";
      html += '<h3 style="margin-top:14px">Revision due</h3>' + (D.revision_due.length ? '<ul class="list">' + D.revision_due.map(function (m) {
        return "<li><span>" + esc(m.topic + " — " + m.question) + "</span><span class=num>" + esc(m.cause) + "</span></li>"; }).join("") + "</ul>" :
        '<p class="empty">Nothing due.' + (D.revision_upcoming ? " " + D.revision_upcoming + " coming up." : "") + "</p>") + "</div></div>";
      return html;
    },

    syllabus: function () {
      var html = '<div class="card"><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">' + D.papers.map(function (p) {
        return '<button type="button" class="theme" data-paper="' + p.key + '" aria-pressed="' + (p.key === paperSel) + '"' + (p.key === paperSel ? ' style="border-color:var(--accent);color:var(--ink)"' : "") + ">" + esc(p.name) + " · " + p.marks + " marks</button>";
      }).join("") + "</div>";
      var p = paperByKey(paperSel);
      html += "<p class=muted>" + p.done + " of " + p.total + " topics understood or better · units in learning order</p>" + segBar(p.counts, p.total) + legend() + "</div>";
      var flags = {};
      D.pace.unit_flags.forEach(function (f) { flags[f.paper + ":" + f.unit] = f.flag; });
      html += '<div class="card">' + p.units.map(function (u) {
        var flag = flags[p.key + ":" + u.unit];
        var acc = u.acc ? u.acc.pct + "% correct (n=" + u.acc.n + ")" : "no answers yet";
        return '<div class="unit"><div class="unit-head"><span class="nm">' + esc(unitLabel(p, u)) + '</span><span class="small">' + u.done + "/" + u.total + " · " + acc +
          (u.target ? " · plan " + fmtDate(u.target) : "") + (flag ? ' <span class="tag">' + flag.toUpperCase() + "</span>" : "") + (u.open_mistakes ? " · " + u.open_mistakes + " open mistakes" : "") + "</span></div>" +
          segBar(u.counts, u.total) + "<details><summary>Topics</summary><ul class=topics>" + u.topics.map(function (t) {
            return "<li><span class=small>" + esc(t.id) + "</span><span>" + esc(t.name) + (t.acc ? ' <span class="small">· ' + t.acc.pct + "% (n=" + t.acc.n + ")</span>" : "") + "</span>" + chip(t.status) + "</li>";
          }).join("") + "</ul></details></div>";
      }).join("") + "</div>";
      return html;
    },

    performance: function () {
      var th = D.thresholds;
      function sw(list, kind) {
        return list.length ? '<ul class="list">' + list.slice(0, 6).map(function (x) { return "<li><span>" + esc(x.label) + "</span><span class=num>" + x.pct + "% · n=" + x.n + "</span></li>"; }).join("") + "</ul>" : '<p class="empty">None yet' + (kind ? " (" + kind + ")" : "") + ".</p>";
      }
      var html = '<div class="grid g2"><div class="card"><h2>Strong points</h2><p class="small">' + th.strong_pct + "%+ with enough answers</p><h3>Units</h3>" + sw(D.strengths.units, "needs " + th.min_n_unit + "+ answers per unit") +
        "<h3 style='margin-top:10px'>Topics</h3>" + sw(D.strengths.topics) + "<h3 style='margin-top:10px'>Question formats</h3>" + sw(D.strengths.formats) + "</div>" +
        '<div class="card"><h2>Where you are lacking</h2><p class="small">Below ' + th.weak_pct + "% with enough answers</p><h3>Units</h3>" + sw(D.weaknesses.units, "needs " + th.min_n_unit + "+ answers per unit") +
        "<h3 style='margin-top:10px'>Topics</h3>" + sw(D.weaknesses.topics) + "<h3 style='margin-top:10px'>Question formats</h3>" + sw(D.weaknesses.formats) + "</div></div>";

      var units = [];
      D.papers.forEach(function (p) { p.units.forEach(function (u) { if (u.acc) units.push({ label: (p.key === "P1" ? "Paper I · " : "") + "U" + u.unit + " " + u.name, right: u.acc.right, n: u.acc.n, pct: u.acc.pct }); }); });
      html += '<div class="card"><h2>Accuracy by unit</h2>' + accBars(units, { minN: th.min_n_unit }) + "</div>";
      html += '<div class="card"><h2>Accuracy trend</h2><p class="small">Rolling 7-day accuracy, last 30 days</p>' + trendChart() + "</div>";
      function mapItems(obj) { return Object.keys(obj).map(function (k) { return { label: k, right: obj[k].right, n: obj[k].n, pct: obj[k].pct }; }).sort(function (a, b) { return b.n - a.n; }); }
      html += '<div class="grid g2"><div class="card"><h2>By question format</h2>' + accBars(mapItems(D.by_format), { minN: th.min_n_format }) + "</div>" +
        '<div class="card"><h2>By source</h2>' + accBars(mapItems(D.by_source)) + "</div></div>";
      var causes = Object.keys(D.causes).map(function (k) { return { label: k, n: D.causes[k] }; }).sort(function (a, b) { return b.n - a.n; });
      var tot = causes.reduce(function (s, c) { return s + c.n; }, 0);
      html += '<div class="card"><h2>Why answers go wrong</h2>' + (tot ? '<div class="bars">' + causes.map(function (c) {
        var p = Math.round(100 * c.n / tot);
        return '<div class="bar-row" tabindex="0" data-tip="' + esc(c.label) + ": " + c.n + " of " + tot + ' classified mistakes"><span class="lab">' + esc(c.label) + '</span><span class="bar-track"><span class="bar-fill" style="width:' + p + '%"></span></span><span class="v">' + p + "%<small> " + c.n + "</small></span></div>";
      }).join("") + "</div>" : '<p class="empty">Causes are recorded when the teacher grades a test (concept gap, recall, careless).</p>') +
        (D.untagged ? '<p class="small" style="margin-top:8px">' + D.untagged + " answers have no topic tag and count only in the paper totals.</p>" : "") + "</div>";
      return html;
    },

    activity: function () {
      var cells = D.calendar.map(function (c) {
        var lv = c.q + c.sit * 5;
        var k = lv === 0 ? 0 : lv < 5 ? 1 : lv < 12 ? 2 : lv < 25 ? 3 : 4;
        return '<span tabindex="0" style="background:var(--heat-' + k + ')" data-tip="' + fmtDate(c.date) + "<br>" + c.q + " questions · " + c.sit + " study sitting" + (c.sit === 1 ? "" : "s") + (c.min ? " · " + c.min + " min" : "") + '"></span>';
      }).join("");
      var html = '<div class="grid g4">' + stat("Current streak", D.streak + " day" + (D.streak === 1 ? "" : "s")) + stat("Active days (30)", D.active_days_30) +
        stat("Last activity", D.last_active ? fmtDate(D.last_active) : "&ndash;") + stat("Revision due", D.revision_due.length) + "</div>";
      html += '<div class="card"><h2>Last 12 weeks</h2><p class="small">Each square is a day (columns are weeks, Monday on top). Darker = more questions answered and study sittings.</p><div class="cal">' + cells + "</div>" +
        '<div class="legend"><span>Less</span>' + [0, 1, 2, 3, 4].map(function (k) { return '<span><b style="background:var(--heat-' + k + ')"></b></span>'; }).join("") + "<span>More</span></div></div>";
      html += '<div class="card"><h2>Answers per day</h2>' + volumeChart() + "</div>";
      return html;
    },

    tests: function () {
      var html = '<div class="card"><h2>Tests and past-paper sets</h2>' + (D.tests.length ? '<div class="scroll"><table><thead><tr><th>Date</th><th>Source</th><th>Topic</th><th class="n">Score</th><th class="n">%</th></tr></thead><tbody>' +
        D.tests.map(function (t) { return "<tr><td>" + fmtDate(t.date) + "</td><td>" + esc(t.source) + "</td><td>" + esc((t.paper === "P1" ? "Paper I " : "") + t.topic + " " + t.topic_name) + '</td><td class="n">' + t.right + "/" + t.n + '</td><td class="n">' + t.pct + "</td></tr>"; }).join("") +
        "</tbody></table></div>" : '<p class="empty">No tests yet. Tests start when you tell the teacher "I understood everything".</p>') + "</div>";
      html += '<div class="card"><h2>Full mock tests</h2>' + (D.mocks.length ? '<div class="scroll"><table><thead><tr><th>Date</th><th>Paper</th><th class="n">Score</th><th>Note</th></tr></thead><tbody>' +
        D.mocks.map(function (m) { return "<tr><td>" + fmtDate(m.date) + "</td><td>" + esc(m.paper) + '</td><td class="n">' + esc(m.score) + "/" + esc(m.max) + "</td><td>" + esc(m.note) + "</td></tr>"; }).join("") +
        "</tbody></table></div>" : '<p class="empty">No full mocks yet.</p>') + "</div>";
      return html;
    }
  };

  // ---------- SVG charts (single series, one axis)
  function frame(w, h) { return '<svg viewBox="0 0 ' + w + " " + h + '" width="100%" role="img" style="display:block;max-height:240px">'; }
  function trendChart() {
    var pts = D.trend, W = 640, H = 220, L = 34, R = 10, T = 10, B = 26;
    var have = pts.filter(function (p) { return p.roll_pct != null; });
    if (!have.length) return '<p class="empty">No graded answers in the last 30 days.</p>';
    var x = function (i) { return L + i * (W - L - R) / (pts.length - 1); }, y = function (v) { return T + (100 - v) * (H - T - B) / 100; };
    var s = frame(W, H);
    [0, 50, 100].forEach(function (v) { s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--grid)"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + "%</text>"; });
    [D.thresholds.weak_pct, D.thresholds.strong_pct].forEach(function (v) { s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--axis)" stroke-dasharray="4 4"/>'; });
    var path = "", started = false;
    pts.forEach(function (p, i) { if (p.roll_pct == null) { started = false; return; } path += (started ? "L" : "M") + x(i).toFixed(1) + " " + y(p.roll_pct).toFixed(1); started = true; });
    s += '<path d="' + path + '" fill="none" stroke="var(--series)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    pts.forEach(function (p, i) {
      if (p.roll_pct == null) return;
      s += '<circle cx="' + x(i) + '" cy="' + y(p.roll_pct) + '" r="4" fill="var(--series)" stroke="var(--surface)" stroke-width="2"/>' +
        '<rect x="' + (x(i) - 9) + '" y="' + T + '" width="18" height="' + (H - T - B) + '" fill="transparent" tabindex="0" data-tip="' + fmtDate(p.date) + "<br>7-day: " + p.roll_pct + "% (n=" + p.roll_n + ")" + (p.n ? "<br>That day: " + p.pct + "% (n=" + p.n + ")" : "") + '"/>';
    });
    [0, 14, 29].forEach(function (i) { s += '<text x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="' + (i === 0 ? "start" : i === 29 ? "end" : "middle") + '">' + fmtDate(pts[i].date).replace(/ \d{4}$/, "") + "</text>"; });
    return s + "</svg>";
  }
  function volumeChart() {
    var pts = D.trend, W = 640, H = 180, L = 34, R = 10, T = 10, B = 26;
    var max = Math.max.apply(null, pts.map(function (p) { return p.n; }).concat([5]));
    var bw = (W - L - R) / pts.length, y = function (v) { return T + (max - v) * (H - T - B) / max; };
    var s = frame(W, H);
    [0, max].forEach(function (v) { s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--grid)"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + "</text>"; });
    pts.forEach(function (p, i) {
      var h = y(0) - y(p.n);
      var rr = Math.min(3, h, (bw - 2) / 2);
      if (p.n) s += '<path d="M' + (L + i * bw + 1) + " " + y(0) + "V" + (y(p.n) + rr) + "q0 -" + rr + " " + rr + " -" + rr + "h" + (bw - 2 - 2 * rr) + "q" + rr + " 0 " + rr + " " + rr + "V" + y(0) + 'Z" fill="var(--series)"/>';
      s += '<rect x="' + (L + i * bw) + '" y="' + T + '" width="' + bw + '" height="' + (H - T - B) + '" fill="transparent" tabindex="0" data-tip="' + fmtDate(p.date) + "<br>" + p.n + " answers" + (p.n ? " · " + p.pct + "% correct" : "") + '"/>';
    });
    [0, 14, 29].forEach(function (i) { s += '<text x="' + (L + i * bw + bw / 2) + '" y="' + (H - 6) + '" text-anchor="' + (i === 0 ? "start" : i === 29 ? "end" : "middle") + '">' + fmtDate(pts[i].date).replace(/ \d{4}$/, "") + "</text>"; });
    return s + "</svg>";
  }

  // ---------- load
  fetch("data/tracker.json?t=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
    D = d;
    document.getElementById("asof").textContent = "Updated " + fmtDate(d.generated.slice(0, 10)) + " " + d.generated.slice(11, 16) + " IST";
    var start = (location.hash || "").slice(1);
    if (!RENDER[start]) { try { start = localStorage.getItem("tab"); } catch (e) {} }
    go(RENDER[start] ? start : "today");
  }).catch(function () {
    view.innerHTML = '<div class="card"><p>Could not load the tracker data. Check your connection and reload.</p></div>';
  });
})();
