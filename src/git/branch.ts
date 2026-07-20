import { execFileSync } from "node:child_process";

export function getCurrentBranch(cwd: string): string {
  return execFileSync("git", ["symbolic-ref", "--short", "HEAD"], { cwd, encoding: "utf8" }).trim();
}
