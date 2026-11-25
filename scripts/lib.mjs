import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

// Highlights tagged with any of these never leave your machine.
export const PRIVATE_TAGS = new Set(["private", "personal", "hide", "secret", "discard"]);
// Sources that aren't really your reading (Readwise onboarding etc.).
export const EXCLUDE_SOURCES = new Set(["How to Use Readwise"]);
export const MIN_CHARS = 25;

const CAT = { books: "BK", supplementals: "BK", articles: "AR", tweets: "TW", podcasts: "PD" };
const AUTHOR_FIX = { "Last accessed on": "" };

export function cleanText(t = "") {
  return t
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")              // markdown images
    .replace(/\[(\d+)\]\(private:\/\/[^)]+\)/g, "")      // ebook endnote links
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")              // links -> text
    .replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/https?:\/\/t\.co\/\S+/g, "")
    .replace(/\s+/g, " ").trim();
}

function fixAuthor(a) {
  a = a || "";
  if (a in AUTHOR_FIX) return AUTHOR_FIX[a];
  const m = a.match(/^([^,;]+),\s*([^,;]+?);?$/); // "Scott, James C.;" -> "James C. Scott"
  if (m && !a.includes(" and ")) return `${m[2].trim()} ${m[1].trim()}`;
  return a.replace(/;$/, "").trim();
}

// "...all progress depends on the unreasonable man. —George Bernard Shaw"
function quotedVoice(text) {
  const m = text.match(/[—–]\s*([A-Z][A-Za-zÀ-ÿ.'’\- ]{2,40})\s*$/);
  if (!m) return null;
  const v = m[1].trim(), words = v.split(" ");
  const ok = words.length <= 5 && !/\.$/.test(v) && words.every(w => /^[A-ZÀ-Ý]/.test(w) || /^(de|van|von|la|le|du|da)$/.test(w));
  if (!ok) return null;
  return v === v.toUpperCase() ? v.toLowerCase().replace(/(^|[\s-])\p{L}/gu, c => c.toUpperCase()) : v;
}

const tagNames = tags => (tags || []).map(t => (typeof t === "string" ? t : t.name || "").toLowerCase());

export async function loadHighlights() {
  const raw = JSON.parse(await readFile("data/raw/highlights.json", "utf8"));
  let overrides = { voice: {} };
  try { overrides = { voice: {}, ...JSON.parse(await readFile("data/overrides.json", "utf8")) }; } catch {}
  const out = [], skipped = { private: 0, short: 0 };
  for (const h of raw.results) {
    const tags = [...tagNames(h.tags), ...tagNames(h.book_tags)];
    if (tags.some(t => PRIVATE_TAGS.has(t.replace(/^#/, "")))) { skipped.private++; continue; }
    if (EXCLUDE_SOURCES.has((h.book_title || "").trim())) { skipped.source = (skipped.source || 0) + 1; continue; }
    const text = cleanText(h.text);
    if (text.length < MIN_CHARS) { skipped.short++; continue; }
    const au = fixAuthor(h.book_author);
    out.push({
      id: h.id, text, note: cleanText(h.note || ""),
      src: (h.book_title || "Untitled").trim(), au,
      voice: overrides.voice[h.id] || quotedVoice(text),
      cat: CAT[h.book_category] || "AR",
      date: (h.highlighted_at || h.updated || "").slice(0, 10),
      tags: tagNames(h.tags).filter(Boolean),
      url: h.book_source_url || null,
    });
  }
  return { items: out, skipped, fetched: raw.fetched };
}

export const hash = s => createHash("sha1").update(s).digest("hex").slice(0, 12);
