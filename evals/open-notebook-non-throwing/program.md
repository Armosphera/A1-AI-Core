# open-notebook-non-throwing

Locks the **non-throwing contract of `createOpenNotebook().search()`** so
the Open Notebook connector remains opt-in, egress-gated, and **never breaks
the host retrieval flow** even on bad input / network errors.

## Why this matters

`@a1/ai`'s `openNotebook.search()` is a *side retrieval source* — it augments
the host product's RAG by querying a self-hosted Open Notebook instance over
its REST API. If it throws on bad input or network errors, the host's overall
retrieval flow is broken. Sovereignty contracts require it to be
**best-effort, never-blocking**.

## What's frozen

1. **`createOpenNotebook()` rejects missing `safeFetch`** (TypeError).
2. **`search()` never throws** on:
   - `null`, `undefined`, empty/whitespace string
   - non-string types (number, array, object)
   - network errors during safeFetch call
3. **`search()` returns `[]`** for all the above cases.
4. **When disabled** (no `settings.openNotebook.{enabled,baseUrl}`), search
   does **NOT call fetch** and returns `[]` immediately.
5. **`normalizeResults()` preserves required fields**: `title`, `text`,
   `score`, `sourceUrl`, `origin: "open-notebook"`.
6. **`normalizeResults()` is pure** (no input mutation).
7. **`isEnabled()` truthy only** when `settings.openNotebook.enabled` AND
   `settings.openNotebook.baseUrl` are both truthy.

## Allowed changes (additive only)

- Adding new fields to result rows.
- Adding new helper exports.
- Adding new safe-error types (still non-throwing for the search surface).

## Run

```bash
node evals/open-notebook-non-throwing/check.js
```

## Source

- `src/open-notebook.js` (the contract surface)
- `evals/open-notebook-non-throwing/check.js` (this lane's checker)
- `AGENTS.md` §6 (Sovereignty Posture — egress-gated, non-throwing)

## Consumers

- Sovereign products (`A1-Suite-Local-ANT`, `A1-Suite-Local-MAX`,
  `SBOS-A1-ERP`) — augment their RAG with open notebook data when configured.
- `autoresearch-sboss` — references open notebook patterns in research loops.
- A1-portfolio (docs reference).