import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import {
  writeStatus,
  updateTestOutcomes,
  type StatusSnapshot,
} from "../../src/status/statusWriter.ts";
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
      e2eSmoke: { status: "unknown" },
    },
    activity: null,
  };

  writeStatus(dir, snapshot);

  const written = JSON.parse(
    readFileSync(
      join(dir, ".forgeboard", "state", "FB-0012", "status.json"),
      "utf8",
    ),
  );
  const ajv = new Ajv();
  addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.ok(validate(written), JSON.stringify(validate.errors));
});

test("updateTestOutcomes patches integration/e2e and commit, leaving build/unit intact", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-status-"));
  const ticketId = "FB-0042";
  const snapshot: StatusSnapshot = {
    schemaVersion: 1,
    ticketId,
    updatedAt: "2026-01-01T00:00:00.000Z",
    commit: "abc1234",
    branch: "feature/FB-0042-x",
    build: { status: "pass", warnings: 2, errors: 0 },
    tests: {
      unit: { status: "pass", passed: 5, failed: 0, total: 5 },
      integration: { status: "unknown" },
      e2e: { status: "unknown" },
      e2eSmoke: { status: "unknown" },
    },
    activity: null,
  };
  writeStatus(dir, snapshot);

  updateTestOutcomes(dir, ticketId, {
    integration: { status: "pass", passed: 3, failed: 0, total: 3 },
    e2e: { status: "pass", passed: 1, failed: 0, total: 1 },
    commit: "abc4321",
  });

  const patched = JSON.parse(
    readFileSync(
      join(dir, ".forgeboard", "state", ticketId, "status.json"),
      "utf8",
    ),
  );
  assert.equal(patched.commit, "abc4321");
  assert.equal(patched.tests.integration.status, "pass");
  assert.equal(patched.tests.integration.total, 3);
  assert.equal(patched.tests.e2e.status, "pass");
  // Pre-commit-written fields left untouched.
  assert.equal(patched.build.status, "pass");
  assert.equal(patched.build.warnings, 2);
  assert.equal(patched.tests.unit.status, "pass");
  assert.equal(patched.tests.unit.total, 5);
  assert.notEqual(patched.updatedAt, "2026-01-01T00:00:00.000Z");
});

test("updateTestOutcomes is a no-op when no snapshot exists", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-status-"));
  assert.doesNotThrow(() =>
    updateTestOutcomes(dir, "FB-9999", {
      integration: { status: "pass" },
      e2e: { status: "pass" },
      commit: "sha",
    }),
  );
  assert.ok(
    !existsSync(join(dir, ".forgeboard", "state", "FB-9999", "status.json")),
  );
});
