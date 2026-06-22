#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(process.env.A1_KARPATHY_REPO_ROOT || defaultRepoRoot);
const evalRoot = path.join(repoRoot, "evals");
const resultsDir = path.join(evalRoot, "karpathy", "results");

function usage() {
  console.error("Usage: npm run karpathy:list | npm run karpathy:program -- <lane> | npm run karpathy:run -- <lane> [--best N]");
}

function lanes() {
  if (!existsSync(evalRoot)) return [];
  return readdirSync(evalRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => existsSync(path.join(evalRoot, name, "lane.json")) || existsSync(path.join(evalRoot, name, "check.js")))
    .sort();
}

function lanePath(name) {
  const clean = String(name || "").trim();
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(clean)) {
    throw new Error(`Invalid lane name: ${name || "(missing)"}`);
  }
  const dir = path.join(evalRoot, clean);
  if (!lanes().includes(clean)) throw new Error(`Unknown Karpathy lane: ${clean}`);
  return dir;
}

function readLaneConfig(dir) {
  const file = path.join(dir, "lane.json");
  if (!existsSync(file)) return {};
  return JSON.parse(readFileSync(file, "utf8"));
}

function parseBest(argv) {
  const index = argv.indexOf("--best");
  if (index < 0) return null;
  if (!argv[index + 1]) throw new Error("--best requires a finite numeric value");
  const value = Number(argv[index + 1]);
  if (!Number.isFinite(value)) throw new Error(`Invalid --best value: ${argv[index + 1]}`);
  return value;
}

function gitShortCommit() {
  const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

function ensureDevDeps() {
  const packagePath = path.join(repoRoot, "package.json");
  if (existsSync(packagePath)) {
    const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
    const wantsAcorn = Boolean(pkg.dependencies?.acorn || pkg.devDependencies?.acorn);
    if (!wantsAcorn) return;
  }
  if (existsSync(path.join(repoRoot, "node_modules", "acorn"))) return;
  const result = spawnSync("npm", ["install", "--no-audit", "--no-fund"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit"
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

function gitStatusLines() {
  const result = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`Cannot inspect git status before Karpathy eval:\n${result.stderr || result.stdout}`);
  }
  return result.stdout.split("\n").map(line => line.trimEnd()).filter(Boolean);
}

function pathFromStatusLine(line) {
  const value = line.slice(3);
  const renameIndex = value.indexOf(" -> ");
  return renameIndex >= 0 ? value.slice(renameIndex + 4) : value;
}

function isAllowedDirtyPath(file) {
  return file === "evals/karpathy/results" || file.startsWith("evals/karpathy/results/");
}

function assertCleanForLogging(label) {
  const dirty = gitStatusLines()
    .map(pathFromStatusLine)
    .filter(file => !isAllowedDirtyPath(file));
  if (!dirty.length) return;
  throw new Error(`${label} dirty files block eval result logging:\n${dirty.map(file => `- ${file}`).join("\n")}`);
}

function commandForLane(dir, config) {
  const runPath = config.run && path.join(repoRoot, config.run);
  if (runPath && existsSync(runPath)) {
    return ["bash", [runPath]];
  }
  const checkPath = config.check ? path.join(repoRoot, config.check) : path.join(dir, "check.js");
  if (!existsSync(checkPath)) throw new Error(`No check script found for ${path.basename(dir)}`);
  return ["node", [checkPath]];
}

function extractMetric(text, exitCode) {
  const match = text.match(/(?:^|\n)\s*failing_checks\s*=\s*([-+]?\d+(?:\.\d+)?)/);
  if (match) return Number(match[1]);
  return exitCode === 0 ? 0 : 1;
}

function statusForMetric(metric, best) {
  if (best === null) return metric === 0 ? "pass" : "fail";
  return metric < best ? "keep" : "discard";
}

const argv = process.argv.slice(2);
const command = argv[0];

try {
  if (command === "--list") {
    const names = lanes();
    console.log(names.length ? names.join("\n") : "(no eval lanes)");
  } else if (command === "--program") {
    const dir = lanePath(argv[1]);
    const config = readLaneConfig(dir);
    const program = config.program ? path.join(repoRoot, config.program) : path.join(dir, "program.md");
    if (existsSync(program)) {
      process.stdout.write(readFileSync(program, "utf8"));
      if (!readFileSync(program, "utf8").endsWith("\n")) process.stdout.write("\n");
    } else {
      console.log(`# ${path.basename(dir)}`);
      if (config.description) console.log(`\n${config.description}`);
    }
  } else if (command === "--run") {
    const dir = lanePath(argv[1]);
    const config = readLaneConfig(dir);
    const best = parseBest(argv);
    ensureDevDeps();
    assertCleanForLogging("Pre-eval");
    const [bin, args] = commandForLane(dir, config);
    const result = spawnSync(bin, args, { cwd: repoRoot, encoding: "utf8" });
    const exitCode = typeof result.status === "number" ? result.status : 1;
    const output = `${result.stdout || ""}${result.stderr || ""}`;
    const metric = extractMetric(output, exitCode);
    const status = statusForMetric(metric, best);
    const lane = path.basename(dir);
    const stamp = new Date().toISOString().replace(/[:]/g, "-");
    assertCleanForLogging("Post-eval");
    mkdirSync(resultsDir, { recursive: true });
    const logPath = path.join(resultsDir, `${lane}-${stamp}.log`);
    const tsvPath = path.join(resultsDir, `${lane}.tsv`);
    writeFileSync(logPath, output);
    const row = `${gitShortCommit()}\t${metric.toFixed(6)}\t0.0\t${status}\t${lane} ${status}\n`;
    if (!existsSync(tsvPath)) writeFileSync(tsvPath, "commit\tfailing_checks\tmemory_gb\tstatus\tdescription\n");
    writeFileSync(tsvPath, row, { flag: "a" });
    process.stdout.write("commit\tfailing_checks\tmemory_gb\tstatus\tdescription\n");
    process.stdout.write(row);
    process.stdout.write(`log=${path.relative(repoRoot, logPath)}\n`);
    process.stdout.write(`results=${path.relative(repoRoot, tsvPath)}\n`);
    process.exitCode = exitCode;
  } else {
    usage();
    process.exitCode = 2;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
