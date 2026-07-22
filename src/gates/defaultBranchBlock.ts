import { GateFailure } from "../errors/GateFailure.ts";

export function checkNotDefaultBranch(
  currentBranch: string,
  defaultBranch: string,
): void {
  if (currentBranch === defaultBranch) {
    throw new GateFailure(
      "default-branch-block",
      `create a feature branch (e.g. "feature/<ticket-id>-<slug>") and commit there instead.`,
      `direct commits to "${defaultBranch}" are not allowed`,
    );
  }
}
