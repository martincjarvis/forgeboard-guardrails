import { GateFailure } from "../errors/GateFailure.ts";

const CONVENTIONAL_COMMIT_PATTERN =
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([a-z0-9-]+\))?!?: .+/;

export function checkConventionalCommit(message: string): void {
  const firstLine = message.split("\n")[0].trim();

  if (!CONVENTIONAL_COMMIT_PATTERN.test(firstLine)) {
    throw new GateFailure(
      "conventional-commit",
      "expected conventional format: <type>(<optional-scope>): <subject>, e.g. \"feat(api): add login endpoint\" — types: build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test.",
      `commit message "${firstLine}" does not match the conventional-commit format`
    );
  }
}
