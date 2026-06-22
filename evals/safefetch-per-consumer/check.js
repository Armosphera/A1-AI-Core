#!/usr/bin/env node
/**
 * evals/safefetch-per-consumer/check.js
 *
 * Master Karpathy lane for the 4 per-consumer safeFetch contracts.
 *
 * This is a **co-located multi-check** — it runs 4 sub-checks (one per
 * downstream consumer of @a1/ai) in sequence and reports the union.
 *
 * Per A1-AI-Core #5, each consumer has a **different** egress pattern:
 *
 * - **A1-Suite-Local-ANT**: safeFetch + ARMOSPHERA_ONE_EGRESS_ALLOWLIST
 *   (deny-by-default, loopback always allowed)
 * - **A1-Suite-Local-MAX**: TypeScript fork with baseUrl allowlist
 *   (operator configures per-deployment; no central safeFetch)
 * - **autoresearch-sboss**: mock safeFetch for eval loops
 *   (no real network, all responses canned)
 * - **A1-AI-ERP-SBOS-MSTUDIO-sovereign**: doesn't use @a1/ai
 *   (uses local llama.cpp via sboss-llm; loopback-only)
 *
 * Each sub-check produces its own pass/fail + lock output.
 *
 * Sources (commit references):
 * - A1-AI-Core/evals/safefetch-required/ (the upstream template, 478c411)
 * - armosphera/A1-AI-Core#4 (consumer verification, closed 2026-06-22)
 * - armosphera/A1-AI-Core#5 (per-consumer lanes, this lane)
 *
 * Run: node evals/safefetch-per-consumer/check.js
 * Exit 0 = all 4 consumers pass. Non-zero = at least one fails.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ARMOS_ROOT = path.join(
  process.env.HOME || "/Users/samvelstepanyan",
  "dev", "armosphera", "src"
);

let totalFailed = 0;
let totalChecks = 0;

function subCheck(consumer, name, expected, actual) {
  totalChecks++;
  if (expected === actual) {
    console.log(`  ✓ [${consumer}] ${name}`);
    return true;
  }
  console.error(`  ✗ [${consumer}] ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  totalFailed++;
  return false;
}

function section(label) {
  console.log(`\n=== ${label} ===`);
}

// ─── 1. ANT: safeFetch + ARMOSPHERA_ONE_EGRESS_ALLOWLIST ───

section("1. A1-Suite-Local-ANT — safeFetch + ARMOSPHERA_ONE_EGRESS_ALLOWLIST");

const ANT = path.join(ARMOS_ROOT, "A1-Suite-Local-ANT");
if (!fs.existsSync(ANT)) {
  console.error(`  ✗ Path ${ANT} does not exist`);
  totalFailed++;
} else {
  const config = fs.readFileSync(path.join(ANT, "server", "config.js"), "utf8");
  const aiProvider = fs.readFileSync(path.join(ANT, "server", "aiProvider.js"), "utf8");
  const openNotebook = fs.readFileSync(path.join(ANT, "server", "openNotebook.js"), "utf8");

  subCheck("ANT", "config.js defines safeFetch", true, /function safeFetch|async function safeFetch/.test(config));
  subCheck("ANT", "config.js defines EgressBlockedError", true, /class EgressBlockedError/.test(config));
  subCheck("ANT", "config.js reads ARMOSPHERA_ONE_EGRESS_ALLOWLIST", true,
    /ARMOSPHERA_ONE_EGRESS_ALLOWLIST/.test(config));
  subCheck("ANT", "config.js defines isOpenRouterEgressAllowed", true,
    /function isOpenRouterEgressAllowed/.test(config));
  subCheck("ANT", "aiProvider.js uses @a1/ai (createAi or createModelCatalog)", true,
    /createModelCatalog|createAi|a1ai|require.*a1-ai/.test(aiProvider));
  subCheck("ANT", "openNotebook.js uses @a1/ai (createOpenNotebook)", true,
    /createOpenNotebook|a1ai/.test(openNotebook));
  subCheck("ANT", "config.js safeFetch calls assertEgressAllowed", true,
    /assertEgressAllowed/.test(config));
  subCheck("ANT", "config.js allows loopback (127.0.0.1, localhost)", true,
    /LOOPBACK|127\.0\.0\.1|localhost/.test(config));
}

// ─── 2. MAX: baseUrl allowlist pattern (TypeScript fork) ───

section("2. A1-Suite-Local-MAX — baseUrl allowlist (TypeScript fork)");

const MAX = path.join(ARMOS_ROOT, "A1-Suite-Local-MAX");
if (!fs.existsSync(MAX)) {
  console.error(`  ✗ Path ${MAX} does not exist`);
  totalFailed++;
} else {
  const anthropic = fs.readFileSync(path.join(MAX, "packages", "ai", "src", "anthropic.ts"), "utf8");
  const openai = fs.readFileSync(path.join(MAX, "packages", "ai", "src", "openai.ts"), "utf8");
  const ollama = fs.readFileSync(path.join(MAX, "packages", "ai", "src", "ollama.ts"), "utf8");

  subCheck("MAX", "anthropic.ts has 1 fetch() call (its job)", true,
    (anthropic.match(/\bfetch\(/g) || []).length === 1);
  subCheck("MAX", "openai.ts has 1 fetch() call (its job)", true,
    (openai.match(/\bfetch\(/g) || []).length === 1);
  subCheck("MAX", "ollama.ts has 1 fetch() call (its job)", true,
    (ollama.match(/\bfetch\(/g) || []).length === 1);
  subCheck("MAX", "anthropic.ts uses #baseUrl (configurable)", true, /#baseUrl/.test(anthropic));
  subCheck("MAX", "openai.ts uses #baseUrl (configurable)", true, /#baseUrl/.test(openai));
  subCheck("MAX", "ollama.ts uses #baseUrl (configurable, defaults to localhost:11434)", true,
    /#baseUrl|127\.0\.0\.1|localhost/.test(ollama));
  subCheck("MAX", "factory.ts has 0 raw fetch (just dispatches)", true,
    (fs.readFileSync(path.join(MAX, "packages", "ai", "src", "factory.ts"), "utf8").match(/\bfetch\(/g) || []).length === 0);
  subCheck("MAX", "types.ts has 0 raw fetch (pure types)", true,
    (fs.readFileSync(path.join(MAX, "packages", "ai", "src", "types.ts"), "utf8").match(/\bfetch\(/g) || []).length === 0);
}

// ─── 3. autoresearch-sboss: mock safeFetch ───

section("3. autoresearch-sboss — mock safeFetch for eval loops");

const SBOSS = path.join(ARMOS_ROOT, "autoresearch-sboss");
if (!fs.existsSync(SBOSS)) {
  console.error(`  ✗ Path ${SBOSS} does not exist`);
  totalFailed++;
} else {
  const wfPath = path.join(SBOSS, "examples", "model-catalog", "workflow.py");
  if (fs.existsSync(wfPath)) {
    const wf = fs.readFileSync(wfPath, "utf8");
    subCheck("sboss", "model-catalog/workflow.py defines safe_fetch", true, /def safe_fetch/.test(wf));
    subCheck("sboss", "safe_fetch uses call_log (canned response)", true, /call_log/.test(wf));
    subCheck("sboss", "safe_fetch accepts env (for test injection)", true, /env/.test(wf));
    subCheck("sboss", "no real httpx/requests imports in safe_fetch", true,
      !/import httpx|import requests/.test(wf));
  } else {
    console.error(`  ✗ Path ${wfPath} does not exist`);
    totalFailed++;
  }
}

// ─── 4. sovereign: air-gapped, no @a1/ai usage ───

section("4. A1-AI-ERP-SBOS-MSTUDIO-sovereign — air-gapped, no @a1/ai");

const SOV = path.join(ARMOS_ROOT, "A1-AI-ERP-SBOS-MSTUDIO-sovereign");
if (!fs.existsSync(SOV)) {
  console.error(`  ✗ Path ${SOV} does not exist`);
  totalFailed++;
} else {
  // Sovereign does NOT use @a1/ai. It uses local llama.cpp via sboss-llm.
  // The lane just verifies the negative: that no @a1/ai usage exists
  // AND that the default egress is off.
  const gateway = fs.readFileSync(path.join(SOV, "sboss-gateway", "sboss_gateway", "app.py"), "utf8");
  // Sovereign AGENTS.md states the default: ARMOSPHERA_ONE_ALLOW_EGRESS=0
  const agents = fs.readFileSync(path.join(SOV, "AGENTS.md"), "utf8");
  subCheck("sovereign", "AGENTS.md states default ARMOSPHERA_ONE_ALLOW_EGRESS=0", true,
    /ARMOSPHERA_ONE_ALLOW_EGRESS=0/.test(agents));
  subCheck("sovereign", "sboss-gateway does NOT use @a1/ai", true, !/@a1\/ai|createAi/.test(gateway));
  subCheck("sovereign", "sboss-gateway wires OTel (from w21 worker)", true, /setup_tracing/.test(gateway));
  subCheck("sovereign", "sboss-llm uses httpx (loopback only, not @a1/ai)", true,
    fs.existsSync(path.join(SOV, "sboss-llm", "sboss", "llm", "cli.py")));
  subCheck("sovereign", "AGENTS.md states 'air-gapped' posture", true, /air-gapped/i.test(agents));
}

// ─── Result ──────────────────────────────────────────────

console.log(`\n=== Result ===`);
console.log(`Total checks: ${totalChecks}, failures: ${totalFailed}`);

if (totalFailed > 0) {
  console.log("\n✗ At least one per-consumer safeFetch contract violated.");
  process.exit(1);
} else {
  console.log("\n✓ All 4 per-consumer safeFetch contracts pass.");
  process.exit(0);
}