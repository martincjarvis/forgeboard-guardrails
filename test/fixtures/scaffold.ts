import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { runInstall } from "../../src/commands/install.ts";

export interface FixtureRepo {
  dir: string;
  cleanup: () => void;
}

export function scaffoldFixtureRepo(options: {
  statusContractEnabled: boolean;
}): FixtureRepo {
  const dir = mkdtempSync(join(tmpdir(), "gr-fixture-"));

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
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
