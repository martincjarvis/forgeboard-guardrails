import { execFileSync } from "node:child_process";
import { runPrettierFormat } from "../gates/prettierFormat.ts";

export async function runFormat(cwd: string): Promise<void> {
  const trackedFiles = execFileSync("git", ["ls-files"], {
    cwd,
    encoding: "utf8",
  })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const result = await runPrettierFormat(trackedFiles, cwd);
  console.log(`Formatted ${result.formatted.length} file(s).`);
}
