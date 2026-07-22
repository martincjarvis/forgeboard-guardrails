import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

test("prints usage and exits 0 with no command", () => {
  const output = execFileSync(
    "npx",
    ["tsx", join(process.cwd(), "src", "cli.ts")],
    {
      encoding: "utf8",
      shell: process.platform === "win32",
    },
  );
  assert.match(output, /Usage: guardrails/);
});
