// List unreviewed candidate pairs for labelling (by you, or by Claude in a session).
// Pairs come from meaning-neighbours across different sources, skipping pairs already in data/relations.json.
//
//   node scripts/candidates.mjs --favorites --limit 40
//   node scripts/candidates.mjs --theme BELIEF --min 0.5
//   node scripts/candidates.mjs --id 1055636490
//
// Labels go into data/relations.json as
//   { "a": id, "b": id, "stance": "echo|extend|complicate|contradict", "why": "...", "both": "... (push-back only)", "by": "you" }
// then `npm run graph` to publish.
import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1] ?? true; };
const has = k => args.includes(`--${k}`);
const MIN = +opt("min", 0.45), LIMIT = +opt("limit", 30), THEME = opt("theme", null), ID = opt("id", null);

const D = JSON.parse(await readFile("public/data/library.json", "utf8"));
const R = JSON.parse(await readFile("data/relations.json", "utf8")).relations;
const by = new Map(D.items.map(it => [it.id, it]));
const done = new Set(R.map(r => [r.a, r.b].sort().join("|")));

let seeds = D.items;
if (ID) seeds = [by.get(+ID)].filter(Boolean);
else {
  if (has("favorites")) seeds = seeds.filter(it => it.f);
  if (THEME) seeds = seeds.filter(it => it.th === String(THEME).toUpperCase());
  if (!has("favorites") && !THEME) seeds = seeds.filter(it => it.c !== "TW");
}
const seen = new Set(), out = [];
for (const it of seeds) for (const [o, sim] of it.nn) {
  const b = by.get(o), key = [it.id, o].sort().join("|");
  if (!b || sim < MIN || b.s === it.s || done.has(key) || seen.has(key)) continue;
  seen.add(key); out.push([sim, it, b]);
}
out.sort((x, y) => y[0] - x[0]);
const who = it => it.v || it.a || it.s;
for (const [sim, a, b] of out.slice(0, LIMIT)) {
  console.log(`\n${sim.toFixed(2)}  ${a.id} ⟷ ${b.id}  [${a.th} / ${b.th}]`);
  console.log(`  A (${who(a)}): ${a.t.slice(0, 400)}`);
  console.log(`  B (${who(b)}): ${b.t.slice(0, 400)}`);
}
console.error(`\n${Math.min(LIMIT, out.length)} of ${out.length} candidate pairs`);
