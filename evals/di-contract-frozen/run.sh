#!/usr/bin/env bash
# evals/di-contract-frozen/run.sh
#
# Runs the di-contract-frozen Karpathy eval lane.
#
# Usage:
#   bash evals/di-contract-frozen/run.sh
#   npm run karpathy:run -- di-contract-frozen

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

echo "=== Karpathy eval: di-contract-frozen ==="
echo "Repo root: $REPO_ROOT"
echo

# acorn is a devDependency. Install if missing.
if [ ! -d node_modules/acorn ]; then
  echo "→ acorn not in node_modules; running npm install --no-audit --no-fund"
  npm install --no-audit --no-fund
fi

echo "→ Running check.js"
node evals/di-contract-frozen/check.js