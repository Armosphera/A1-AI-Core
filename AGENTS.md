# AGENTS.md — A1-AI-Core (`@a1/ai`)

This file applies to every agent (human or AI) that touches the `armosphera/A1-AI-Core`
repository. It extends, and never weakens, the global rules in
`https://github.com/Armosphera/A1-portfolio/blob/main/LICENSING.md`.

## ⚠️ CRITICAL — The DI Contract is Frozen

`A1-AI-Core` exports the `@a1/ai` package — a framework-agnostic AI provider core
consumed by **every A1 application**. Pinned commit (`cec47006` → `f917e8a1`) is
referenced by:

- `armosphera/A1-Suite-Local-MAX` — `devDependencies."@a1/ai"`
- `armosphera/A1-Suite-Local-ANT` — `devDependencies."@a1/ai"`
- `armosphera/autoresearch-sboss` — runtime use via `scripts/karpathy-eval.mjs`
- `armosphera/A1-portfolio` — documentation references

**Breaking the DI contract breaks 4 downstream repos in lockstep.**

### What is the frozen contract

```js
const { createAi } = require("@a1/ai");

const ai = createAi({
  safeFetch: config.safeFetch,                        // (url, options, env) => Promise<Response>, egress-gated
  isEgressAllowed: config.isOpenRouterEgressAllowed,  // (env) => boolean
  resolveDataDir: config.resolveArmospheraOneDataDir, // () => string
  modelKeys: config.modelKeys,                        // { [aspect]: string }
  defaultModels: config.defaultModels,                // { [aspect]: string }
  openrouter: { apiKey, baseUrl },                    // optional; degrades to FALLBACK_MODELS if unset
});
```

This signature is **public API**. Changes to it require:

1. Bumping major version (v1.x → v2.0).
2. Updating all 4 downstream `package.json` to new SHA in lockstep.
3. Coordinating 4 PRs across 4 repos in order: AI-Core first, consumers second.

Within a minor version (e.g. v0.x → v0.y), you may add fields but **never remove or
rename** any existing field.

## 1. What this repo provides

| Area | Export | Notes |
|------|--------|-------|
| Model menu | `createModelCatalog({ safeFetch, isEgressAllowed, openrouter })` | Live OpenRouter `/models`; degrades to `FALLBACK_MODELS` (never throws) when egress is blocked. |
| Model policy | `resolveModelForRequest(policy, { aspect, module })` | Pure precedence: **module → aspect → default → "" (auto)**. |
| Local settings | `createSettingsStore({ resolveDataDir, modelKeys, defaultModels })` | `0600` JSON: OpenRouter key + per-aspect model policy + Open Notebook connector. |
| Open Notebook | `createOpenNotebook({ safeFetch })` | Opt-in, egress-gated, **non-throwing** (`[]` on any failure). |
| Supplemental | `normalizeSupplementalSources(rows)` | Advisory-only ranking/dedupe/cap. |
| Product research | `renderProductResearchProgram()` / `decideExperimentStatus()` / TSV helpers | Karpathy-style narrow agent/eval loop primitives. Pure helpers only. |

`@a1/ai` performs **no LLM calls itself** and imports **no product config**. Every
capability that touches the outside world (HTTP/egress) or the filesystem (the data
dir) is **injected** by the host product.

## 2. Workflow — Test-Driven Development (TDD)

**Mandatory for every non-trivial change.**

1. Write the test first (RED) in `test/<name>.test.js`. Tests must mock `safeFetch`
   (no real network). Use the synthetic `FALLBACK_MODELS` for non-throwing tests.
2. Run `npm test` and confirm it fails for the right reason.
3. Write the minimum implementation in `src/<name>.js` (GREEN).
4. Re-export from `index.js`.
5. Run `npm test` and confirm green.
6. Run the Karpathy eval lane `di-contract-frozen` to confirm signature stability.
7. Commit with conventional prefix.

## 3. The 1 file you must NOT edit without coordination

- **`index.js`** — the public exports. Adding a new export is OK; renaming/removing is
  a breaking change requiring a coordinated 4-repo bump.

## 4. Coverage Floor — 80%

- Unit tests in `test/` (`node --test`).
- Coverage is measured per touched module.
- New exports must come with new tests in the same PR.

## 5. Conventional Commits

```
<type>(<scope>): <description>

<optional body> — must call out any DI-contract change as BREAKING
```

- Use `feat!:` or `fix!:` prefix when changing the frozen contract.
- Body must include the consumer-bump checklist:
  ```
  Consumer bump checklist:
    - [ ] A1-Suite-Local-MAX — bump @a1/ai
    - [ ] A1-Suite-Local-ANT — bump @a1/ai
    - [ ] autoresearch-sboss — verify karpathy-eval.mjs still loads
    - [ ] A1-portfolio — update pinned SHA in ARCHITECTURE.md
  ```

## 6. Sovereignty Posture

`@a1/ai` runs in a sovereign context — every consumer is air-gapped.

- `FALLBACK_MODELS` is the offline-mode safety net — never remove or rename it.
- All network paths go through the injected `safeFetch` (which the consumer gates).
- All filesystem paths go through the injected `resolveDataDir`.
- No `require('fs')`, `require('http')`, `require('https')`, `require('net')` at the
  top level — every I/O must be behind the DI surface.

## 7. No Hardcoded Secrets, No Hardcoded Paths

- API keys, model names, URLs must come through DI or env.
- No `path.join(__dirname, ...)` for data files — use `resolveDataDir()`.

## 8. Files, Functions, Nesting

- One concept per file. Aim for 200–400 lines, 800 hard cap.
- Functions: <50 lines, single responsibility.
- No nesting deeper than 4 levels.

## 9. JavaScript Discipline

- Zero runtime dependencies. CommonJS.
- Node ≥ 22.5 (engines in `package.json`).
- Test runner: `node --test` (the `--test-timeout` flag is Node 20+ — fine here since
  we target Node 22.5+).
- No TypeScript, no transpilation. Plain ES2022 + CommonJS.

## 10. No Debug Noise

- `console.log` is for development only. Use a no-op or the injected logger.
- No commented-out code in PRs.

## 11. Karpathy Eval Lane

This repo **is** a Karpathy eval-lane consumer. `scripts/karpathy-eval.mjs` in
consumer repos loads `@a1/ai` to drive product-research evals. Any change to the
Karpathy-facing exports (`renderProductResearchProgram`, `decideExperimentStatus`,
TSV helpers) must be backward-compatible within a minor version.

## 12. Day-One Checklist

```
1. cat AGENTS.md             # this file — read the DI contract section FIRST
2. cat README.md             # API surface
3. cat INTEGRATION.md        # per-product consumption recipe
4. cat index.js              # the public exports
5. npm install && npm test   # confirm baseline green
6. Run: node scripts/karpathy-eval.mjs --list   # verify eval lanes load
7. Now edit.
```

If `npm test` baseline fails: STOP. Do not edit around a broken baseline.

---

*Adapted from `armosphera/SBOS-A1-ERP/AGENTS.md`. Specializes for the DI-contract-frozen
invariant. License: Proprietary (`LicenseRef-Armosphera-Proprietary`). See `LICENSE`.*