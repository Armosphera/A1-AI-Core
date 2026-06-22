#!/usr/bin/env node
/**
 * evals/open-notebook-non-throwing/check.js
 *
 * Locks the non-throwing contract of `createOpenNotebook().search()`. Fails if:
 *   - The search() function throws (any error type) on bad input
 *   - The function returns non-Array (e.g. null, undefined, object) on bad input
 *   - normalizeResults() drops required fields (title, text, score, sourceUrl, origin)
 *   - normalizeResults() mutates input (should be pure)
 *   - isEnabled() returns truthy when settings.openNotebook is missing/falsy
 *   - createOpenNotebook() throws when safeFetch is missing
 *
 * Allowed: adding new fields to result rows, adding new helper exports.
 *
 * Exit 0 = pass. Non-zero = contract drift.
 *
 * Run:
 *   node evals/open-notebook-non-throwing/check.js
 */

"use strict";

const fs = require("fs");
const path = require("path");
const acorn = require("acorn");
const { Module } = require("module");

// ─── 1. Load the source and check exported names ──────────────────────

const srcPath = path.join(__dirname, "..", "..", "src", "open-notebook.js");
const src = fs.readFileSync(srcPath, "utf8");

const REQUIRED_EXPORTS = ["createOpenNotebook", "isEnabled", "normalizeResults", "DEFAULT_SEARCH_PATH"];

const ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "script" });

function getString(node) {
  if (node.type === "Literal") return node.value;
  if (node.type === "Identifier") return node.name;
  return null;
}

// Check module.exports for required names
let exportsObj = null;
for (const node of ast.body) {
  if (node.type === "ExpressionStatement" &&
      node.expression.type === "AssignmentExpression" &&
      getString(node.expression.left) === "module" &&
      getString(node.expression.right?.left) === "exports") continue;
  if (node.type === "ExpressionStatement" &&
      node.expression.type === "AssignmentExpression" &&
      node.expression.left.type === "MemberExpression" &&
      getString(node.expression.left.object) === "module" &&
      getString(node.expression.left.property) === "exports") {
    exportsObj = node.expression.right;
    if (exportsObj.type === "ObjectExpression") {
      const exportedNames = exportsObj.properties
        .filter(p => p.type === "Property" || p.type === "ObjectProperty")
        .map(p => getString(p.key) || getString(p.value));
      for (const required of REQUIRED_EXPORTS) {
        if (!exportedNames.includes(required)) {
          console.error(`✗ missing export: ${required}`);
          process.exit(1);
        }
      }
    }
  }
}

if (!exportsObj) {
  console.error("✗ no module.exports = {...} found in open-notebook.js");
  process.exit(1);
}

console.log(`✓ All required exports present: ${REQUIRED_EXPORTS.join(", ")}`);

// ─── 2. Behavioral checks (load actual module) ────────────────────────

const noteb = require(path.join(__dirname, "..", "..", "src", "open-notebook"));

// 2a. createOpenNotebook() throws when safeFetch missing
try {
  noteb.createOpenNotebook();
  console.error("✗ createOpenNotebook() should throw without safeFetch");
  process.exit(1);
} catch (e) {
  if (!/safeFetch/.test(String(e.message))) {
    console.error(`✗ unexpected error message: ${e.message}`);
    process.exit(1);
  }
}
console.log("✓ createOpenNotebook() rejects missing safeFetch");

// 2b. search() never throws on any input — return [] for all bad cases
const fakeFetch = async () => { throw new Error("network"); };
const ob = noteb.createOpenNotebook({ safeFetch: fakeFetch });

const badInputs = [
  [null, "null query"],
  [undefined, "undefined query"],
  ["", "empty string"],
  ["   ", "whitespace"],
  [123, "number"],
  [[], "array"],
  [{}, "object"],
];

(async () => {
  for (const [q, label] of badInputs) {
    try {
      const r = await ob.search(q);
      if (!Array.isArray(r)) {
        console.error(`✗ search(${label}) returned non-array: ${JSON.stringify(r)}`);
        process.exit(1);
      }
    } catch (e) {
      console.error(`✗ search(${label}) THREW: ${e.message}`);
      process.exit(1);
    }
  }
  console.log(`✓ search() returns [] for all ${badInputs.length} bad inputs (never throws)`);

  // 2c. When disabled (no settings.openNotebook), returns [] without calling fetch
  let fetchCalled = false;
  const ob2 = noteb.createOpenNotebook({ safeFetch: async () => { fetchCalled = true; return { ok: true, json: async () => ({}) }; } });
  const r = await ob2.search("test", { settings: {} });
  if (!Array.isArray(r) || r.length !== 0) {
    console.error(`✗ search with no settings should return [], got: ${JSON.stringify(r)}`);
    process.exit(1);
  }
  if (fetchCalled) {
    console.error("✗ search called fetch even when not enabled");
    process.exit(1);
  }
  console.log("✓ search() returns [] when disabled, does NOT call fetch");

  // 2d. normalizeResults() returns required fields
  const sample = [{ title: "T1", text: "hello", score: 0.9, source_url: "http://x" }];
  const normalized = noteb.normalizeResults(sample);
  if (normalized.length !== 1) {
    console.error(`✗ normalizeResults length: expected 1, got ${normalized.length}`);
    process.exit(1);
  }
  const r0 = normalized[0];
  for (const field of ["title", "text", "score", "sourceUrl", "origin"]) {
    if (r0[field] === undefined) {
      console.error(`✗ normalizeResults dropped field: ${field}`);
      process.exit(1);
    }
  }
  if (r0.origin !== "open-notebook") {
    console.error(`✗ origin should be "open-notebook", got: ${r0.origin}`);
    process.exit(1);
  }
  console.log("✓ normalizeResults() preserves required fields and sets origin='open-notebook'");

  // 2e. normalizeResults() is pure (no mutation)
  const before = JSON.stringify(sample[0]);
  noteb.normalizeResults(sample);
  const after = JSON.stringify(sample[0]);
  if (before !== after) {
    console.error("✗ normalizeResults mutated input");
    process.exit(1);
  }
  console.log("✓ normalizeResults() is pure (no input mutation)");

  // 2f. isEnabled() returns falsy when settings is missing/incomplete
  const isEnabledCases = [
    [null, false, "null settings"],
    [undefined, false, "undefined settings"],
    [{}, false, "empty settings"],
    [{ openNotebook: {} }, false, "empty openNotebook"],
    [{ openNotebook: { enabled: true } }, false, "no baseUrl"],
    [{ openNotebook: { baseUrl: "http://x" } }, false, "not enabled"],
    [{ openNotebook: { enabled: true, baseUrl: "" } }, false, "empty baseUrl"],
    [{ openNotebook: { enabled: true, baseUrl: "http://x" } }, true, "fully configured"],
    [{ openNotebook: { enabled: 1, baseUrl: "http://x" } }, true, "truthy enabled"],
  ];
  for (const [settings, expected, label] of isEnabledCases) {
    const got = Boolean(noteb.isEnabled(settings));
    if (got !== expected) {
      console.error(`✗ isEnabled(${label}): expected ${expected}, got ${got}`);
      process.exit(1);
    }
  }
  console.log(`✓ isEnabled() correct for all ${isEnabledCases.length} cases`);

  console.log("\n✓ All Open Notebook contract checks pass.");
  process.exit(0);
})();
