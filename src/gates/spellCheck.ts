import { runLocalBin } from "../exec/localBin.ts";

export function runSpellCheck(files: string[], cwd: string): { pass: boolean; output: string } {
  if (files.length === 0) return { pass: true, output: "" };
  return runLocalBin("cspell", ["--no-progress", ...files], cwd);
}
