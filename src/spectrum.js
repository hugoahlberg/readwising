import { loadLibrary, STANCES, STANCE_LABEL, STANCE_HINT, CAT, isPush, esc, pad } from "./data.js";
import { createWave } from "./wave.js";

const $ = s => document.querySelector(s);
const vt = fn => (document.startViewTransition ? document.startViewTransition(fn) : (fn(), null));
const sizeClass = (n, a = 170, b = 300, c = 600) => (n > c ? "xxl" : n > b ? "xl" : n > a ? "long" : "");

const L = await loadLibrary().catch(err => { $("#loading").textContent = `Couldn't load the library (${err.message}).`; throw err; });
$("#loading").remove();
$("#count").textContent = `${L.items.length.toLocaleString()} highlights · ${L.relations.length} links`;
$("#q").placeholder = `Search ${L.items.length.toLocaleString()} highlights`;

// numbering is chronological (№ 0001 = first highlight kept); display order depends on sort
const byDate = [...L.items].sort((a, b) => (b.d || "").localeCompare(a.d || ""));
const number = new Map(byDate.map((it, i) => [it.id, byDate.length - i]));
const reviewedSet = new Set(L.relations.flatMap(r => [r.a, r.b]));
let daySeed = Math.floor(Date.now() / 864e5);
const shuffleKey = id => { let x = (id ^ daySeed) >>> 0; x = Math.imul(x ^ (x >>> 16), 0x45d9f3b); x = Math.imul(x ^ (x >>> 16), 0x45d9f3b); return (x ^ (x >>> 16)) >>> 0; };
// featured: reviewed first, then favorites, then books and articles before posts, each newest first
const rank = it => (reviewedSet.has(it.id) ? 0 : it.f ? 1 : it.c === "TW" ? 3 : 2);
const SORTS = {
  featured: () => [...byDate].sort((a, b) => rank(a) - rank(b)),
  newest: () => byDate,
  shuffle: () => [...L.items].sort((a, b) => shuffleKey(a.id) - shuffleKey(b.id)),
};
let ordered = SORTS.featured();

/* ---------------- dispute of the day ---------------- */
const disputes = L.relations.filter(r => r.s === "contradict" && r.both);
let di = Math.floor(Date.now() / 864e5) % Math.max(1, disputes.length);
function renderDispute() {
  if (!disputes.length) return;
  $("#dispute").hidden = false;
  const r = disputes[di], A = L.byId.get(r.a), B = L.byId.get(r.b);
  $("#dn").textContent = `${pad(di + 1)} / ${pad(disputes.length)}`;
  $("#dth").textContent = A.th === B.th ? A.th : `${A.th} × ${B.th}`;
  const side = it => `<blockquote class="${it.t.length > 260 ? "long" : ""}">“${esc(it.t)}”</blockquote><div class="s">${L.attribution(it)}</div>`;
  $("#sa").innerHTML = side(A); $("#sb").innerHTML = side(B);
  $("#sa").onclick = () => open(A.id, $("#sa blockquote"));
  $("#sb").onclick = () => open(B.id, $("#sb blockquote"));
  $("#bt").textContent = r.both.charAt(0).toUpperCase() + r.both.slice(1);
}
$("#nextd").onclick = () => { di = (di + 1) % disputes.length; vt(renderDispute); };

