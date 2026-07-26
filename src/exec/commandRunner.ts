import { execSync } from "node:child_process";

/**
 * A full coverage run over this repo already prints ~40 KB. Node's 1 MB default
 * truncates a verbose suite mid-report and kills it, which surfaces as a gate
 * defect rather than as a long log.
 */
const MAX_BUFFER = 32 * 1024 * 1024;

/**
 * Both streams off a failed `execSync`, stdout first.
 *
 * Gate commands are third-party tools and most of them put their diagnosis on
 * stderr — node's test runner, dotnet, every linter. Reading `stdout` alone, as
 * this did, produced gate failures with nothing to say about what failed.
 *
 * `stdio[2]` is a pipe rather than "inherit" so stderr lands here instead of
 * escaping to the terminal, where lint-staged's renderer swallows it.
 */
function combine(error: unknown): string {
  const streams = error as { stdout?: unknown; stderr?: unknown };
  const parts = [streams?.stdout, streams?.stderr]
    .map((s) => (s === undefined || s === null ? "" : String(s)))
    .filter((s) => s.trim() !== "");
  // Nothing on either stream means the command never ran — a missing shell, or a
  // binary that does not exist. The thrown message is then all there is.
  if (parts.length === 0) {
    return error instanceof Error ? error.message : String(error);
  }
  return parts.join("\n");
}

export interface CommandStepResult {
  command: string;
  index: number;
  total: number;
  pass: boolean;
  /**
   * Both streams, stdout first. Gate commands are third-party tools and most of
   * them diagnose on stderr — node's test runner, dotnet, every linter — so a
   * stdout-only capture reports a failure with nothing to say about it. Captured
   * on the passing path too: warnings go to stderr on runs that still exit zero.
   */
  output: string;
}

export interface CommandSequenceResult {
  pass: boolean;
  steps: CommandStepResult[];
}

/**
 * Runs a sequence of shell command strings, fail-fast, capturing per-step output.
 *
 * Commands run through a shell (`execSync`) by design: they are the consuming repo's
 * own declared build/test/lint commands (`dotnet test ...`, `az bicep build`, a repo's
 * npm script), which are arbitrary shell strings and often rely on shell features. The
 * command strings are trusted repo-author configuration, not untrusted external input —
 * whoever can edit `.forgeboard/guardrails.config.json` already controls the repo — so
 * there is no privilege boundary crossed here. Do not "harden" this into an argv-array
 * exec: that would break the documented command-sequence feature.
 */
/**
 * Git exports GIT_DIR, GIT_INDEX_FILE, GIT_WORK_TREE and friends into hook
 * processes. Gate commands are the consuming repo's own build/test commands, which
 * routinely run their own git operations (and our test suite scaffolds throwaway git
 * fixtures) — if they inherit the hook's git env those operations target the outer
 * repo's transient index instead of their own working tree, failing spuriously. Strip
 * the git-hook env so every gate command runs against a clean git context.
 */
function gateEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of [
    "GIT_DIR",
    "GIT_INDEX_FILE",
    "GIT_WORK_TREE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_PREFIX",
  ]) {
    delete env[key];
  }
  return env;
}

export function runCommandSequence(
  commands: string | string[] | undefined,
  cwd: string,
): CommandSequenceResult {
  if (commands === undefined) {
    return { pass: true, steps: [] };
  }

  const list = Array.isArray(commands) ? commands : [commands];
  const steps: CommandStepResult[] = [];

  for (let index = 0; index < list.length; index++) {
    const command = list[index];
    try {
      // Accepted risk, boundary documented in this file's header: command strings are
      // repo-author configuration, and anyone who can edit guardrails.config.json
      // already controls the repo. Hardening this to an argv array would break the
      // command-sequence feature the toolkit exists to provide.
      // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process
      const output = execSync(command, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: gateEnv(),
        maxBuffer: MAX_BUFFER,
      });
      steps.push({ command, index, total: list.length, pass: true, output });
    } catch (error: unknown) {
      const output = combine(error);
      steps.push({ command, index, total: list.length, pass: false, output });
      return { pass: false, steps };
    }
  }

  return { pass: true, steps };
}
