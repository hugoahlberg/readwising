// Build the public dataset: themes (k-means + named), nearest neighbours,
// a 3D UMAP layout for the universe, and the reviewed relations.
// Output: public/data/library.json
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { UMAP } from "umap-js";
import { pipeline } from "@huggingface/transformers";
import { loadHighlights } from "./lib.mjs";

const MODEL = "Xenova/all-MiniLM-L6-v2";
const NN = 10;
const t0 = Date.now();
const log = m => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);

const loaded = await loadHighlights();
const { skipped, fetched } = loaded;
const cache = JSON.parse(await readFile("data/cache/embeddings.json", "utf8"));
const decode = b64 => new Float32Array(Uint8Array.from(Buffer.from(b64, "base64")).buffer);
const vecOf = it => { const c = cache.vectors[it.id]; if (!c) throw new Error(`no embedding for ${it.id}; run npm run embed`); return decode(c.v); };
const D = 384;
const dot = (a, b) => { let s = 0; for (let i = 0; i < D; i++) s += a[i] * b[i]; return s; };

function knn(V, k, skip = () => false) {
  const out = new Array(V.length);
  for (let i = 0; i < V.length; i++) {
    const best = [];
    for (let j = 0; j < V.length; j++) {
      if (j === i || skip(i, j)) continue;
      const s = dot(V[i], V[j]);
      if (best.length < k || s > best[best.length - 1][0]) {
        let p = best.length; best.push([s, j]);
        while (p > 0 && best[p - 1][0] < s) { best[p] = best[p - 1]; p--; }
        best[p] = [s, j]; if (best.length > k) best.pop();
      }
    }
    out[i] = best;
  }
  return out;
}

/* ---- merge near-duplicates (same passage saved twice) ---- */
const DUP = 0.93;
const all = loaded.items, AV = all.map(vecOf);
const prefer = it => (it.tags.includes("favorite") ? 0 : 4) + ({ BK: 0, AR: 1, PD: 2, TW: 3 }[it.cat] ?? 3);
const merged = new Map(); // dropped id -> kept id
{
  const dn = knn(AV, 3);
  const order = all.map((_, i) => i).sort((a, b) => prefer(all[a]) - prefer(all[b]) || (all[a].date || "").localeCompare(all[b].date || ""));
  const keep = new Set();
  for (const i of order) {
    if (merged.has(all[i].id)) continue;
    keep.add(i);
    for (const [s, j] of dn[i]) if (s >= DUP && !keep.has(j) && !merged.has(all[j].id)) merged.set(all[j].id, all[i].id);
  }
}
const items = all.filter(it => !merged.has(it.id));
const V = items.map(vecOf);
const N = V.length;
log(`${N} highlights (${merged.size} near-duplicates merged)`);

/* ---- nearest neighbours (brute force; vectors are normalised) ---- */
const nn = knn(V, NN);
log("neighbours");

/* ---- themes: seeded k-means, named by closest description ---- */
const themeCfg = JSON.parse(await readFile("data/themes.json", "utf8"));
const K = themeCfg.k;
let seed = 1; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
const C = [V[Math.floor(rnd() * N)].slice()];
while (C.length < K) {
  const d = V.map(v => 1 - Math.max(...C.map(c => dot(v, c))));
  let r = rnd() * d.reduce((a, b) => a + b), i = 0; while ((r -= d[i]) > 0 && i < N - 1) i++;
  C.push(V[i].slice());
}
const A = new Int32Array(N);
for (let it = 0; it < 40; it++) {
  for (let n = 0; n < N; n++) { let b = 0, bs = -9; for (let k = 0; k < K; k++) { const s = dot(V[n], C[k]); if (s > bs) { bs = s; b = k; } } A[n] = b; }
  for (let k = 0; k < K; k++) {
    const c = new Float32Array(D); for (let n = 0; n < N; n++) if (A[n] === k) for (let i = 0; i < D; i++) c[i] += V[n][i];
    const L = Math.hypot(...c) || 1; C[k] = c.map(x => x / L);
  }
}
const embed = await pipeline("feature-extraction", MODEL, { dtype: "fp32" });
const names = Object.keys(themeCfg.themes);
const anchorOut = await embed(names.map(n => themeCfg.themes[n]), { pooling: "mean", normalize: true });
const anchors = names.map((_, i) => anchorOut.data.subarray(i * D, (i + 1) * D));
// each cluster takes its closest description; clusters sharing a name merge into one theme
const clusterName = {};
for (let k = 0; k < K; k++) {
  let best = names[0], bs = -9;
  names.forEach((n, a) => { const s = dot(C[k], anchors[a]); if (s > bs) { bs = s; best = n; } });
  clusterName[k] = best;
}
log("themes: " + Object.values(clusterName).join(", "));