/* ---------------- index ---------------- */
const F = { theme: null, fav: false, contested: false, reviewed: false, type: null, sort: "featured", terms: [] };
const TYPES = { BK: "Books", AR: "Articles", TW: "Posts" };
function chips() {
  $("#filters").hidden = false; $("#head").hidden = false;
  $("#chips").innerHTML = `<button class="chip ${!F.theme ? "on" : ""}" data-t="">All<i>${L.items.length}</i></button>` +
    L.themes.map(t => `<button class="chip ${F.theme === t.name ? "on" : ""}" data-t="${esc(t.name)}">${esc(t.name)}<i>${t.count}</i></button>`).join("");
  const favN = L.items.filter(i => i.f).length;
  const typeN = t => L.items.filter(i => i.c === t).length;
  $("#toggles").innerHTML =
    `<span class="lbl">Sort</span>` + Object.keys(SORTS).map(k => `<button class="chip ghost ${F.sort === k ? "on" : ""}" data-sort="${k}">${k}</button>`).join("") +
    `<span class="sep"></span>` + Object.entries(TYPES).map(([k, n]) => `<button class="chip ghost ${F.type === k ? "on" : ""}" data-type="${k}">${n}<i>${typeN(k)}</i></button>`).join("") +
    `<span class="sep"></span>` +
    `<button class="chip ghost ${F.fav ? "on" : ""}" data-k="fav">★ Favorites<i>${favN}</i></button>` +
    `<button class="chip ghost ${F.reviewed ? "on" : ""}" data-k="reviewed">Reviewed<i>${reviewedSet.size}</i></button>` +
    `<button class="chip red ${F.contested ? "on" : ""}" data-k="contested">⟂ Contested<i>${L.contested.size}</i></button>`;
  document.querySelectorAll("#chips .chip").forEach(b => b.onclick = () => { F.theme = b.dataset.t || null; chips(); rows(); });
  document.querySelectorAll("#toggles .chip").forEach(b => b.onclick = () => {
    if (b.dataset.sort) { if (b.dataset.sort === "shuffle" && F.sort === "shuffle") daySeed = Math.floor(Math.random() * 1e9); F.sort = b.dataset.sort; ordered = SORTS[F.sort](); }
    else if (b.dataset.type) F.type = F.type === b.dataset.type ? null : b.dataset.type;
    else F[b.dataset.k] = !F[b.dataset.k];
    chips(); rows();
  });
}
function bar(id) {
  const c = L.counts(id), agree = c.echo + c.extend, push = c.complicate + c.contradict;
  if (!agree && !push) return `<div class="bar none"></div><div class="mono"><span>Not yet reviewed</span></div>`;
  return `<div class="bar">${STANCES.map(s => (c[s] ? `<i class="${s}" style="flex:${c[s]}"></i>` : "")).join("")}</div>
    <div class="mono"><span>${agree} agree</span><b>${push ? `${push} push back` : ""}</b></div>`;
}
let list = [], shown = 0;
const CHUNK = 60;
function rows() {
  list = ordered.filter(it => (!F.theme || it.th === F.theme) && (!F.fav || it.f) && (!F.contested || L.contested.has(it.id))
    && (!F.reviewed || reviewedSet.has(it.id)) && (!F.type || it.c === F.type) && (!F.terms.length || L.match(it.id, F.terms)));
  $("#rows").innerHTML = ""; shown = 0; more();
}
function more() {
  const next = list.slice(shown, shown + CHUNK);
  $("#end")?.remove();
  $("#rows").insertAdjacentHTML("beforeend", next.map(it => `<button class="row grid" data-id="${it.id}">
      <span class="n mono">${pad(number.get(it.id), 4)}${it.f ? " <b>★</b>" : ""}</span>
      <span class="c mono">${CAT[it.c]}</span>
      <blockquote>${esc(it.t)}</blockquote>
      <span class="src">${L.attribution(it, "")}</span>
      <span class="st">${bar(it.id)}</span></button>`).join(""));
  shown += next.length;
  if (shown >= list.length) {
    $("#rows").insertAdjacentHTML("beforeend", `<div id="end" class="mono">${list.length.toLocaleString()} highlights${
      list.length ? "" : ` · nothing matches. <button id="clear">Clear filters</button>`}</div>`);
    $("#clear")?.addEventListener("click", () => { Object.assign(F, { theme: null, fav: false, contested: false, reviewed: false, type: null, terms: [] }); $("#q").value = ""; chips(); rows(); });
  }
}
$("#rows").addEventListener("click", e => { const r = e.target.closest(".row"); if (r) open(+r.dataset.id, r.querySelector("blockquote")); });
new IntersectionObserver(es => { if (es[0].isIntersecting && shown < list.length) more(); }, { rootMargin: "800px" }).observe($("#sentinel"));
let qt;
$("#q").addEventListener("input", e => {
  clearTimeout(qt);
  qt = setTimeout(() => { F.terms = e.target.value.toLowerCase().split(/\s+/).filter(Boolean); rows(); }, 120);
});

