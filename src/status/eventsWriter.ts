import { mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";

export interface GateRunEvent {
  schemaVersion: 1;
  ticketId: string;
  timestamp: string;
  type: "gate-run";
  hook: "commit-msg" | "pre-commit" | "pre-push";
  result: "pass" | "fail";
  commit: string;
}

export function appendEvent(cwd: string, event: GateRunEvent): void {
  const dir = join(cwd, ".forgeboard", "state", event.ticketId);
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, "events.ndjson"), JSON.stringify(event) + "\n");
}
