# safefetch-required

Locks the **`@a1/ai` "no raw HTTP" contract** so all network egress in
the engine goes through the injected `safeFetch` (and is therefore
egress-gated by the host product).

## Why this matters

`@a1/ai` runs in a **sovereign context** — every downstream consumer
is air-gapped. The `safeFetch` function is the **single egress surface**:
hosts inject a fetch function that:
- Allows loopback unconditionally
- Allows remote hosts only if allowlisted (`SBOSS_AI_EGRESS_ALLOWLIST`)
- Denies everything else

If a contributor adds a raw `fetch(...)` call, `axios.get(...)`, or
`require('https')` to `src/`, the egress gate is **bypassed** — and
sovereignty is silently lost. This lane prevents that.

## What's frozen

1. **No raw HTTP calls in `src/`** — every network call must be `safeFetch(...)`.
   Forbidden: `fetch`, `axios`, `got`, `request`, `http.request`, `https.request`, etc.
2. **No HTTP module requires in `src/`** — no `require('http')`, `require('https')`,
   `require('got')`, etc.
3. **All 3 call sites use `safeFetch`**: `open-notebook.js`, `model-catalog.js`, `chat.js`.
4. **All 3 call sites type-check `safeFetch`** — throw `TypeError` if not a function.
5. **`index.js` has no direct HTTP calls** — all egress delegated to safeFetch modules.

## Allowed changes (additive only)

- Adding new call sites that all use `safeFetch` (add to `SAFE_FETCH_CALL_SITES`).
- Adding new safeFetch-type modules (each must follow the pattern).
- safeFetch itself can do whatever (it's the host's contract surface, not @a1/ai's).

## Consumers

- `A1-Suite-Local-ANT` — provides `safeFetch` via `server/app.js`
- `A1-Suite-Local-MAX` — provides `safeFetch` via `packages/ai/`
- `autoresearch-sboss` — provides `safeFetch` via runtime mock in eval loops
- `A1-AI-ERP-SBOS-MSTUDIO-sovereign` — provides `safeFetch` via `sboss-gateway`

## Run

```bash
node evals/safefetch-required/check.js
```

## Source

- `src/chat.js` — OpenRouter chat client
- `src/model-catalog.js` — OpenRouter model menu
- `src/open-notebook.js` — Open Notebook connector
- `AGENTS.md` §6 — Sovereignty Posture

## Consumer pattern (host must implement)

```js
const safeFetch = async (url, options, env) => {
  // Loopback: always allowed
  if (url.startsWith("http://localhost:") || url.startsWith("http://127.0.0.1:")) {
    return realFetch(url, options);
  }
  // Remote: check allowlist (egress gate)
  const allowlist = (env || process.env).SBOSS_AI_EGRESS_ALLOWLIST?.split(",") || [];
  const host = new URL(url).host;
  if (!allowlist.includes(host)) {
    return { ok: false, status: 403, json: async () => ({ error: "egress denied" }) };
  }
  return realFetch(url, options);
};
```
