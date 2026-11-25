<img src="assets/icon.svg" width="64" height="64" alt="">

# Commonplace

A public commonplace book built from my Readwise highlights, and a record of where they disagree with each other.

- **Index** (`index.html`): every highlight, a dispute of the day, and for each highlight four stances:
  *echoes · extends · complicates · contradicts*, each with a reason and, for push-back, a "both true if…".
  Unreviewed highlights show what's **nearby in meaning**, clearly marked as similarity, not judgement.
- **Universe** (`universe.html`): a three.js map where nearby stars are close in meaning. Click a star to focus it,
  and shift-click a second star to trace the chain of ideas between the two.

Everything is static. No API keys and no server.

## Data pipeline

```sh
npm install
npm run fetch   # all highlights via the logged-in `readwise` CLI  -> data/raw/ (gitignored)
npm run embed   # local sentence embeddings (all-MiniLM-L6-v2)       -> data/cache/ (gitignored)
npm run graph   # dedupe, themes, neighbours, 3D layout, relations  -> public/data/library.json
npm run data    # all three
```

What gets published is controlled in `scripts/lib.mjs`:
highlights tagged `discard`, `private`, `personal`, `hide` or `secret` are dropped, as are Readwise onboarding sources.
Near-duplicates (the same passage saved twice) are merged.

Hand-editable inputs:

| file | what |
| --- | --- |
| `data/relations.json` | reviewed links between highlights (stance, why, both-true-if, who judged it) |
| `data/themes.json` | theme names + descriptions used to name the meaning clusters |
| `data/overrides.json` | per-highlight fixes, e.g. who actually said a quote |

To find new pairs worth judging:

```sh
node scripts/candidates.mjs --favorites --limit 40
node scripts/candidates.mjs --theme BELIEF
node scripts/candidates.mjs --id 1055636490
```

Add judgements to `data/relations.json`, then run `npm run graph`.

## Site

```sh
npm run dev       # local dev server
npm run build     # -> dist/ (deploy to Vercel or GitHub Pages as-is)
```

`mockups/` holds the design explorations that led here.
