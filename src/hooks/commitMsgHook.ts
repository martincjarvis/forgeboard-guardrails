import { readFileSync } from "node:fs";
import { checkConventionalCommit } from "../gates/conventionalCommit.ts";
import { GateFailure } from "../errors/GateFailure.ts";
import { loadConfig } from "../config/load.ts";
import { getCurrentBranch } from "../git/branch.ts";
import { extractTicketId } from "../status/ticketId.ts";
import { appendEvent } from "../status/eventsWriter.ts";

export function runCommitMsgHook(cwd: string, messageFilePath: string): number {
  const message = readFileSync(messageFilePath, "utf8");
  const config = loadConfig(cwd);
  const branch = getCurrentBranch(cwd);
  const ticketId = config.statusContract.enabled ? extractTicketId(branch, config.statusContract.ticketIdPattern) : null;

  try {
    checkConventionalCommit(message);
    if (ticketId) {
      appendEvent(cwd, {
        schemaVersion: 1,
        ticketId,
        timestamp: new Date().toISOString(),
        type: "gate-run",
        hook: "commit-msg",
        result: "pass",
        commit: "(pending)"
      });
    }
    return 0;
  } catch (error) {
    if (error instanceof GateFailure) {
      console.error(error.message);
      if (ticketId) {
        appendEvent(cwd, {
          schemaVersion: 1,
          ticketId,
          timestamp: new Date().toISOString(),
          type: "gate-run",
          hook: "commit-msg",
          result: "fail",
          commit: "(pending)"
        });
      }
      return 1;
    }
    throw error;
  }
}
