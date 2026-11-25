// Loads public/data/library.json and exposes lookups shared by both views.
export const STANCES = ["echo", "extend", "complicate", "contradict"];
export const STANCE_LABEL = { echo: "Echoes", extend: "Extends", complicate: "Complicates", contradict: "Contradicts" };
export const STANCE_HINT = {
  echo: "Says the same thing, elsewhere", extend: "Takes it a step further",
  complicate: "True, but with a catch", contradict: "Argues the opposite",
};
export const CAT = { BK: "■ BK", AR: "▬ AR", TW: "● TW", PD: "◆ PD" };
export const isPush = s => s === "complicate" || s === "contradict";

export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const pad = (n, w = 2) => String(n).padStart(w, "0");

export async function loadLibrary() {
  const res = await fetch(new URL("data/library.json", document.baseURI));
  if (!res.ok) throw new Error(`library.json: ${res.status}`);
  const D = await res.json();
  const byId = new Map(D.items.map(it => [it.id, it]));
  const relsOf = new Map();
  for (const r of D.relations) {
    for (const [me, other] of [[r.a, r.b], [r.b, r.a]]) {
      if (!relsOf.has(me)) relsOf.set(me, []);
      relsOf.get(me).push({ ...r, other });
    }
  }
  const contested = new Set(D.relations.filter(r => r.s === "contradict").flatMap(r => [r.a, r.b]));
  const hay = new Map(D.items.map(it => [it.id, `${it.t} ${it.s} ${it.a} ${it.v || ""} ${it.th}`.toLowerCase()]));

  const lib = {
    ...D, byId, contested,
    rels: id => relsOf.get(id) || [],
    counts(id) {
      const c = { echo: 0, extend: 0, complicate: 0, contradict: 0 };
      for (const r of lib.rels(id)) c[r.s]++;
      return c;
    },
    // nearest by meaning, minus anything already reviewed; other sources first (cross-pollination)
    near(id, n = 6) {
      const it = byId.get(id), linked = new Set(lib.rels(id).map(r => r.other));
      const list = it.nn.filter(([o]) => byId.has(o) && !linked.has(o)).map(([o, s]) => ({ it: byId.get(o), sim: s }));
      const other = list.filter(x => x.it.s !== it.s), same = list.filter(x => x.it.s === it.s);
      return [...other, ...same].slice(0, n);
    },
    resolve: id => (byId.has(id) ? id : D.merged?.[id] ?? null),
    match(id, terms) { const h = hay.get(id); return terms.every(t => h.includes(t)); },
    voice: it => it.v || it.a || it.s,
    // "Shaw, via In This Economy?" or "Hillbilly Elegy — J. D. Vance"
    attribution(it, sep = " — ") {
      if (it.v) return `${esc(it.v)}<span class="via">, via ${esc(it.s)}</span>`;
      return `${esc(it.s)}${it.a ? `<span class="via">${sep}${esc(it.a)}</span>` : ""}`;
    },
  };
  return lib;
}
