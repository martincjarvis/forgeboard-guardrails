#!/usr/bin/env node
// Gate 7 — On demand. The whole-repository sweep: run before trusting any of
// the incremental gates, or when adopting the toolkit. Reports rather than
// blocks — the caller decides the consequence — so this script exits 0 and
// prints a clear banner either way. (The server-side gate 6 is the authority.)
//
// Run with `npm run gate:7`.
import { spawn } from "node:child_process";
import {
  writeFileSync,
  createWriteStream,
  unlinkSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { trackedFiles, isText, have, run, git } from "./lib.mjs";
import { checkLinks } from "./check-links.mjs";
import { checkMachineId } from "./check-machine-id.mjs";

const findings = [];
const skips = [];
const add = (c, p, problem, remedy) =>
  findings.push({ check: c, path: p, problem, remedy });

const tracked = trackedFiles();
const trackedText = tracked.filter(isText);
const secretAvail = have("npx", ["--no-install", "secretlint", "--version"]);

// --- Security: whole-repository secret scan ---
if (secretAvail) {
  const scan = run("npx", ["--no-install", "secretlint", ...trackedText]);
  if (scan.status !== 0) {
    add(
      "repository-wide secret scan",
      "",
      (scan.stdout || "") + (scan.stderr || ""),
      "revoke the credential first, then remove it; rewriting history is a separate decision",
    );
  }
} else {
  skips.push("repository-wide secret scan — secretlint not installed");
}

// --- Security: history secret scan (the only check that reads past HEAD) ---
// secretlint has no stdin mode and refuses paths outside cwd, so stream the
// history diff to a momentary in-repo file, scan it, and delete it. The file is
// never tracked and is gone before the run ends. `--no-merges` keeps the diff to
// what was actually added.
if (secretAvail) {
  const probe = join(process.cwd(), "history-scan.tmp");
  const wrote = await new Promise((resolve) => {
    const g = spawn(
      "git",
      ["log", "--all", "-p", "-U0", "--no-color", "--no-merges"],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    const ws = createWriteStream(probe);
    g.stdout.pipe(ws);
    g.on("close", (code) => resolve(code === 0 && existsSync(probe)));
    g.on("error", () => resolve(false));
  });
  if (wrote && readFileSync(probe, "utf8").trim()) {
    const scan = run("npx", ["--no-install", "secretlint", probe]);
    if (scan.status !== 0) {
      add(
        "history secret scan",
        "",
        (scan.stdout || "") + (scan.stderr || ""),
        "revoke first; the credential is in every clone even if deleted from HEAD",
      );
    }
  } else {
    skips.push("history secret scan — no history to scan");
  }
  try {
    unlinkSync(probe);
  } catch {
    /* already gone */
  }
} else {
  skips.push(
    "history secret scan — secretlint not installed (prefer a dedicated scanner for scale)",
  );
}

// --- Security: repository-wide machine-identifying content ---
for (const f of checkMachineId()) findings.push(f);

// --- Security: repository-wide analysis (semgrep) ---
if (have("semgrep", ["--version"])) {
  const sg = run("semgrep", ["--config", "auto", "--quiet", "."]);
  if (sg.status !== 0) {
    add(
      "repository-wide analysis (semgrep)",
      "",
      (sg.stdout || "") + (sg.stderr || ""),
      "triage each finding; suppress per-rule per-path with a register row if accepted",
    );
  }
} else {
  skips.push("repository-wide analysis — semgrep not on PATH");
}

// --- Size: repository-wide complexity scan (lizard) ---
// lizard is the standard's named complexity tool, but its JavaScript tokenizer
// misparses ES modules with top-level code (here it reports a six-line function
// at cyclomatic complexity 25). thresholds.md has the stack's own analyser win
// over these gap-fill numbers, and for JavaScript that analyser is tsc — the
// build step. So lizard fills the gap for languages tsc does not cover, and the
// JavaScript this repository is written in is excluded from it by design.
const LIZARD_LANGS =
  /\.(py|go|rb|java|c|cc|cpp|h|hpp|cs|kt|scala|rs|php|swift|lua|dart|erl|zig|pl)$/i;
const lizardTargets = tracked.filter((f) => LIZARD_LANGS.test(f));
if (lizardTargets.length === 0) {
  skips.push(
    "repository-wide size scan (lizard) — JS-only repository; JS complexity is " +
      "governed by tsc (native analyser), and lizard's JS tokenizer is excluded",
  );
} else if (have("lizard", ["--version"])) {
  const lz = run("lizard", [
    "-C",
    "15",
    "-L",
    "100",
    "-a",
    "7",
    ...lizardTargets,
  ]);
  if (lz.status !== 0) {
    add(
      "repository-wide size scan (lizard)",
      "",
      (lz.stdout || "") + (lz.stderr || ""),
      "split the long or complex function; the thresholds are the gap-fill defaults",
    );
  }
} else {
  skips.push("repository-wide size scan — lizard not on PATH");
}

// --- Documentation: link and anchor integrity ---
for (const f of checkLinks()) findings.push(f);

// --- Policy: installation check ---
// npm tools are verified by their bin in node_modules/.bin rather than a
// `--version` probe: several (markdownlint-cli2) do not implement --version and
// would false-report as missing. semgrep and lizard live on PATH, not npm.
function npmBin(name) {
  return (
    existsSync(join("node_modules", ".bin", name)) ||
    existsSync(join("node_modules", ".bin", name + ".cmd"))
  );
}
{
  const hooksPath = git(["config", "--get", "core.hooksPath"]);
  if (hooksPath.status !== 0 || !hooksPath.stdout.trim()) {
    add(
      "installation check",
      "core.hooksPath",
      "no git hooks path is set; husky may not have installed",
      "run `npm install` (or `npm run prepare`) to install hooks",
    );
  } else {
    const hp = hooksPath.stdout.trim();
    for (const h of ["pre-commit", "commit-msg", "pre-push"]) {
      if (!existsSync(join(hp, h)) && !existsSync(join(".husky", h))) {
        add(
          "installation check",
          `${hp}/${h}`,
          "hook file missing",
          "reinstall husky hooks",
        );
      }
    }
  }
  for (const tool of [
    "prettier",
    "cspell",
    "markdownlint-cli2",
    "commitlint",
    "tsc",
  ]) {
    if (!npmBin(tool)) {
      add(
        "installation check",
        tool,
        "required tool not installed",
        "`npm install` to install dev dependencies",
      );
    }
  }
  for (const cfg of [
    "package.json",
    "tsconfig.json",
    "cspell.json",
    ".secretlintrc.json",
  ]) {
    try {
      JSON.parse(readFileSync(cfg, "utf8"));
    } catch {
      add(
        "installation check",
        cfg,
        "configuration file does not parse",
        "fix the JSON",
      );
    }
  }
}

// --- Policy: workspace capability check ---
{
  const lp = git(["config", "--get", "core.longpaths"]);
  if (lp.status !== 0 || !/true/i.test(lp.stdout.trim())) {
    add(
      "workspace capability — long paths",
      "core.longpaths",
      "long-path support is not enabled; a deep path can fail to clone or build on Windows",
      "run `git config --global core.longpaths true` (a gate reports; it does not set this for you)",
    );
  }
  const attr = readFileSync(".gitattributes", "utf8");
  if (!/^\* text=auto eol=lf/m.test(attr)) {
    add(
      "workspace capability — line endings",
      ".gitattributes",
      "`* text=auto eol=lf` is not declared",
      "declare line-ending normalisation",
    );
  }
  if (!existsSync(".editorconfig")) {
    add(
      "workspace capability — editorconfig",
      ".editorconfig",
      "missing",
      "add .editorconfig agreeing with .gitattributes",
    );
  }
}

// --- Policy: platform capability audit ---
skips.push(
  "platform capability audit — run on the host (gh api / az repos policy); not a local check",
);

// Report. Gate 7 reports; the caller decides. It does not block.
for (const s of skips) process.stderr.write(`gate 7: SKIP ${s}\n`);
for (const f of findings) {
  const where = f.path ? ` (${f.path})` : "";
  process.stderr.write(`gate 7: FINDING ${f.check}${where}\n`);
  if (f.problem)
    process.stderr.write(
      `          ${String(f.problem).split("\n")[0].slice(0, 200)}\n`,
    );
}
const banner = findings.length
  ? `gate 7: ${findings.length} finding(s), ${skips.length} skip(s) — reports only, caller decides`
  : `gate 7: clean — ${skips.length} skip(s)`;
process.stderr.write(`${banner}\n`);
process.exit(0);
