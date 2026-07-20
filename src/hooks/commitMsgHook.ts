import { readFileSync } from "node:fs";
import { checkConventionalCommit } from "../gates/conventionalCommit.ts";
import { GateFailure } from "../errors/GateFailure.ts";

export function runCommitMsgHook(messageFilePath: string): number {
  const message = readFileSync(messageFilePath, "utf8");

  try {
    checkConventionalCommit(message);
    return 0;
  } catch (error) {
    if (error instanceof GateFailure) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}
