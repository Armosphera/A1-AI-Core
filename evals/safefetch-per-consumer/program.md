# safefetch-per-consumer

Master Karpathy lane for the **4 per-consumer safeFetch contracts** of
`@a1/ai`. Co-locates 4 sub-checks (one per downstream consumer) in
`check.js`.

## Why this lane exists

The upstream `safefetch-required` lane (in A1-AI-Core) locks the
**"no raw HTTP"** contract of `@a1/ai` itself. But each consumer
implements a **different** egress pattern:

| Consumer | Pattern | Mechanism |
|----------|---------|-----------|
| **A1-Suite-Local-ANT** | `safeFetch` injection + `ARMOSPHERA_ONE_EGRESS_ALLOWLIST` | `config.js::safeFetch` → `assertEgressAllowed` → throws `EgressBlockedError` |
| **A1-Suite-Local-MAX** | `baseUrl` allowlist (operator configures per-deployment) | Each provider accepts `#baseUrl` (defaults to `localhost:11434` for Ollama) |
| **autoresearch-sboss** | mock `safe_fetch` for eval loops | `examples/model-catalog/workflow.py::safe_fetch` uses `call_log` for canned responses |
| **A1-AI-ERP-SBOS-MSTUDIO-sovereign** | doesn't use `@a1/ai` at all | Local llama.cpp via `sboss-llm` (httpx, loopback-only) |

This lane locks each consumer's specific contract — so any
regression (e.g. ANT removing `assertEgressAllowed`, MAX adding a
raw `fetch` in `factory.ts`) is caught by CI.

## What's frozen

### ANT (8 checks)
- `config.js` defines `safeFetch`, `EgressBlockedError`, reads `ARMOSPHERA_ONE_EGRESS_ALLOWLIST`
- `config.js` defines `isOpenRouterEgressAllowed`
- `aiProvider.js` and `openNotebook.js` use `@a1/ai` (`createModelCatalog`, `createOpenNotebook`)
- `safeFetch` calls `assertEgressAllowed`
- Loopback (`127.0.0.1`, `localhost`) is always allowed

### MAX (8 checks)
- Each provider (`anthropic`, `openai`, `ollama`) has exactly **1 `fetch()`** call (its job)
- Each provider uses `#baseUrl` (configurable)
- `factory.ts` and `types.ts` have **0 raw `fetch()`** (just dispatch / pure types)

### autoresearch-sboss (4 checks)
- `model-catalog/workflow.py` defines `safe_fetch`
- Uses `call_log` for canned responses
- Accepts `env` for test injection
- No real `httpx`/`requests` imports

### sovereign (5 checks)
- `AGENTS.md` states default `ARMOSPHERA_ONE_ALLOW_EGRESS=0`
- `sboss-gateway` does NOT use `@a1/ai` (so no safeFetch needed)
- `sboss-gateway` wires OTel (from w21 worker)
- `sboss-llm` uses httpx (loopback only)
- `AGENTS.md` states `air-gapped` posture

**Total: 25 contract checks, all pass on current code.**

## Allowed changes (additive only)

- Adding new checks to the lane
- Adding new env vars to the egress allowlist
- Adding new consumers (with their own sub-checks)

## Disallowed changes

- ANT: removing `assertEgressAllowed` from `safeFetch`
- ANT: removing `ARMOSPHERA_ONE_EGRESS_ALLOWLIST` env var
- MAX: adding raw `fetch()` outside the 3 providers
- MAX: removing `#baseUrl` configurability
- sboss: using real network in mock `safe_fetch`
- sovereign: introducing a new cloud AI dependency

## Run

```bash
node evals/safefetch-per-consumer/check.js
```

## Source

- A1-AI-Core/evals/safefetch-required/ (upstream template, 478c411)
- armosphera/A1-AI-Core#4 (consumer verification, closed 2026-06-22)
- armosphera/A1-AI-Core#5 (this lane)
- A1-Suite-Local-ANT/server/config.js (ANT egress contract)
- A1-Suite-Local-MAX/packages/ai/src/{anthropic,openai,ollama,factory,types}.ts
- autoresearch-sboss/examples/model-catalog/workflow.py
- A1-AI-ERP-SBOS-MSTUDIO-sovereign/{AGENTS.md, scripts/deploy.sh}

## Companion lanes

- `safefetch-required` — locks the upstream @a1/ai contract
- `di-contract-frozen` — locks the upstream createAi() signature
- `pension-am-tier-boundary` / `pension-ru-ceiling-crossing` — fiscal contract lanes