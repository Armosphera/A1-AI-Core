#!/usr/bin/env node
/**
 * evals/di-contract-frozen/check.js
 *
 * Locks the @a1/ai createAi() signature. Fails if:
 * - createAi() is missing
 * - createAi() destructures a different set of fields
 * - field order changes
 * - field names change (rename = breaking)
 * - field defaults change
 * - module.exports drops a frozen export name
 *
 * Allowed: adding new fields at the end (must update EXPECTED_FIELDS),
 *          adding new exports to module.exports.
 *
 * Exit 0 = pass. Non-zero = drift detected.
 *
 * Run:
 *   node evals/di-contract-frozen/check.js
 *
 * Requires: acorn (devDependency)
 */

"use strict";

const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

// ─── Frozen contract ─────────────────────────────────────────────────────────
//
// Update THIS list when intentionally adding a new field to createAi().
// New fields go at the END. Renames, removals, reorderings = fail.

const EXPECTED_FIELDS = [
  "safeFetch",
  "isEgressAllowed",
  "openrouter",
  "resolveDataDir",
  "fileName",
  "modelKeys",       // default: policy.MODEL_KEYS
  "defaultModels",   // default: {}
];

// Defaults that must be preserved (as substrings of the source line).
const EXPECTED_DEFAULTS = {
  modelKeys: "MODEL_KEYS",
  defaultModels: "{}",
};

// Frozen module.exports entries (in any order).
const EXPECTED_EXPORTS = [
  "createAi",
  "createModelCatalog",
  "createSettingsStore",
  "createOpenNotebook",
  "createChatClient",
  "normalizeModels",
  "resolveModelForRequest",
  "FALLBACK_MODELS",
  "MODEL_KEYS",
  "MODULES",
  "ASPECTS",
  "normalizeSupplementalSources",
  "MAX_SUPPLEMENTAL_SOURCES",
  "productResearch",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

let failures = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failures += 1;
}

function pass(msg) {
  console.log(`PASS: ${msg}`);
}

// ─── Load + parse index.js ───────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const INDEX_PATH = path.join(REPO_ROOT, "index.js");

if (!fs.existsSync(INDEX_PATH)) {
  fail(`index.js not found at ${INDEX_PATH}`);
  process.exit(1);
}

const source = fs.readFileSync(INDEX_PATH, "utf8");

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

// ─── Check 1: createAi() exists ──────────────────────────────────────────────

function findFunctionDecl(node, name) {
  if (!node || typeof node !== "object") return null;
  if (node.type === "FunctionDeclaration" && node.id && node.id.name === name) {
    return node;
  }
  for (const key of Object.keys(node)) {
    if (key === "type") continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) {
        const found = findFunctionDecl(c, name);
        if (found) return found;
      }
    } else if (child && typeof child === "object") {
      const found = findFunctionDecl(child, name);
      if (found) return found;
    }
  }
  return null;
}

