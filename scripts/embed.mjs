// Embed every highlight locally (no API): sentence-transformer via transformers.js.
// Cache: data/cache/embeddings.json  { model, dim, vectors: { [id]: { h: textHash, v: base64(float32) } } }
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { pipeline } from "@huggingface/transformers";
import { loadHighlights, hash } from "./lib.mjs";

export const MODEL = "Xenova/all-MiniLM-L6-v2";
const CACHE = "data/cache/embeddings.json";
const BATCH = 64;

const { items } = await loadHighlights();
let cache = { model: MODEL, dim: 384, vectors: {} };
try { const c = JSON.parse(await readFile(CACHE, "utf8")); if (c.model === MODEL) cache = c; } catch {}

const todo = items.filter(it => cache.vectors[it.id]?.h !== hash(it.text));
console.log(`${items.length} highlights, ${todo.length} need embedding (${MODEL})`);
if (todo.length) {
  const embed = await pipeline("feature-extraction", MODEL, { dtype: "fp32" });
  const t0 = Date.now();
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const out = await embed(batch.map(b => b.text), { pooling: "mean", normalize: true });
    const dim = out.dims[1];
    batch.forEach((b, k) => {
      const v = Float32Array.from(out.data.subarray(k * dim, (k + 1) * dim));
      cache.vectors[b.id] = { h: hash(b.text), v: Buffer.from(v.buffer).toString("base64") };
    });
    if ((i / BATCH) % 10 === 0) console.log(`${Math.min(i + BATCH, todo.length)}/${todo.length}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  await mkdir("data/cache", { recursive: true });
  await writeFile(CACHE, JSON.stringify(cache));
}
console.log("embeddings ready");
