import { execFileSync } from "node:child_process";
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
    const output = execFileSync(binPath, args, {
      cwd,
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    return { pass: true, output };
  } catch (error: unknown) {
    const output =
      error instanceof Error && "stdout" in error
        ? String((error as { stdout?: unknown }).stdout ?? "")
        : "";
    return { pass: false, output };
  }
}
