import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
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

/**
 * Patches only the integration/e2e test outcomes of an existing status snapshot,
 * leaving the pre-commit-written build/unit fields intact. No-op when no snapshot
 * exists yet (pre-commit never ran for this ticket, or the contract was just
 * enabled) — pre-push still records its event regardless.
 */
export function updateTestOutcomes(
  cwd: string,
  ticketId: string,
  patch: { integration: TestOutcome; e2e: TestOutcome; commit: string },
): void {
  const file = join(cwd, ".forgeboard", "state", ticketId, "status.json");
  if (!existsSync(file)) return;
  const snapshot = JSON.parse(readFileSync(file, "utf8")) as StatusSnapshot;
  snapshot.tests.integration = patch.integration;
  snapshot.tests.e2e = patch.e2e;
  snapshot.commit = patch.commit;
  snapshot.updatedAt = new Date().toISOString();
  writeFileSync(file, JSON.stringify(snapshot, null, 2));
}
