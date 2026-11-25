// Pull every highlight from Readwise through the authenticated `readwise` CLI.
// Writes data/raw/highlights.json (gitignored: raw, unfiltered library).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdir } from "node:fs/promises";

const run = promisify(execFile);
const FIELDS = [
  "text", "note", "location", "location_type", "url", "color", "highlighted_at", "updated", "book_id", "tags",
  "book_title", "book_author", "book_category", "book_source", "book_source_url", "book_tags", "book_cover_image_url",
].join(",");
const PAGE = 1000;

async function page(n) {
  for (let attempt = 1; ; attempt++) {
    try {
      const { stdout } = await run("readwise", ["--json", "readwise-list-highlights", "--page-size", String(PAGE),
        "--page", String(n), "--response-fields", FIELDS], { maxBuffer: 256 * 1024 * 1024 });
      return JSON.parse(stdout);
    } catch (err) {
      if (attempt >= 4) throw err;
      const wait = 2000 * attempt;
      console.warn(`page ${n} failed (${err.message.split("\n")[0]}), retrying in ${wait}ms`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

const first = await page(1);
const all = [...first.results];
const pages = Math.ceil(first.count / PAGE);
console.log(`${first.count} highlights across ${pages} pages`);
for (let n = 2; n <= pages; n++) {
  const p = await page(n);
  all.push(...p.results);
  console.log(`page ${n}/${pages}: ${all.length}`);
}
await mkdir("data/raw", { recursive: true });
await writeFile("data/raw/highlights.json", JSON.stringify({ fetched: new Date().toISOString(), count: all.length, results: all }));
console.log(`wrote data/raw/highlights.json (${all.length})`);
