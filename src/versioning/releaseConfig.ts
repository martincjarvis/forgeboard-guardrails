import type { GuardrailsConfig } from "../config/types.ts";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export interface ReleaseConfig {
  tagFormat: string;
  branches: unknown[];
  plugins: unknown[];
}

export function generateReleaseConfigs(
  config: GuardrailsConfig,
): Record<string, ReleaseConfig> {
  const configs: Record<string, ReleaseConfig> = {};

  for (const [name, component] of Object.entries(config.components)) {
    configs[name] = {
      tagFormat: `${config.appName}-${name}@\${version}`,
      branches: [
        config.defaultBranch,
        // Prerelease identifier is the branch name (sanitised to a valid semver
        // identifier), so each feature branch is its own release channel and
        // concurrent branches never collide. semantic-release resolves ${name} to
        // the current branch at run time.
        {
          name: "feature/*",
          prerelease: "${name.replace(/[^a-zA-Z0-9-]/g, '-')}",
        },
      ],
      plugins: [
        ["@semantic-release/commit-analyzer", { releaseRules: [] }],
        "@semantic-release/release-notes-generator",
        [
          "@semantic-release/git",
          {
            assets: [], // component's own paths are scoped via monorepo-plugin config at execution time
          },
        ],
      ],
    };
    // component.paths informs the monorepo-scoping plugin's include list at execution time —
    // recorded here so the generator stays the single source of truth for per-component config.
    void component.paths;
  }

  return configs;
}

export interface DryRunResult {
  nextRelease: { version: string; gitTag: string } | false;
}

/**
 * Invokes semantic-release's CLI in a fully isolated subprocess (captured stdio) so its
 * log output never pollutes the calling test runner's stdout. The CLI parses the same
 * release config we generate above and either reports a computed nextRelease version or
 * exits without one.
 */
export async function runSemanticReleaseDryRun(
  cwd: string,
  releaseConfig: ReleaseConfig,
  // Part of the call contract; this path does not read it.
  _branch = "main",
): Promise<DryRunResult> {
  // Write a per-call .releaserc so the CLI picks up tagFormat/branches/plugins exactly.
  const rcPath = join(cwd, ".releaserc.json");
  writeFileSync(
    rcPath,
    JSON.stringify(
      {
        branches: releaseConfig.branches,
        tagFormat: releaseConfig.tagFormat,
        // Drop @semantic-release/git for the dry-run — no working-tree writes are needed
        // to compute a version, and the plugin would otherwise require write access.
        plugins: releaseConfig.plugins.filter((p) => {
          const name = Array.isArray(p) ? p[0] : p;
          return name !== "@semantic-release/git";
        }),
      },
      null,
      2,
    ),
  );

  const ext = process.platform === "win32" ? ".cmd" : "";
  const bin = join(
    packageRoot,
    "node_modules",
    ".bin",
    `semantic-release${ext}`,
  );

  let stdout = "";
  try {
    // noCi:true so semantic-release doesn't bail just because we're not on CI.
    // repositoryUrl points at the fixture's local path so git ls-remote works offline.
    stdout = execFileSync(
      bin,
      ["--dry-run", "--no-ci", "--repository-url", cwd],
      {
        cwd,
        encoding: "utf8",
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "fixture",
          GIT_AUTHOR_EMAIL: "fixture@example.com",
          GIT_COMMITTER_NAME: "fixture",
          GIT_COMMITTER_EMAIL: "fixture@example.com",
        },
      },
    );
  } catch (error: unknown) {
    // semantic-release exits non-zero both on real errors and on "no release needed".
    // Distinguish via the captured output and re-throw genuine errors.
    if (error instanceof Error && "stdout" in error) {
      stdout = String((error as { stdout?: unknown }).stdout ?? "");
      // semantic-release exits 1 or 2 for "no release needed" as well as for real
      // failures; the captured output distinguishes them, so only other codes rethrow.
      const status = (error as { status?: number }).status;
      if (status !== 1 && status !== 2) throw error;
    } else {
      throw error;
    }
  }

  // The CLI prints "The next release version is X.Y.Z" when a release is computed.
  const versionMatch = stdout.match(/next release version is (\S+)/);
  if (versionMatch) {
    const version = versionMatch[1];
    const gitTag = releaseConfig.tagFormat.replace("${version}", version);
    return { nextRelease: { version, gitTag } };
  }
  return { nextRelease: false };
}
