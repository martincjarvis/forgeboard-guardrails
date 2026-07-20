import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { writeStatus, type StatusSnapshot } from "../../src/status/statusWriter.ts";
import schema from "../../schemas/status.v1.json" with { type: "json" };

test("writes status.json that validates against the published schema", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-status-"));
  const snapshot: StatusSnapshot = {
    schemaVersion: 1,
    ticketId: "FB-0012",
    updatedAt: new Date().toISOString(),
    commit: "abc1234",
    branch: "feature/FB-0012-add-login",
    build: { status: "pass", warnings: 0, errors: 0 },
    tests: {
      unit: { status: "pass", passed: 42, failed: 0, total: 42 },
      integration: { status: "unknown" },
      e2e: { status: "unknown" },
      e2eSmoke: { status: "unknown" }
    },
    activity: null
  };

  writeStatus(dir, snapshot);

  const written = JSON.parse(readFileSync(join(dir, ".forgeboard", "state", "FB-0012", "status.json"), "utf8"));
  const ajv = new Ajv();
  addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.ok(validate(written), JSON.stringify(validate.errors));
});
