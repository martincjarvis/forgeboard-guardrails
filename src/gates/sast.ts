import { runExternalBin } from "../exec/runExternalBin.ts";

export function runSast(files: string[], cwd: string): { pass: boolean; output: string } {
  if (files.length === 0) return { pass: true, output: "" };
  return runExternalBin("semgrep", ["--config=auto", "--error", ...files], cwd);
}
