// cspell:ignore PYTHONUTF
// Gate 7's security seam, split from gate-7-on-demand.mjs: the
// whole-repository and history secret scans, machine-identifying content, and
// the semgrep analysis with its resolved-rule recording. runSecurityChecks
// returns the findings and skips this seam produced, in the order the original
// single-file sweep pushed them; the orchestrator merges them with the size,
// documentation and policy seams before printing the report.
import { spawn } from "node:child_process";
import {
  createWriteStream,
  unlinkSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  run,
  have,
  trackedFiles,
  isText,
  resolvedSemgrepRules,
  semgrepRuleRecord,
} from "./lib.mjs";
import { checkMachineId } from "./check-machine-id.mjs";

/** @typedef {{ check: string, path?: string, problem?: string, remedy?: string }} Finding */
/** @typedef {(c: string, p: string, problem: string, remedy: string) => void} Adder */

// --- Security: whole-repository secret scan ---
/** @param {Adder} add @param {string[]} skips @param {string[]} trackedText @param {boolean} secretAvail */
function wholeRepositorySecretScan(add, skips, trackedText, secretAvail) {
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
}

// --- Security: history secret scan (the only check that reads past HEAD) ---
// secretlint has no stdin mode and refuses paths outside cwd, so stream the
// history diff to a momentary in-repo file, scan it, and delete it. The file is
// never tracked and is gone before the run ends. `--no-merges` keeps the diff to
// what was actually added.
/** @param {Adder} add @param {string[]} skips @param {boolean} secretAvail */
async function historySecretScan(add, skips, secretAvail) {
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
}

// --- Security: repository-wide machine-identifying content ---
/** @param {Finding[]} findings */
function machineIdScan(findings) {
  for (const f of checkMachineId()) findings.push(f);
}

// --- Security: repository-wide analysis (semgrep) ---
// `--config auto` resolves rules from the Semgrep registry at run time, so the
// same scan can resolve a different rule set tomorrow with no commit in this
// repository — a scan that passed yesterday can fail today, or stop covering
// something, with nothing in the history to explain it. The rule set is
// therefore recorded into the run's output (semgrep-resolved-rules.json,
// gitignored alongside the other run evidence) so two runs can be compared:
// semgrep emits the resolved set itself, in the SARIF's
// runs[].tool.driver.rules (every rule, including those that found nothing),
// and that is what is captured rather than parsed out of human-readable text.
//
// `--error` is what makes a finding a failure: without it semgrep reports and
// still exits 0, so the check reads as green with findings on screen. This
// scan was decorative until that was noticed. PYTHONUTF8 avoids the Windows-
// only SARIF-write crash gate 6 already documents: semgrep's SARIF writer
// defaults to the console code page (cp1252), which cannot encode some rule
// messages and throws instead of writing the file — and without the file there
// is no rule set to record either.
/** @param {Adder} add @param {string[]} skips */
function semgrepAnalysis(add, skips) {
  const RESOLVED_RULES_JSON = "semgrep-resolved-rules.json";
  const SEMGREP_RULES_SARIF = "semgrep-resolved-rules.sarif";
  const semgrepVersion = run("semgrep", ["--version"]);
  if (semgrepVersion.status === 0) {
    const sg = run(
      "semgrep",
      [
        "--config",
        "auto",
        "--quiet",
        "--error",
        "--sarif",
        "--output",
        SEMGREP_RULES_SARIF,
        ".",
      ],
      { env: { ...process.env, PYTHONUTF8: "1" } },
    );
    // The resolved rule set, from the SARIF semgrep itself just wrote. A read
    // failure (semgrep crashed before writing) leaves rules null, which the
    // record carries as `unavailable` — distinct from a clean resolved set and
    // from the not-on-PATH skip below, never reading as a pass.
    let rules = null;
    try {
      rules = resolvedSemgrepRules(
        JSON.parse(readFileSync(SEMGREP_RULES_SARIF, "utf8")),
      );
    } catch {
      /* SARIF missing or unreadable — rules stays null, recorded honestly below */
    }
    const record = semgrepRuleRecord({
      ran: true,
      rules,
      reason: rules
        ? undefined
        : "semgrep ran but wrote no readable SARIF rule list",
    });
    const recorded = {
      ...record,
      semgrepVersion: semgrepVersion.stdout.trim(),
      config: "auto",
    };
    writeFileSync(
      RESOLVED_RULES_JSON,
      JSON.stringify(recorded, null, 2) + "\n",
    );
    if (record.outcome === "resolved") {
      skips.push(
        `repository-wide analysis — --config auto resolved ${record.ruleCount} rule(s); full list written to ${RESOLVED_RULES_JSON} for run-to-run comparison`,
      );
    } else {
      skips.push(
        `repository-wide analysis — resolved rule set ${record.outcome} (${record.reason}); no list recorded`,
      );
    }
    if (sg.status !== 0) {
      add(
        "repository-wide analysis (semgrep)",
        "",
        (sg.stdout || "") + (sg.stderr || ""),
        "triage each finding; suppress per-rule per-path with a register row if accepted",
      );
    }
  } else {
    // semgrep not on PATH: the run did not happen, so there is no rule set to
    // record. The record says `skipped`, distinguishable from a clean resolved
    // run — "unavailable" must never read as "passed".
    writeFileSync(
      RESOLVED_RULES_JSON,
      JSON.stringify(
        semgrepRuleRecord({ ran: false, reason: "semgrep not on PATH" }),
        null,
        2,
      ) + "\n",
    );
    skips.push(
      "repository-wide analysis — semgrep not on PATH; resolved rules not recorded (run did not happen)",
    );
  }
}

/** @returns {Promise<{ findings: Finding[], skips: string[] }>} */
export async function runSecurityChecks() {
  /** @type {Finding[]} */
  const findings = [];
  /** @type {string[]} */
  const skips = [];
  /** @param {string} c @param {string} p @param {string} problem @param {string} remedy */
  const add = (c, p, problem, remedy) =>
    findings.push({ check: c, path: p, problem, remedy });
  const trackedText = trackedFiles().filter(isText);
  const secretAvail = have("npx", ["--no-install", "secretlint", "--version"]);
  wholeRepositorySecretScan(add, skips, trackedText, secretAvail);
  await historySecretScan(add, skips, secretAvail);
  machineIdScan(findings);
  semgrepAnalysis(add, skips);
  return { findings, skips };
}
