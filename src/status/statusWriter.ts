import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface TestOutcome {
  status: "pass" | "fail" | "unknown";
  passed?: number;
  failed?: number;
  total?: number;
}

export interface StatusSnapshot {
  schemaVersion: 1;
  ticketId: string;
  updatedAt: string;
  commit: string;
  branch: string;
  build: {
    status: "pass" | "fail" | "unknown";
    warnings: number;
    errors: number;
  };
  tests: {
    unit: TestOutcome;
    integration: TestOutcome;
    e2e: TestOutcome;
    e2eSmoke: TestOutcome;
  };
  activity: null;
}

export function writeStatus(cwd: string, snapshot: StatusSnapshot): void {
  const dir = join(cwd, ".forgeboard", "state", snapshot.ticketId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "status.json"), JSON.stringify(snapshot, null, 2));
}
