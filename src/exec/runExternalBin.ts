import { spawnSync } from "node:child_process";
import { combine } from "./commandRunner.ts";
import { logCommand } from "./commandLog.ts";

/**
 * Runs a binary resolved from the system PATH (not the toolkit's node_modules).
 *
 * Used for built-in gates whose underlying tool is not npm-distributable —
 * currently only semgrep, which is OSS (MPL-2.0) but Python-installed
 * (`pip install semgrep`). The toolkit still names the dependency loudly on
 * absence (per the spec's "fail loudly, never silently skip" rule) and the
 * install command surfaces a one-liner remediation.
 *
 * Throws on absence — the doctor preflight is the user-facing early warning;
 * this is the authoritative gate-time check.
 */
export function runExternalBin(
  binName: string,
  args: string[],
  cwd: string,
): { pass: boolean; output: string } {
  try {
    // shell:false is deliberate and load-bearing. With shell:true on Windows a
    // missing binary is resolved by cmd.exe, which reports "is not recognized ..."
    // as a generic exit status 1 — indistinguishable from "the tool ran and found
    // an issue" — so absence was silently swallowed instead of raising the named
    // remediation error below. Without a shell, an absent binary yields a reliable
    // ENOENT on every platform, while a real executable on PATH (semgrep.exe) still
    // resolves. It also avoids the shell-argument-injection deprecation (DEP0190).
    // Accepted: an argv array with `shell: false`, so there is no command line for
    // an argument to escape into. Same risk profile as the execFileSync call this
    // replaces — the change is that both streams are now captured, not how the
    // process is started.
    //
    // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process
    const result = spawnSync(binName, args, {
      cwd,
      encoding: "utf8",
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.error) throw result.error;

    const output = combine(result.stdout, result.stderr);
    logCommand({
      command: `${binName} ${args.join(" ")}`,
      cwd,
      status: result.status,
      output,
    });
    return { pass: result.status === 0, output };
  } catch (error: unknown) {
    // ENOENT — binary not on PATH. Surface a clear, named failure.
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      throw new Error(
        `Required tool "${binName}" was not found on PATH — install it before re-running. ` +
          (binName === "semgrep"
            ? 'semgrep is OSS (MPL-2.0) but Python-distributed: "pip install semgrep" (Python 3 LTS required).'
            : ""),
      );
    }
    // Anything else means the process could not be started at all. A tool that ran
    // and reported findings no longer arrives here: spawnSync returns a non-zero
    // status rather than throwing, and that path is handled above with its output.
    const output = error instanceof Error ? error.message : String(error);
    logCommand({
      command: `${binName} ${args.join(" ")}`,
      cwd,
      status: null,
      output,
    });
    return { pass: false, output };
  }
}
