import { spawnSync } from "node:child_process";
import { combine } from "./commandRunner.ts";
import { logCommand } from "./commandLog.ts";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function runLocalBin(
  binName: string,
  args: string[],
  cwd: string,
): { pass: boolean; output: string } {
  const ext = process.platform === "win32" ? ".cmd" : "";
  const binPath = join(packageRoot, "node_modules", ".bin", `${binName}${ext}`);

  if (!existsSync(binPath)) {
    throw new Error(
      `Required tool "${binName}" was not found at ${binPath} — run "npm install" in the guardrails package.`,
    );
  }

  try {
    // stdio[2] is piped rather than left to default: these tools put warnings and
    // errors on stderr, and inheriting it both loses them from the captured output
    // and hands them to lint-staged's renderer, which clears the screen on failure.
    // Accepted, and strictly narrower than what it replaced: `binPath` is resolved
    // from this package's own node_modules and verified to exist above, and the
    // arguments are an argv array rather than a shell string, so nothing here is
    // interpolated into a command line. The shell is required on Windows only,
    // where these tools are `.cmd` shims that cannot be executed directly — the
    // same reason the execFileSync call this replaces carried the same option.
    //
    // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process, javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
    const result = spawnSync(binPath, args, {
      cwd,
      encoding: "utf8",
      shell: process.platform === "win32",
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
