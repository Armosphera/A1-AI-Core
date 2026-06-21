# Extension roadmap — @a1/ai (A1-AI-Core)

Status checklist. `[x]` = shipped + tests green + README updated + INTEGRATION.md
updated (if affected) + `.orchestration/<task>-done` touched.

## Capabilities shipped (already exported)

- [x] `createModelCatalog` — live OpenRouter model menu (degrades to FALLBACK_MODELS)
- [x] `resolveModelForRequest` — module → aspect → default → auto precedence
- [x] `createSettingsStore` — local JSON settings (0600 perms)
- [x] `createOpenNotebook` — opt-in RAG connector (non-throwing)
- [x] `normalizeSupplementalSources` — advisory dedupe/cap
- [x] `renderProductResearchProgram` / `decideExperimentStatus` — Karpathy eval primitives
- [x] `callModel` / `callVision` / `callStructured` — OpenRouter chat-completions client

## Capabilities to add (roadmap)

- [ ] **Anthropic native provider adapter** — `createAnthropicAdapter({ safeFetch, apiKey })`
- [ ] **Local Ollama catalog** — `createOllamaCatalog({ safeFetch, baseUrl })` for offline
- [ ] **Anthropic prompt caching wrapper** — caching for large system prompts
- [ ] **Streaming response helper** — `streamCallModel({ ... })` returns AsyncIterable
- [ ] **Multi-modal input** — image + text in `callVision`
- [ ] **`FALLBACK_MODELS` refresh utility** — fetch fallback list from a pinned URL,
      cache locally

## Eval lanes to add

- [ ] **`di-contract-frozen`** — fail CI if `createAi()` signature changes
- [ ] **`fallback-models-stability`** — fail CI if `FALLBACK_MODELS` is renamed/removed
- [ ] **`safeFetch-required`** — fail CI if any new module imports `http`/`https`/`fetch`

## Coordination

- All changes ripple to 4 downstream consumers. Use conventional major/minor/patch
  bumps as documented in AGENTS.md.
- The Pinned-SHA bump checklist in AGENTS.md §"Consumer bump checklist" is the
  canonical coordination recipe.