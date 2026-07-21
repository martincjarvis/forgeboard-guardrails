import { execFileSync } from "node:child_process";

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
export function runExternalBin(binName: string, args: string[], cwd: string): { pass: boolean; output: string } {
  try {
    // shell:false is deliberate and load-bearing. With shell:true on Windows a
    // missing binary is resolved by cmd.exe, which reports "is not recognized ..."
    // as a generic exit status 1 — indistinguishable from "the tool ran and found
    // an issue" — so absence was silently swallowed instead of raising the named
    // remediation error below. Without a shell, an absent binary yields a reliable
    // ENOENT on every platform, while a real executable on PATH (semgrep.exe) still
    // resolves. It also avoids the shell-argument-injection deprecation (DEP0190).
    const output = execFileSync(binName, args, {
      cwd,
      encoding: "utf8",
      shell: false,
      stdio: "pipe",
    });
    return { pass: true, output };
  } catch (error: unknown) {
    // ENOENT — binary not on PATH. Surface a clear, named failure.
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") {
      throw new Error(
        `Required tool "${binName}" was not found on PATH — install it before re-running. ` +
          (binName === "semgrep"
            ? 'semgrep is OSS (MPL-2.0) but Python-distributed: "pip install semgrep" (Python 3 LTS required).'
            : "")
      );
    }
    // Non-zero exit — the tool ran and reported findings. Capture output.
    const output =
      error instanceof Error && "stdout" in error ? String((error as { stdout?: unknown }).stdout ?? "") : "";
    return { pass: false, output };
  }
}
