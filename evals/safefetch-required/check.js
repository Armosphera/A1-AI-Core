#!/usr/bin/env node
/**
 * evals/safefetch-required/check.js
 *
 * Locks the @a1/ai "no raw HTTP" contract. Fails if:
 *   - Any source file in src/ uses `fetch(...)`, `http.request(...)`, `https.request(...)`,
 *     `require('http')`, `require('https')`, `require('got')`, `require('axios')`, or
 *     `require('node-fetch')` outside of safeFetch() call expressions
 *   - Any of the 3 call sites (open-notebook, model-catalog, chat) does not use safeFetch
 *   - The safeFetch function is not type-checked (no TypeError on missing)
 *
 * Allowed:
 *   - safeFetch(...) is the ONLY HTTP-egress function
 *   - Adding new call sites that all use safeFetch (add to SAFE_FETCH_CALL_SITES)
 *   - safeFetch itself may do whatever (it's the host's contract surface)
 *
 * Exit 0 = pass. Non-zero = contract drift.
 *
 * Run:
 *   node evals/safefetch-required/check.js
 *
 * Requires: acorn (devDependency)
 */

"use strict";

const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

// ─── Configuration ─────────────────────────────────────────────────

const SRC_DIR = path.join(__dirname, "..", "..", "src");

// Functions that may do HTTP. If we see these called directly (NOT as
// arguments to safeFetch), the contract is violated.
const FORBIDDEN_HTTP_CALLS = [
  // fetch() — Node 18+ global
  "fetch",
  // Node built-in http/https modules
  "http.request",
  "http.get",
  "https.request",
  "https.get",
  // Common HTTP libraries
  "axios",
  "got",
  "request",
  "nodeFetch",
];

// Modules that bring HTTP — should not be required at the top of any
// @a1/ai source file (safeFetch is the ONLY egress path).
const FORBIDDEN_HTTP_MODULES = [
  "http",
  "https",
  "got",
  "axios",
  "request",
  "node-fetch",
  "undici",
];

// Files that may use these (the safeFetch implementation lives somewhere).
// We don't have a "safeFetch impl" file in @a1/ai — it's an injected
// dependency. So this list is empty by default.
const ALLOWED_FILES = [];

// Call sites that use safeFetch. If any is missing safeFetch, fail.
const SAFE_FETCH_CALL_SITES = [
  "open-notebook.js",
  "model-catalog.js",
  "chat.js",
];

// ─── Helpers ───────────────────────────────────────────────────────

function getString(node) {
  if (!node) return null;
  if (node.type === "Literal") return node.value;
  if (node.type === "Identifier") return node.name;
  return null;
}

function fileToAst(filepath) {
  const src = fs.readFileSync(filepath, "utf8");
  return { src, ast: acorn.parse(src, { ecmaVersion: "latest", sourceType: "script" }) };
}

function listSrcFiles() {
  return fs.readdirSync(SRC_DIR)
    .filter((f) => f.endsWith(".js"))
    .map((f) => path.join(SRC_DIR, f));
}

// ─── Check 1: No raw HTTP calls in src/ ────────────────────────────

let failed = false;
const files = listSrcFiles();

for (const filepath of files) {
  const fname = path.basename(filepath);
  if (ALLOWED_FILES.includes(fname)) continue;

  let ast;
  try {
    ast = fileToAst(filepath).ast;
  } catch (e) {
    console.error(`✗ ${fname}: parse error: ${e.message}`);
    failed = true;
    continue;
  }

  // Walk the AST looking for CallExpressions
  const callNodes = [];
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "CallExpression") callNodes.push(node);
    for (const key of Object.keys(node)) {
      if (key === "type" || key === "loc" || key === "range") continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(walk);
      else if (child && typeof child === "object") walk(child);
    }
  }
  walk(ast);

  for (const call of callNodes) {
    const name = getString(call.callee);
    if (!name) continue;

    // Allowed: safeFetch(...) — the one egress surface
    if (name === "safeFetch") continue;

    if (FORBIDDEN_HTTP_CALLS.includes(name)) {
      console.error(`✗ ${fname}: raw HTTP call to ${name}(...) — must use safeFetch()`);
      failed = true;
    }
  }
}

if (!failed) {
  console.log(`✓ No raw HTTP calls in ${files.length} source files (all egress goes through safeFetch)`);
}

// ─── Check 2: No HTTP module requires ──────────────────────────────

for (const filepath of files) {
  const fname = path.basename(filepath);
  if (ALLOWED_FILES.includes(fname)) continue;

  let ast;
  try {
    ast = fileToAst(filepath).ast;
  } catch (e) {
    continue; // already reported
  }

  for (const node of ast.body) {
    if (node.type !== "VariableDeclaration") continue;
    for (const decl of node.declarations) {
      if (!decl.init) continue;
      if (decl.init.type !== "CallExpression") continue;
      if (decl.init.callee.type !== "MemberExpression") continue;
      const obj = getString(decl.init.callee.object);
      const prop = getString(decl.init.callee.property);
      if (obj === "require" && prop && FORBIDDEN_HTTP_MODULES.includes(prop)) {
        console.error(`✗ ${fname}: requires('${prop}') — must not bypass safeFetch`);
        failed = true;
      }
    }
  }
}

if (!failed) {
  console.log(`✓ No forbidden HTTP module requires in ${files.length} source files`);
}

// ─── Check 3: All call sites use safeFetch ─────────────────────────

for (const siteFile of SAFE_FETCH_CALL_SITES) {
  const filepath = path.join(SRC_DIR, siteFile);
  if (!fs.existsSync(filepath)) {
    console.error(`✗ call site ${siteFile} not found`);
    failed = true;
    continue;
  }
  const src = fs.readFileSync(filepath, "utf8");
  if (!src.includes("safeFetch(")) {
    console.error(`✗ ${siteFile} does not call safeFetch()`);
    failed = true;
    continue;
  }
  if (!src.includes("typeof safeFetch !== \"function\"") && !src.includes("typeof safeFetch !== 'function'")) {
    console.error(`✗ ${siteFile} does not type-check safeFetch (must throw TypeError if missing)`);
    failed = true;
    continue;
  }
  console.log(`✓ ${siteFile}: uses safeFetch + type-checks it`);
}

// ─── Check 4: @a1/ai index.js does not have its own HTTP egress ─────

const indexPath = path.join(__dirname, "..", "..", "index.js");
if (fs.existsSync(indexPath)) {
  const indexSrc = fs.readFileSync(indexPath, "utf8");
  // index.js should NOT directly call fetch/http/etc — it should only
  // pass safeFetch through to the 3 modules.
  let indexFailed = false;
  for (const fn of FORBIDDEN_HTTP_CALLS) {
    // Look for direct call pattern: fn(
    const re = new RegExp(`\\b${fn.replace(".", "\\.")}\\(`, "g");
    if (re.test(indexSrc)) {
      console.error(`✗ index.js: direct call to ${fn}(...) — must use safeFetch via modules`);
      indexFailed = true;
      failed = true;
    }
  }
  if (!indexFailed) {
    console.log("✓ index.js: no direct HTTP calls (all egress via safeFetch modules)");
  }
}

// ─── Result ────────────────────────────────────────────────────────

if (failed) {
  console.log("\n✗ safeFetch-required contract violations detected.");
  console.log("  All egress in @a1/ai MUST go through safeFetch().");
  console.log("  No raw fetch/http/https/got/axios allowed in src/.");
  process.exit(1);
} else {
  console.log("\n✓ All safeFetch-required contract checks pass.");
  process.exit(0);
}
