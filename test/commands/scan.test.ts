import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runScan } from "../../src/commands/scan.ts";
import { lizardAvailable } from "../support/lizard.ts";

function git(dir: string, args: string[]): void {
  execFileSync("git", args, { cwd: dir });
}

function initRepo(agentHooks: object = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "gr-scan-"));
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.email", "t@t.t"]);
  git(dir, ["config", "user.name", "t"]);
  mkdirSync(join(dir, ".forgeboard"), { recursive: true });
  writeFileSync(
    join(dir, ".forgeboard", "guardrails.config.json"),
    JSON.stringify({
      appName: "x",
      defaultBranch: "main",
      components: { c: { paths: ["**"] } },
      agentHooks,
    }),
  );
  return dir;
}

test("exit 2 when a tracked file anywhere in the tree is over-length", async () => {
  const dir = initRepo({ maxFileLines: 5 });
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "big.ts"), "l\n".repeat(20));
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "seed", "--no-verify"]);
  assert.equal(await runScan(dir), 2);
  rmSync(dir, { recursive: true, force: true });
});

test("exit 0 on a clean tree", async () => {
  const dir = initRepo({ maxFileLines: 400 });
  writeFileSync(join(dir, "ok.ts"), "const x = 1;\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "seed", "--no-verify"]);
  assert.equal(await runScan(dir), 0);
  rmSync(dir, { recursive: true, force: true });
});

test("a .gitignored generated file is not scanned", async () => {
  const dir = initRepo({ maxFileLines: 5 });
  writeFileSync(join(dir, ".gitignore"), "generated.ts\n");
  writeFileSync(join(dir, "generated.ts"), "l\n".repeat(50)); // untracked, ignored
  writeFileSync(join(dir, "ok.ts"), "const x = 1;\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "seed", "--no-verify"]);
  assert.equal(await runScan(dir), 0);
  rmSync(dir, { recursive: true, force: true });
});

test(
  "exit 2 when a tracked file exceeds the complexity threshold",
  { skip: !lizardAvailable() && "lizard not installed (pip install lizard)" },
  async () => {
    const dir = initRepo({ maxFileLines: 400, complexity: { ccn: 5 } });
    const complex =
      "def f(n):\n" +
      Array.from(
        { length: 20 },
        (_, i) => `    if n == ${i}:\n        return ${i}`,
      ).join("\n") +
      "\n    return -1\n";
    writeFileSync(join(dir, "complex.py"), complex); // ~41 lines, under maxFileLines
    git(dir, ["add", "."]);
    git(dir, ["commit", "-m", "seed", "--no-verify"]);
    assert.equal(await runScan(dir), 2);
    rmSync(dir, { recursive: true, force: true });
  },
);