/* ---------------- sheet ---------------- */
let trail = [], ti = -1, cur = null;
const wave = createWave($("#wave"), () => document.body.classList.contains("focus"));
function open(id, fromEl, opts = {}) {
  if (!L.byId.has(id)) return;
  if (!opts.nav) { trail = trail.slice(0, ti + 1); if (trail[trail.length - 1] !== id) trail.push(id); ti = trail.length - 1; }
  const wasOpen = document.body.classList.contains("focus");
  const show = () => { render(id); document.body.classList.add("focus"); $("#sheet").setAttribute("aria-hidden", "false"); };
  if (fromEl && document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    fromEl.style.viewTransitionName = "hero"; $("#squote").style.viewTransitionName = "none";
    $("#sheet").style.transition = "none";
    document.startViewTransition(() => { fromEl.style.viewTransitionName = ""; $("#squote").style.viewTransitionName = "hero"; show(); $("#sheet").scrollTop = 0; })
      .finished.finally(() => { $("#sheet").style.transition = ""; });
  } else { show(); $("#sheet").scrollTo({ top: 0, behavior: wasOpen ? "smooth" : "auto" }); }
  history.replaceState(null, "", `#${id}`);
}
function card(it, i, inner, ci = 0) {
  return `<button class="card" data-id="${it.id}" style="animation-delay:${60 + ci * 50 + i * 50}ms">${inner}</button>`;
}
function render(id) {
  cur = id;
  const it = L.byId.get(id), R = L.rels(id), c = L.counts(id);
  $("#over").innerHTML = `<span>${CAT[it.c]}</span><span>${esc(it.th)}</span>${it.d ? `<span>Kept ${it.d}</span>` : ""}${it.f ? `<span class="fav">★ Favorite</span>` : ""}
    <span class="t">${R.length ? `${R.length} reviewed links` : "Not yet reviewed"}</span>`;
  const q = $("#squote"); q.className = sizeClass(it.t.length); q.textContent = `“${it.t}”`;
  $("#snote").hidden = !it.n; $("#snote").textContent = it.n || "";
  $("#ssrc").innerHTML = it.v ? `${esc(it.v)}<span class="via">quoted in ${esc(it.s)}${it.a ? `, ${esc(it.a)}` : ""}</span>`
    : `${esc(it.s)}<span class="via">${esc(it.a)}</span>`;
  $("#sacts").innerHTML = `<a href="https://readwise.io/open/${it.id}" target="_blank" rel="noopener">↗ Readwise</a>
    <a href="universe.html#${it.id}">◎ Universe</a><button id="cp">⧉ Copy</button><button id="rnd">⟲ Random</button>`;
  $("#cp").onclick = () => { navigator.clipboard?.writeText(`“${it.t}” — ${L.voice(it)}`); $("#cp").textContent = "✓ Copied"; };
  $("#rnd").onclick = () => open(byDate[Math.floor(Math.random() * byDate.length)].id);

  $("#reviewed").hidden = !R.length; $("#unreviewed").hidden = !!R.length;
  if (R.length) {
    $("#scale").innerHTML = STANCES.map(s => `<div><h3>${STANCE_LABEL[s]}</h3><span class="mono">${pad(c[s])}</span></div>`).join("") +
      STANCES.map(s => `<p>${STANCE_HINT[s]}</p>`).join("");
    $("#cols").innerHTML = STANCES.map((s, ci) => {
      const cards = R.filter(r => r.s === s).map((r, i) => { const o = L.byId.get(r.other);
        return card(o, i, `<div class="x mono">${o.th !== it.th ? "↗ " : ""}${esc(o.th)}</div><blockquote>${esc(o.t)}</blockquote>
          <div class="s">${L.attribution(o)}</div><p class="why">${esc(r.why)}</p>${r.both ? `<p class="both"><b>Both true if</b>${esc(r.both)}</p>` : ""}`, ci); }).join("");
      const empty = s === "contradict"
        ? `<div class="void red"><b>Nothing reviewed contradicts this yet.</b> Unopposed isn't the same as true. Check what's nearby below, since similar passages sometimes disagree.</div>`
        : `<div class="void">—</div>`;
      return `<div data-h="${STANCE_LABEL[s]}">${cards || empty}</div>`;
    }).join("");
    const tot = R.length; wave.set(STANCES.map(s => c[s] / tot));
  } else {
    $("#unreviewed").innerHTML = `<h3>Not yet reviewed</h3><p>Nobody has judged how this connects to the rest of the library yet.
      Below is what sits closest in meaning. Close in meaning doesn't mean agreeing: some of these will disagree.</p>`;
    wave.set([0, 0, 0, 0]);
  }

  const near = L.near(id, 6);
  $("#near").innerHTML = near.length ? `<div class="nh"><h3>Nearby in meaning</h3><span class="mono">Found by similarity · not judged</span></div>
    <div class="ngrid">${near.map(({ it: o, sim }, i) => card(o, i, `<div class="sim mono"><i style="width:${Math.round(sim * 60)}px"></i>${Math.round(sim * 100)}% · ${esc(o.th)}</div>
      <blockquote>${esc(o.t)}</blockquote><div class="s">${L.attribution(o)}</div>`, 1)).join("")}</div>` : "";

  $("#crumbs").innerHTML = trail.map((t, i) => `${i ? "<i>→</i>" : ""}<button data-i="${i}" class="${i === ti ? "cur" : ""}">${esc(L.byId.get(t).t.slice(0, 40))}</button>`).join("");
  document.querySelectorAll("#crumbs button").forEach(b => b.onclick = () => { ti = +b.dataset.i; open(trail[ti], null, { nav: true }); });
  document.title = `“${it.t.slice(0, 60)}${it.t.length > 60 ? "…" : ""}” · Commonplace`;
}
$("#sheet").addEventListener("click", e => { const c = e.target.closest(".card"); if (c) open(+c.dataset.id, c.querySelector("blockquote")); });
function close() {
  document.body.classList.remove("focus"); $("#sheet").setAttribute("aria-hidden", "true");
  history.replaceState(null, "", location.pathname + location.search); document.title = "Commonplace";
}
$("#close").onclick = close;
addEventListener("keydown", e => {
  if (e.target === $("#q")) { if (e.key === "Escape") e.target.blur(); return; }
  if (e.key === "/") { e.preventDefault(); close(); $("#q").focus(); return; }
  if (!document.body.classList.contains("focus")) return;
  if (e.key === "Escape") close();
  if (e.key === "ArrowLeft" && ti > 0) { ti--; open(trail[ti], null, { nav: true }); }
  if (e.key === "ArrowRight" && ti < trail.length - 1) { ti++; open(trail[ti], null, { nav: true }); }
});
addEventListener("hashchange", () => { const id = L.resolve(+location.hash.slice(1)); if (id && id !== cur) open(id); });

renderDispute(); chips(); rows();
const h = L.resolve(+location.hash.slice(1)); if (h) open(h);
