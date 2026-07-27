import { GateFailure } from "../errors/GateFailure.ts";

// Anchored, with a fixed alternation of literals and a single optional group —
// no nested quantifier, so there is no backtracking blow-up for the rule to find.
const CONVENTIONAL_COMMIT_PATTERN =
  // eslint-disable-next-line security/detect-unsafe-regex
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([a-z0-9-]+\))?!?: .+/;

export function checkConventionalCommit(message: string): void {
  const firstLine = message.split("\n")[0].trim();

  if (!CONVENTIONAL_COMMIT_PATTERN.test(firstLine)) {
    throw new GateFailure(
      "conventional-commit",
      'expected conventional format: <type>(<optional-scope>): <subject>, e.g. "feat(api): add login endpoint" — types: build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test.',
      `commit message "${firstLine}" does not match the conventional-commit format`,
    );
  }
}
