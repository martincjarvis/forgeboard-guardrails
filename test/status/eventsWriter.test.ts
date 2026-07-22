import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendEvent,
  type GateRunEvent,
} from "../../src/status/eventsWriter.ts";

test("appends events without rewriting prior lines across repeated calls", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-events-"));
  const base: Omit<GateRunEvent, "timestamp"> = {
    schemaVersion: 1,
    ticketId: "FB-0012",
    type: "gate-run",
    hook: "pre-commit",
    result: "pass",
    commit: "abc1234",
  };

  appendEvent(dir, { ...base, timestamp: "2026-07-19T00:00:00.000Z" });
  appendEvent(dir, {
    ...base,
    timestamp: "2026-07-19T00:01:00.000Z",
    result: "fail",
  });

  const content = readFileSync(
    join(dir, ".forgeboard", "state", "FB-0012", "events.ndjson"),
    "utf8",
  );
  const lines = content.trim().split("\n");

  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).result, "pass");
  assert.equal(JSON.parse(lines[1]).result, "fail");
});
