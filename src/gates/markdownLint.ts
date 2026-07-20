import { runLocalBin } from "../exec/localBin.ts";

export function runMarkdownLint(files: string[], cwd: string): { pass: boolean; output: string } {
  if (files.length === 0) return { pass: true, output: "" };
  return runLocalBin("markdownlint-cli2", files, cwd);
}
