# di-contract-frozen

Locks the **`@a1/ai` `createAi()` signature** so accidental signature drift within
a minor version fails CI before it reaches the 4 downstream consumers.

## Why this matters

4 repos pin to specific `@a1/ai` SHAs:

- `A1-Suite-Local-MAX` — `package.json devDependencies.@a1/ai`
- `A1-Suite-Local-ANT` — `package.json devDependencies.@a1/ai`
- `autoresearch-sboss` — runtime via `scripts/karpathy-eval.mjs`
- `A1-portfolio` — docs reference (pinned SHA in `ARCHITECTURE.md`)

A signature change without coordinated bump breaks all 4. This lane prevents
accidental drift within a minor version.

## What's frozen

The exact `createAi()` destructured parameter names (in order):

```js
function createAi(deps = {}) {
  const {
    safeFetch,            // (url, options, env) => Promise<Response>, egress-gated
    isEgressAllowed,      // (env) => boolean
    openrouter,           // { modelsUrl, referer, title }
    resolveDataDir,       // () => string
    fileName,             // string (default settings file name)
    modelKeys = ...,
    defaultModels = ...,
    maxOutputTokens,      // (via deps, not destructured directly)
  } = deps;
  // ...
}
```

**Allowed within a minor version:**
- ✅ Adding new fields to the input object
- ✅ Adding new exports to `module.exports`
- ✅ Adding new files under `src/`

**Forbidden (any of these fails the lane):**
- ❌ Removing any of the 7 fields above
- ❌ Renaming any of the 7 fields
- ❌ Changing the order of the 7 fields (semver preserves source-order stability)
- ❌ Removing any export from `module.exports`

**Allowed only with a major version bump + coordinated 4-repo SHA bump:**
- Changing field types
- Changing destructuring defaults
- Removing an export

## How the lane detects drift

`check.js` parses `index.js` with **acorn** (zero-dep AST parser), walks the AST,
and asserts:

1. A top-level `function createAi(...)` exists
2. Its parameter is `deps` (optionally with default `= {}`)
3. Its body contains a `VariableDeclarator` destructuring assignment matching
   the 7 frozen field names (in the same order, with the same defaults for
   `modelKeys` and `defaultModels`)
4. `module.exports` includes the frozen export names: `createAi`,
   `createModelCatalog`, `createSettingsStore`, `createOpenNotebook`,
   `createChatClient`, `normalizeModels`, `resolveModelForRequest`,
   `FALLBACK_MODELS`, `MODEL_KEYS`, `MODULES`, `ASPECTS`,
   `normalizeSupplementalSources`, `MAX_SUPPLEMENTAL_SOURCES`, `productResearch`

## How to run

```bash
# One-off (during dev)
node evals/di-contract-frozen/check.js

# As part of Karpathy lane runner
npm run karpathy:run -- di-contract-frozen

# In CI (added separately to .github/workflows/ci.yml)
node evals/di-contract-frozen/check.js
```

Exit code 0 = pass. Non-zero = drift detected (with diff in stderr).

## How to fix a failure

If the lane fails:

1. **Did you mean to change the contract?** — bump major version, coordinate
   4-repo SHA bump per `AGENTS.md §"Consumer bump checklist"`.
2. **Did you accidentally rename / reorder / remove a field?** — revert the change.
3. **Did you add a new field?** — that's allowed, but you must update
   `EXPECTED_FIELDS` in `check.js` to include the new field name (preserve
   source order — new fields go at the END).

## How to add this lane to CI

In `.github/workflows/ci.yml`, add a step:

```yaml
- name: Karpathy eval: di-contract-frozen
  run: node evals/di-contract-frozen/check.js
```

This runs on every push to `main` and every PR. A failure blocks merge.

## Why acorn

acorn is **the de-facto JavaScript parser** — zero deps, ships in Node's own
parser chain (Node uses acorn internally for `--experimental-vm-modules`).
Adding it as a devDependency is safe and minimal.

## Related

- `AGENTS.md` — DI-contract-frozen invariant, 4-repo consumer-bump checklist
- `program.md` — additive-only extension charter
- `.orchestration/extension-roadmap.md` — eval lane section
- Other planned lanes: `fallback-models-stability`, `safeFetch-required`