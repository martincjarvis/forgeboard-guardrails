import { test } from "node:test";
import assert from "node:assert/strict";
import { extractTicketId } from "../../src/status/ticketId.ts";

test("extracts the ticket id from a branch matching the default ADR-0003 pattern", () => {
  assert.equal(
    extractTicketId("feature/FB-0012-add-login", "[A-Z]+-\\d+"),
    "FB-0012",
  );
});

test("finds the id anywhere in the branch name, not just at a fixed position", () => {
  assert.equal(
    extractTicketId("hotfix/FB-0031-fix-crash", "[A-Z]+-\\d+"),
    "FB-0031",
  );
});

test("returns null when the branch has no matching id", () => {
  assert.equal(extractTicketId("main", "[A-Z]+-\\d+"), null);
});

test("supports a custom pattern for non-ADR-0003 ticket schemes", () => {
  assert.equal(extractTicketId("feature/123-fix-thing", "\\d+"), "123");
});
