"use strict";

const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const runner = path.resolve("scripts", "karpathy-lane.mjs");

function sh(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  assert.strictEqual(result.status, 0, `${command} ${args.join(" ")} failed:\n${result.stderr}`);
  return result;
}

function makeRepo({ dirtyLane = false } = {}) {
  const repo = mkdtempSync(path.join(os.tmpdir(), "a1-ai-core-lane-"));
  mkdirSync(path.join(repo, "evals", "smoke"), { recursive: true });
  mkdirSync(path.join(repo, "evals", "dirty-lane"), { recursive: true });
  mkdirSync(path.join(repo, "scripts"), { recursive: true });
  writeFileSync(path.join(repo, ".gitignore"), "evals/karpathy/results/\n");
  writeFileSync(path.join(repo, "package.json"), "{\"name\":\"lane-fixture\"}\n");
  writeFileSync(path.join(repo, "evals", "smoke", "program.md"), "# smoke\n\nFixture lane.\n");
  writeFileSync(path.join(repo, "evals", "smoke", "lane.json"), JSON.stringify({
    name: "smoke",
    check: "evals/smoke/check.js",
    program: "evals/smoke/program.md"
  }, null, 2));
  writeFileSync(path.join(repo, "evals", "smoke", "check.js"), "console.log('failing_checks=0');\n");
  writeFileSync(path.join(repo, "evals", "dirty-lane", "lane.json"), JSON.stringify({
    name: "dirty-lane",
    check: "evals/dirty-lane/check.js",
    program: "evals/dirty-lane/program.md"
  }, null, 2));
  writeFileSync(path.join(repo, "evals", "dirty-lane", "program.md"), "# dirty-lane\n");
  writeFileSync(
    path.join(repo, "evals", "dirty-lane", "check.js"),
    dirtyLane
      ? "require('node:fs').writeFileSync('out-of-scope.txt', 'dirty'); console.log('failing_checks=0');\n"
      : "console.log('failing_checks=0');\n"
  );
  sh("git", ["init"], repo);
  sh("git", ["config", "user.email", "codex@example.test"], repo);
  sh("git", ["config", "user.name", "Codex Test"], repo);
  sh("git", ["add", "."], repo);
  sh("git", ["commit", "-m", "initial"], repo);
  return repo;
}

function run(repo, args) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, A1_KARPATHY_REPO_ROOT: repo },
    encoding: "utf8"
  });
}

test("Karpathy lane runner lists temp eval lanes", t => {
  const repo = makeRepo();
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const result = run(repo, ["--list"]);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /dirty-lane/);
  assert.match(result.stdout, /smoke/);
});

test("Karpathy lane runner prints lane program text", t => {
  const repo = makeRepo();
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const result = run(repo, ["--program", "smoke"]);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /^# smoke/m);
  assert.match(result.stdout, /Fixture lane/);
});

test("Karpathy lane runner executes a lane and normalizes the metric", t => {
  const repo = makeRepo();
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const result = run(repo, ["--run", "smoke", "--best", "0"]);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /^commit\tfailing_checks\tmemory_gb\tstatus\tdescription/m);
  assert.match(result.stdout, /\t0\.000000\t0\.0\tdiscard\tsmoke discard/);
  assert.ok(existsSync(path.join(repo, "evals", "karpathy", "results", "smoke.tsv")));
});

test("Karpathy lane runner rejects invalid --best before logging", t => {
  const repo = makeRepo();
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const result = run(repo, ["--run", "smoke", "--best", "nope"]);
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /Invalid --best value/);
  assert.strictEqual(existsSync(path.join(repo, "evals", "karpathy", "results")), false);
});

test("Karpathy lane runner blocks pre-existing dirty files", t => {
  const repo = makeRepo();
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  writeFileSync(path.join(repo, "dirty.txt"), "dirty\n");
  const result = run(repo, ["--run", "smoke", "--best", "0"]);
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /Pre-eval dirty files block eval result logging/);
  assert.match(result.stderr, /dirty.txt/);
});

test("Karpathy lane runner blocks lane-created out-of-scope files before logging", t => {
  const repo = makeRepo({ dirtyLane: true });
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const result = run(repo, ["--run", "dirty-lane", "--best", "0"]);
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /Post-eval dirty files block eval result logging/);
  assert.match(result.stderr, /out-of-scope.txt/);
  assert.strictEqual(existsSync(path.join(repo, "evals", "karpathy", "results")), false);
});