/* ---- 3D layout ---- */
let s2 = 7; const rnd2 = () => (s2 = s2 * 16807 % 2147483647) / 2147483647;
const umap = new UMAP({ nComponents: 3, nNeighbors: 18, minDist: 0.12, spread: 1.2, random: rnd2 });
const nEpochs = umap.initializeFit(V.map(v => Array.from(v)));
for (let e = 0; e < nEpochs; e++) { umap.step(); if (e % 100 === 0) log(`umap ${e}/${nEpochs}`); }
const P = umap.getEmbedding();
const mean = [0, 1, 2].map(d => P.reduce((s, p) => s + p[d], 0) / N);
const radii = P.map(p => Math.hypot(p[0] - mean[0], p[1] - mean[1], p[2] - mean[2])).sort((a, b) => a - b);
const rad = radii[Math.floor(N * .9)]; // scale by the 90th percentile so outliers don't shrink the core
const pos = P.map(p => p.map((x, d) => +(((x - mean[d]) / rad) * 100).toFixed(2)));
log("layout");

/* ---- relations (reviewed) ---- */
const relCfg = JSON.parse(await readFile("data/relations.json", "utf8"));
const idx = new Map(items.map((it, i) => [it.id, i]));
const relations = [], dropped = [];
for (const r0 of relCfg.relations) {
  const r = { ...r0, a: merged.get(r0.a) ?? r0.a, b: merged.get(r0.b) ?? r0.b };
  if (!idx.has(r.a) || !idx.has(r.b) || r.a === r.b) { dropped.push(r); continue; }
  relations.push({ a: r.a, b: r.b, s: r.stance, why: r.why, both: r.both || null, by: r.by || null });
}
if (dropped.length) log(`${dropped.length} relations point at excluded/missing highlights`);

/* ---- write ---- */
const themeList = [...new Set(Object.values(clusterName))].map(name => {
  const members = []; for (let n = 0; n < N; n++) if (clusterName[A[n]] === name) members.push(n);
  const c = [0, 1, 2].map(d => +(members.reduce((s, n) => s + pos[n][d], 0) / members.length).toFixed(2));
  return { name, count: members.length, c };
}).sort((a, b) => b.count - a.count);

const out = {
  meta: { built: new Date().toISOString(), fetched, total: N, skipped: { ...skipped, duplicates: merged.size }, model: MODEL, relations: relations.length },
  merged: Object.fromEntries(merged),
  themes: themeList,
  items: items.map((it, i) => ({
    id: it.id, t: it.text, ...(it.note ? { n: it.note } : {}),
    s: it.src, a: it.au, ...(it.voice ? { v: it.voice } : {}),
    c: it.cat, d: it.date, th: clusterName[A[i]], ...(it.tags.includes("favorite") ? { f: 1 } : {}),
    p: pos[i], nn: nn[i].map(([s, j]) => [items[j].id, +s.toFixed(3)]),
  })),
  relations,
};
await mkdir("public/data", { recursive: true });
const json = JSON.stringify(out);
await writeFile("public/data/library.json", json);
log(`wrote public/data/library.json (${(json.length / 1e6).toFixed(1)} MB, ${relations.length} relations)`);
