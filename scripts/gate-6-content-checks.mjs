// Per-file content checks over the changed range, extracted from
// gate-6-pull-request.mjs as its own subject seam: each reads the bytes or
// text of the files this range touched (size on disk, machine-identifying
// content, leaked credentials) — a distinct concern from the cross-language
// and cross-stack SARIF scanners in gate-6-scans.mjs, which run external
// tools and upload structured reports. gate-6-pull-request.mjs imports and
// re-exports `runContentChecks`; its public surface is unchanged.
import { existsSync, statSync } from "node:fs";
import { have, run } from "./lib.mjs";
import { checkMachineId } from "./check-machine-id.mjs";

/** @typedef {{ check: string, path?: string, problem?: string, remedy?: string }} Finding */

/** Runs the per-file content checks (gate 2 checks 10, 9, 6 adapted to the
 *  range). `changed` is `changedFiles(range)` (size and machine-id consider
 *  every changed file); `changedText` is the text subset (secretlint reads
 *  text only). A checkout has no staged/working-tree split to protect
 *  (gate-6: "the checkout already IS the branch"), so the file on disk is
 *  read directly rather than through `git cat-file -s :<path>`.
 *  @param {{ changed: string[], changedText: string[] }} args
 *  @returns {{ findings: Finding[], skips: string[] }} */
export function runContentChecks({ changed, changedText }) {
  /** @type {Finding[]} */
  const findings = [];
  /** @type {string[]} */
  const skips = [];
  /** @param {string} s */
  const skip = (s) => skips.push(s);

  const SIZE_WARN = 1_000_000;
  const SIZE_ERROR = 5_000_000;
  for (const f of changed) {
    if (!existsSync(f)) continue; // deleted in this range
    const bytes = statSync(f).size;
    if (bytes >= SIZE_ERROR) {
      findings.push({
        check: "file size (error)",
        path: f,
        problem: `${f} is ${bytes} bytes (>= ${SIZE_ERROR} error limit)`,
        remedy:
          "store large objects via large-file storage, or remove the file",
      });
    } else if (bytes >= SIZE_WARN) {
      findings.push({
        check: "file size (warn)",
        path: f,
        problem: `${f} is ${bytes} bytes (>= ${SIZE_WARN} warn limit)`,
        remedy:
          "store large objects via large-file storage, or record why here",
      });
    }
  }

  for (const f of checkMachineId(changedText)) findings.push(f);

  if (changedText.length) {
    if (have("npx", ["--no-install", "secretlint", "--version"])) {
      const scan = run("npx", ["--no-install", "secretlint", ...changedText]);
      if (scan.status !== 0) {
        // Path is empty, not the joined file list: secretlint's own text names
        // the file and line per finding, and a comma-joined path breaks the
        // annotation below rather than pointing at anything real (gate 7's
        // repository-wide scan uses the same empty-path shape for the same
        // reason).
        findings.push({
          check: "secret scan",
          path: "",
          problem: (scan.stdout || "") + (scan.stderr || ""),
          remedy:
            "remove the credential, or revoke and rotate if already pushed",
        });
      }
    } else {
      skip("secret scan — secretlint not installed, changed files not scanned");
    }
  }

  return { findings, skips };
}
