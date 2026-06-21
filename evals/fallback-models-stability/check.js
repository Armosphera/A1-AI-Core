#!/usr/bin/env node
/**
 * evals/fallback-models-stability/check.js
 *
 * Locks the FALLBACK_MODELS constant in src/model-policy.js.
 *
 * Asserts:
 * 1. const FALLBACK_MODELS = ... declaration exists
 * 2. The value is an ArrayExpression
 * 3. Array has ≥ EXPECTED_MIN_MODELS entries
 * 4. Each entry has `id` and `name` properties
 * 5. The declaration is wrapped in Object.freeze(...) (i.e. the array is frozen)
 *
 * Exit 0 = pass. Non-zero = drift detected.
 *
 * Run:
 *   node evals/fallback-models-stability/check.js
 *
 * Requires: acorn (devDependency)
 */

"use strict";

const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

// ─── Frozen contract ─────────────────────────────────────────────────────────
//
// Update MIN_MODELS if you intentionally add a model and want to enforce
// "at least N entries". Renames, removals, or un-freezing = fail.

const EXPECTED_MIN_MODELS = 3;
const REQUIRED_FIELDS = ["id", "name"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

let failures = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failures += 1;
}

function pass(msg) {
  console.log(`PASS: ${msg}`);
}

// ─── Load + parse model-policy.js ────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const POLICY_PATH = path.join(REPO_ROOT, "src", "model-policy.js");

if (!fs.existsSync(POLICY_PATH)) {
  fail(`src/model-policy.js not found at ${POLICY_PATH}`);
  process.exit(1);
}

const source = fs.readFileSync(POLICY_PATH, "utf8");

let ast;
try {
  ast = acorn.parse(source, {
    ecmaVersion: "latest",
    sourceType: "script",
    allowReturnOutsideFunction: false,
    allowHashBang: true,
  });
} catch (e) {
  fail(`acorn parse failed: ${e.message}`);
  process.exit(1);
}

// ─── Check 1: const FALLBACK_MODELS declaration exists ───────────────────────

function findDeclaration(node, name) {
  if (!node || typeof node !== "object") return null;
  if (node.type === "VariableDeclaration") {
    for (const decl of node.declarations) {
      if (
        decl.type === "VariableDeclarator" &&
        decl.id.type === "Identifier" &&
        decl.id.name === name
      ) {
        return decl;
      }
    }
  }
  for (const key of Object.keys(node)) {
    if (key === "type") continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) {
        const found = findDeclaration(c, name);
        if (found) return found;
      }
    } else if (child && typeof child === "object") {
      const found = findDeclaration(child, name);
      if (found) return found;
    }
  }
  return null;
}

const fallbackDecl = findDeclaration(ast, "FALLBACK_MODELS");
if (!fallbackDecl) {
  fail("const FALLBACK_MODELS declaration not found in src/model-policy.js");
  process.exit(1);
}
pass("FALLBACK_MODELS declaration exists");

// ─── Check 2: Object.freeze wrapping the array ─────────────────────────────

// The declaration's `init` should be a CallExpression `Object.freeze([...])`.
// Walk: decl.init is CallExpression, callee is MemberExpression
// `Object.freeze`, arguments[0] is ArrayExpression.
const init = fallbackDecl.init;
if (!init || init.type !== "CallExpression") {
  fail(
    "FALLBACK_MODELS must be wrapped in Object.freeze(...) — " +
    `found init.type = ${init ? init.type : "(missing)"}. ` +
    "Removing the freeze lets mutation leak into the offline menu."
  );
} else {
  const callee = init.callee;
  const isFreezeCall =
    callee.type === "MemberExpression" &&
    callee.object.type === "Identifier" &&
    callee.object.name === "Object" &&
    callee.property.type === "Identifier" &&
    callee.property.name === "freeze";

  if (!isFreezeCall) {
    fail(
      `FALLBACK_MODELS init is a CallExpression but not Object.freeze() — ` +
      `callee.type = ${callee.type}. Restore the freeze.`
  );
} else {
    pass("FALLBACK_MODELS is wrapped in Object.freeze(...)");
  }
}

// The argument to Object.freeze should be an ArrayExpression.
const arrayExpr = init.arguments && init.arguments[0];
if (!arrayExpr || arrayExpr.type !== "ArrayExpression") {
  fail(
    "FALLBACK_MODELS must be wrapped as `Object.freeze([...])` — " +
    "the first argument to Object.freeze is not an ArrayExpression."
  );
} else {
  const n = arrayExpr.elements.length;
  if (n < EXPECTED_MIN_MODELS) {
    fail(
      `FALLBACK_MODELS has ${n} entries, expected at least ${EXPECTED_MIN_MODELS}. ` +
      `Shrinking the offline menu breaks every A1 product in sovereign/air-gapped deploys.`
    );
  } else {
    pass(`FALLBACK_MODELS has ${n} entries (≥ ${EXPECTED_MIN_MODELS})`);
  }

  // ─── Check 3: each entry has required fields ───────────────────────────

  let entryFailures = 0;
  for (let i = 0; i < arrayExpr.elements.length; i += 1) {
    const el = arrayExpr.elements[i];
    if (!el || el.type !== "ObjectExpression") {
      fail(`FALLBACK_MODELS[${i}] is not an ObjectExpression`);
      entryFailures += 1;
      continue;
    }
    const fields = new Set();
    for (const prop of el.properties) {
      if (prop.type === "Property" && prop.key.type === "Identifier") {
        fields.add(prop.key.name);
      }
    }
    for (const required of REQUIRED_FIELDS) {
      if (!fields.has(required)) {
        fail(`FALLBACK_MODELS[${i}] missing required field '${required}'`);
        entryFailures += 1;
      }
    }
  }
  if (entryFailures === 0) {
    pass(`All ${arrayExpr.elements.length} entries have required fields (${REQUIRED_FIELDS.join(", ")})`);
  }
}

// ─── Verdict ─────────────────────────────────────────────────────────────────

if (failures > 0) {
  console.error(`\n${failures} failure(s) — FALLBACK_MODELS contract drift detected.`);
  console.error(
    "Read evals/fallback-models-stability/program.md for the recovery procedure."
  );
  process.exit(1);
}

console.log(
  `\nFALLBACK_MODELS frozen: ≥${EXPECTED_MIN_MODELS} entries, all with ${REQUIRED_FIELDS.join(", ")}, wrapped in Object.freeze.`
);
process.exit(0);