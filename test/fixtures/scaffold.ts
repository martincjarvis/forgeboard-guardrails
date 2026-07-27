import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { runInstall } from "../../src/commands/install.ts";

export interface FixtureRepo {
  dir: string;
  cleanup: () => void;
}

/**
 * Every scaffolded repo, until it is cleaned up.
 *
 * Tests call `cleanup()` as their last statement, so a failing assertion returns
 * before it and the directory survives — one leak per failure, forever. A run of
 * this suite left 16,749 of them in the system temp directory before this existed.
 *
 * One process-exit handler removes whatever is still registered. Not one listener
 * per fixture: that hits Node's max-listeners warning at eleven, which this suite
 * was already emitting.
 */
const live = new Set<string>();
let sweepRegistered = false;

function registerSweep(): void {
  if (sweepRegistered) return;
  sweepRegistered = true;
  // Must be synchronous — an exit handler cannot await.
  process.on("exit", () => {
    for (const dir of live) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // A directory already gone, or held open by a straggling child process.
      }
    }
    live.clear();
  });
}

/** Removes every fixture still registered. Exported so the sweep is testable. */
export function cleanupLeakedFixtures(): void {
  for (const dir of live) rmSync(dir, { recursive: true, force: true });
  live.clear();
}

export function scaffoldFixtureRepo(options: {
  statusContractEnabled: boolean;
}): FixtureRepo {
  const dir = mkdtempSync(join(tmpdir(), "gr-fixture-"));
  registerSweep();
  live.add(dir);

  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "fixture@example.com"], {
    cwd: dir,
  });
  execFileSync("git", ["config", "user.name", "Fixture"], { cwd: dir });

  for (const name of ["shared", "api", "web"]) {
    mkdirSync(join(dir, "src", name), { recursive: true });
    writeFileSync(
      join(dir, "src", name, "index.js"),
      `console.log("${name}");\n`,
    );
  }

  mkdirSync(join(dir, "tests"), { recursive: true });
  writeFileSync(join(dir, "tests", "architecture.js"), "process.exit(0);\n");

  mkdirSync(join(dir, ".forgeboard"), { recursive: true });
  writeFileSync(
    join(dir, ".forgeboard", "guardrails.config.json"),
    JSON.stringify(
      {
        appName: "fixture",
        defaultBranch: "main",
        statusContract: {
          enabled: options.statusContractEnabled,
          ticketIdPattern: "[A-Z]+-\\d+",
        },
        repo: { architectureTest: "node tests/architecture.js" },
        components: {
          "shared-lib": {
            paths: ["src/shared/**"],
            build: 'node -e "process.exit(0)"',
            unitTest: 'node -e "process.exit(0)"',
          },
          api: {
            paths: ["src/api/**"],
            build: 'node -e "process.exit(0)"',
            unitTest: 'node -e "process.exit(0)"',
          },
          web: {
            paths: ["src/web/**"],
            dependsOn: ["shared-lib"],
            build: 'node -e "process.exit(0)"',
            unitTest: 'node -e "process.exit(0)"',
          },
        },
      },
      null,
      2,
    ),
  );

  // Bootstrap commit BEFORE installing hooks — otherwise the just-installed
  // default-branch-block gate would reject this scaffold commit on main.
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "chore: scaffold fixture repo"], {
    cwd: dir,
  });

  runInstall(dir);

  return {
    dir,
    cleanup: () => {
      live.delete(dir);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
