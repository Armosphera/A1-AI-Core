# fallback-models-stability

Locks the **`FALLBACK_MODELS` constant** in `src/model-policy.js` so:

- The constant exists and is exported
- The array contains at least 3 model entries
- Each entry has the required fields (`id`, `name`)
- The constant is frozen (via `Object.freeze`)

## Why this matters

`FALLBACK_MODELS` is the **offline safety net** for every A1 product. When the
OpenRouter `/models` endpoint is unreachable (sovereign single-host deploys,
egress blocked), the dropdown menu falls back to this list. Removing or breaking
the constant means **every A1 product's model menu goes empty when offline**.

This lane is in the AGENTS.md as a planned eval lane. It complements
`di-contract-frozen` (which locks the DI surface) and `safeFetch-required`
(which locks the egress surface).

## What's frozen

The shape of each entry:

```js
{
  id: string,         // OpenRouter model id, e.g. "anthropic/claude-3.5-sonnet"
  name: string,       // display name
  contextLength: number,
  pricing: { prompt: number|null, completion: number|null },
}
```

**Allowed within a minor version:**
- ✅ Adding new model entries to the array
- ✅ Updating pricing.contextLength for an existing entry
- ✅ Reordering entries

**Forbidden (any of these fails the lane):**
- ❌ Removing entries (would shrink the offline menu)
- ❌ Renaming `FALLBACK_MODELS` (would break `index.js` exports)
- ❌ Removing `Object.freeze` (would let mutation leak into the offline menu)
- ❌ Removing required fields from entries (`id`, `name`)

**Allowed only with a major version bump + coordinated 4-repo SHA bump:**
- Changing field names
- Removing the `FALLBACK_MODELS` export entirely

## How the lane detects drift

`check.js` parses `src/model-policy.js` with **acorn**, walks the AST, and asserts:

1. A `const FALLBACK_MODELS = ...` declaration exists.
2. The value is an `ArrayExpression` of ≥3 elements.
3. Each element is an `ObjectExpression` with `id` and `name` properties (string-valued).
4. The declaration has a `Object.freeze(...)` wrapping the array.

## How to run

```bash
# One-off
node evals/fallback-models-stability/check.js

# As part of Karpathy lane runner
npm run karpathy:run -- fallback-models-stability

# In CI
node evals/fallback-models-stability/check.js
```

Exit 0 = pass. Non-zero = drift detected.

## How to fix a failure

- **Did you mean to add a model?** — add the entry, no changes to EXPECTED_MIN_MODELS needed.
- **Did you accidentally remove `Object.freeze`?** — restore it.
- **Did you rename the constant?** — revert.
- **Did you remove entries?** — restore them (or open a coordinated issue for a major-version bump).

## CI integration

Add to `.github/workflows/ci.yml`:

```yaml
fallback-models-stability:
  name: "Karpathy eval: fallback-models-stability"
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: '22.5' }
    - run: node evals/fallback-models-stability/check.js
```

This lane runs in CI on every push/PR. A failure blocks merge.

## Related

- `AGENTS.md` — DI-contract-frozen invariant
- `program.md` — extension loop
- `.orchestration/extension-roadmap.md` — eval lane section
- Sister lanes: `di-contract-frozen` (signature lock), `safeFetch-required` (egress lock)