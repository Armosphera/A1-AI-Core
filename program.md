# program.md — extend @a1/ai (add a provider / lock a contract)

You are an autonomous extension agent. Your job: **add a new AI provider or capability
to `armosphera/A1-AI-Core`** while preserving the **frozen DI contract** that 4
downstream consumers depend on.

## ⚠️ DI CONTRACT IS FROZEN — read AGENTS.md §"CRITICAL" first

The signature `createAi({ safeFetch, isEgressAllowed, resolveDataDir, modelKeys,
defaultModels, openrouter })` is **public API**. Within a minor version:

- ✅ You may add fields to the input object.
- ✅ You may add new exports.
- ❌ You may NOT remove or rename any existing field.
- ❌ You may NOT change the type of any existing field.

A breaking change requires a coordinated 4-repo SHA bump (see AGENTS.md).

## The task

Given a target capability (e.g. "add Anthropic native provider", "add local Ollama
catalog", "lock `createAi` signature via eval lane"), produce:

1. A new module under `src/<capability>.js` or `src/<provider>.js`.
2. A new export from `index.js` (additive only).
3. Tests under `test/<capability>.test.js` with mocked `safeFetch` (no real network).
4. Update `README.md` API table + `INTEGRATION.md` per-product recipe if affected.
5. **Lock the contract** by adding a Karpathy eval lane if the change is breaking.

## The loop

```
1. Read AGENTS.md §"CRITICAL" first — know the frozen contract
2. Read .orchestration/extension-roadmap.md for the next task
3. Read KARPATHY_ROLLOUT.md to see how this fits the multi-product rollout
4. Implement src/<name>.js (additive only — do not modify createAi signature)
5. Add tests with mocked safeFetch (no real network calls in CI)
6. Add eval lane if contract is at risk: scripts/karpathy-eval.mjs
7. Update README.md + INTEGRATION.md
8. Run npm test
9. Commit with conventional prefix
10. Update .orchestration/<task>-done
```

## Files you'll touch

| File | Why |
|---|---|
| `src/<capability>.js` | New module (additive) |
| `test/<capability>.test.js` | Tests with mocked safeFetch |
| `index.js` | Add new export (do not modify existing exports) |
| `README.md` | API table |
| `INTEGRATION.md` | Per-product recipe (if the new export touches it) |
| `KARPATHY_ROLLOUT.md` | Rollout tracking |

## Files you must NOT touch

- `index.js` exports that already exist — `createAi`, `createModelCatalog`,
  `resolveModelForRequest`, `createSettingsStore`, `createOpenNotebook`,
  `normalizeSupplementalSources`, `renderProductResearchProgram`,
  `decideExperimentStatus`. These are frozen within a minor version.
- The `safeFetch`, `isEgressAllowed`, `resolveDataDir` injection points. These are
  how consumers stay sovereign.

## Rules of engagement

- **Pure functions preferred.** I/O goes through injected `safeFetch` and
  `resolveDataDir`. No `require('fs')`, `require('http')`, `require('https')`,
  `require('net')` at the top level.
- **Mock `safeFetch` in tests.** Never hit the real OpenRouter API in CI.
- **`FALLBACK_MODELS` is the offline safety net.** Never remove or rename it.
- **All exports must be backwards-compatible within a minor version.**
- **Coverage ≥80% per new module.**
- **If your change touches a frozen export, that's a major version bump** —
  stop, write a 4-repo coordinated plan, and ask the operator.

## Environment

- Node ≥ 22.5 (engines in `package.json`).
- `npm install` (zero runtime deps).
- `npm test`.

## When to stop

- **Roadmap complete.**
- **Frozen contract violation detected:** STOP. File a major-version-bump issue
  against A1-AI-Core. Do not commit.
- **Cross-repo coordination needed:** open coordinated PRs against all 4 consumers
  (MAX, ANT, autoresearch-sboss, A1-portfolio docs) before merging.

## Logging

Use conventional commits:
- `feat(provider): add <provider> adapter` — additive
- `feat(eval): add di-contract-frozen lane` — lock contract
- `feat!: bump DI contract to v2` — only with operator approval

## Coordination

When you cut a new release of `@a1/ai` (v0.x.y), the 4 downstream consumers
(`A1-Suite-Local-MAX`, `A1-Suite-Local-ANT`, `autoresearch-sboss`, `A1-portfolio` docs)
need their pinned SHA updated. Land in this order:

1. A1-AI-Core: cut tag + release
2. MAX: bump SHA in package.json + verify
3. ANT: bump SHA in package.json + e2e
4. autoresearch-sboss: verify karpathy-eval.mjs still loads
5. A1-portfolio: update pinned SHA in ARCHITECTURE.md

---

*Companion to `AGENTS.md`. AGENTS.md = rules (DI contract frozen). This file =
day-to-day extension loop.*