#!/usr/bin/env bash
# evals/fallback-models-stability/run.sh
#
# Runs the fallback-models-stability Karpathy eval lane.
#
# Usage:
#   bash evals/fallback-models-stability/run.sh
#   npm run karpathy:run -- fallback-models-stability

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

echo "=== Karpathy eval: fallback-models-stability ==="
echo "Repo root: $REPO_ROOT"
echo

# acorn is a devDependency. Install if missing.
if [ ! -d node_modules/acorn ]; then
  echo "→ acorn not in node_modules; running npm install --no-audit --no-fund"
  npm install --no-audit --no-fund
fi

echo "→ Running check.js"
node evals/fallback-models-stability/check.js