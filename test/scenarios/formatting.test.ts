import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { scaffoldFixtureRepo } from "../fixtures/scaffold.ts";
import { runPreCommitHook } from "../../src/hooks/preCommitHook.ts";
import {
  commitStaged,
  readStagedFile,
  readCommittedFile,
  trackedStatus,
} from "../support/git.ts";
import { skipWithoutSemgrep } from "../support/semgrep.ts";

test(
  "the formatter's output is what gets committed, not just what is left on disk",
  { skip: skipWithoutSemgrep },
  async () => {
    const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
    execFileSync("git", ["checkout", "-b", "feature/FB-0010-x"], {
      cwd: fixture.dir,
    });
    writeFileSync(
      join(fixture.dir, "src", "api", "index.js"),
      "const x   =    1\n",
    );
    execFileSync("git", ["add", "src/api/index.js"], { cwd: fixture.dir });

    // Seen failing intermittently under a full coverage run, with secretlint
    // reporting a 200-character private key at line 2 of this one-line file. It
    // has never reproduced in isolation — 57 attempts, sequential and four-way
    // concurrent — so the next occurrence must carry its own evidence rather than
    // being another hunt. Capture what was on disk and what the gates said.
    const reported: string[] = [];
    const realError = console.error;
    console.error = (...args: unknown[]) => {
      reported.push(args.map(String).join(" "));
    };
    let exitCode: number;
    try {
      exitCode = await runPreCommitHook(fixture.dir);
    } finally {
      console.error = realError;
    }

    assert.equal(
      exitCode,
      0,
      `pre-commit rejected the file.\n` +
        `on disk: ${JSON.stringify(readFileSync(join(fixture.dir, "src", "api", "index.js"), "utf8"))}\n` +
        `gates said:\n${reported.join("\n") || "(nothing)"}`,
    );
    assert.equal(
      readStagedFile(fixture.dir, "src/api/index.js"),
      "const x = 1;\n",
    );

    commitStaged(fixture.dir, "feat: add x");

    assert.equal(
      readCommittedFile(fixture.dir, "src/api/index.js"),
      "const x = 1;\n",
    );
    assert.equal(
      trackedStatus(fixture.dir),
      "",
      "the formatter must not leave the tree dirty behind the commit",
    );
    fixture.cleanup();
  },
);

test(
  "leaves already-formatted content untouched",
  { skip: skipWithoutSemgrep },
  async () => {
    const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
    execFileSync("git", ["checkout", "-b", "feature/FB-0010-y"], {
      cwd: fixture.dir,
    });
    writeFileSync(
      join(fixture.dir, "src", "api", "index.js"),
      "const x = 1;\n",
    );
    execFileSync("git", ["add", "src/api/index.js"], { cwd: fixture.dir });

    const exitCode = await runPreCommitHook(fixture.dir);

    assert.equal(exitCode, 0);
    assert.equal(
      readStagedFile(fixture.dir, "src/api/index.js"),
      "const x = 1;\n",
    );
    fixture.cleanup();
  },
);
