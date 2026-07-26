import { execFileSync } from "node:child_process";
import { runDocsRepoGate } from "../gates/docsRepoGates.ts";

/**
 * Whole-corpus documentation check, runnable outside a commit.
 *
 * This is the documented adoption step for a repo taking the toolkit for the first
 * time, and the entry point CI uses. Unlike the pre-commit gate there is no stash and
 * no staged set, so `--fix` may repair every file: the whole corpus is "staged" here.
 */
export function runDocs(cwd: string, argv: string[]): number {
  const fix = argv.includes("--fix");
  const tracked = execFileSync("git", ["ls-files", "*.md"], {
    cwd,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);

  const { problems, fixes } = runDocsRepoGate(cwd, fix ? tracked : [], { fix });

  for (const f of fixes) console.log(`fixed  ${f}`);
  for (const p of problems) console.error(`ERROR  ${p}`);

  if (problems.length > 0) {
    console.error(`\n${problems.length} unresolved; fix these by hand.`);
    return 2;
  }
  console.log(
    fixes.length > 0
      ? `\n${fixes.length} repaired, 0 unresolved.`
      : "documentation links and anchors all resolve",
  );
  return 0;
}
