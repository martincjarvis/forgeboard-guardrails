import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { scaffoldFixtureRepo } from "./scaffold.ts";

test("scaffolds a three-component repo with hooks installed", () => {
  const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });

  assert.ok(existsSync(join(fixture.dir, ".git", "hooks", "pre-commit")));
  assert.ok(existsSync(join(fixture.dir, ".forgeboard", "guardrails.config.json")));
  assert.ok(existsSync(join(fixture.dir, "src", "shared", "index.js")));
  assert.ok(existsSync(join(fixture.dir, "src", "api", "index.js")));
  assert.ok(existsSync(join(fixture.dir, "src", "web", "index.js")));

  fixture.cleanup();
  assert.equal(existsSync(fixture.dir), false);
});