const createAi = findFunctionDecl(ast, "createAi");
if (!createAi) {
  fail("createAi() not found at top level");
} else {
  pass("createAi() exists");

  // ─── Check 2: parameter is `deps` (optionally with default `= {}`) ──────

  const params = createAi.params;
  if (params.length !== 1) {
    fail(`createAi() must take exactly 1 parameter, found ${params.length}`);
  } else {
    const param = params[0];
    if (param.type !== "AssignmentPattern" && param.type !== "Identifier") {
      fail(`createAi() parameter must be 'deps', got type '${param.type}'`);
    } else {
      const name = param.type === "AssignmentPattern" ? param.left.name : param.name;
      if (name !== "deps") {
        fail(`createAi() parameter must be named 'deps', got '${name}'`);
      } else {
        pass("createAi() parameter is 'deps'");
      }
    }
  }

  // ─── Check 3: body destructures EXPECTED_FIELDS in order ───────────────

  // Look for: const { safeFetch, isEgressAllowed, ... } = deps;
  function findDestructuringAssignment(fnNode) {
    const body = fnNode.body.body; // BlockStatement.body
    for (const stmt of body) {
      if (stmt.type !== "VariableDeclaration") continue;
      for (const decl of stmt.declarations) {
        if (
          decl.type === "VariableDeclarator" &&
          decl.id.type === "ObjectPattern" &&
          decl.init &&
          decl.init.type === "Identifier" &&
          decl.init.name === "deps"
        ) {
          return decl.id;
        }
      }
    }
    return null;
  }

  const destructure = findDestructuringAssignment(createAi);
  if (!destructure) {
    fail("createAi() body must destructure from `deps` (e.g. const { ... } = deps;)");
  } else {
    const actualFields = destructure.properties
      .filter((p) => p.type === "Property" && p.key.type === "Identifier")
      .map((p) => p.key.name);

    const expectedSubset = EXPECTED_FIELDS.slice(0, actualFields.length);
    if (
      actualFields.length !== EXPECTED_FIELDS.length ||
      expectedSubset.some((f, i) => f !== actualFields[i])
    ) {
      fail(
        `createAi() destructures [${actualFields.join(", ")}], ` +
        `expected [${EXPECTED_FIELDS.join(", ")}]. ` +
        `Allowed: add new fields at the end (update EXPECTED_FIELDS in this lane). ` +
        `Forbidden: rename, remove, or reorder frozen fields.`
      );
    } else {
      pass(`createAi() destructures ${actualFields.length} fields in order`);
    }

    // ─── Check 4: defaults preserved ─────────────────────────────────────

    for (let i = 0; i < destructure.properties.length; i += 1) {
      const prop = destructure.properties[i];
      if (prop.type !== "Property" || prop.shorthand === false) continue;
      if (prop.value.type !== "AssignmentPattern") continue;
      const fieldName = prop.key.name;
      const defaultExpr = source.slice(prop.value.value.start, prop.value.value.end);
      const expectedDefault = EXPECTED_DEFAULTS[fieldName];
      if (!expectedDefault) continue;
      if (!defaultExpr.includes(expectedDefault)) {
        fail(
          `createAi() field '${fieldName}' default changed. ` +
          `Expected substring '${expectedDefault}' in source, got '${defaultExpr}'. ` +
          `Default changes are breaking — coordinate with consumer bump.`
        );
      } else {
        pass(`createAi() field '${fieldName}' default preserved ('${expectedDefault}')`);
      }
    }
  }
}

// ─── Check 5: module.exports includes EXPECTED_EXPORTS ──────────────────────

function findModuleExports(node) {
  if (!node || typeof node !== "object") return null;
  if (
    node.type === "ExpressionStatement" &&
    node.expression.type === "AssignmentExpression" &&
    node.expression.left.type === "MemberExpression" &&
    node.expression.left.object.type === "Identifier" &&
    node.expression.left.object.name === "module" &&
    node.expression.left.property.name === "exports"
  ) {
    return node.expression.right;
  }
  for (const key of Object.keys(node)) {
    if (key === "type") continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) {
        const found = findModuleExports(c);
        if (found) return found;
      }
    } else if (child && typeof child === "object") {
      const found = findModuleExports(child);
      if (found) return found;
    }
  }
  return null;
}

const moduleExports = findModuleExports(ast);
if (!moduleExports) {
  fail("module.exports = { ... } not found");
} else if (moduleExports.type !== "ObjectExpression") {
  fail(`module.exports right-hand side must be an object literal, got '${moduleExports.type}'`);
} else {
  const actualExports = moduleExports.properties
    .filter((p) => p.type === "Property" && p.key.type === "Identifier")
    .map((p) => p.key.name);

  const missing = EXPECTED_EXPORTS.filter((e) => !actualExports.includes(e));
  if (missing.length > 0) {
    fail(
      `module.exports missing frozen exports: ${missing.join(", ")}. ` +
      `Removing exports is breaking — coordinate with consumer bump.`
    );
  } else {
    pass(`module.exports includes all ${EXPECTED_EXPORTS.length} frozen exports`);
  }
}

// ─── Verdict ─────────────────────────────────────────────────────────────────

if (failures > 0) {
  console.error(`\n${failures} failure(s) — DI contract drift detected.`);
  console.error(
    "Read evals/di-contract-frozen/program.md for the recovery procedure. " +
    "Renames/removes require a MAJOR version bump + 4-repo SHA bump per AGENTS.md."
  );
  process.exit(1);
}

console.log(`\nAll ${EXPECTED_FIELDS.length} fields + ${EXPECTED_EXPORTS.length} exports frozen — DI contract OK.`);
process.exit(0);