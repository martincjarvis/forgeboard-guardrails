import { execFileSync } from "node:child_process";

export function getStagedFiles(cwd: string): string[] {
  const output = execFileSync("git", ["diff", "--cached", "--name-only"], { cwd, encoding: "utf8" });
  return output.split("\n").map((line) => line.trim()).filter(Boolean);
}
