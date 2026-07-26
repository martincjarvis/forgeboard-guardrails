import {
  mkdirSync,
  appendFileSync,
  readdirSync,
  statSync,
  rmSync,
  existsSync,
  writeFileSync,
} from "node:fs";

import { join } from "node:path";

/**
 * How long a diagnostics log survives. Long enough to look at after the run that
 * produced it, short enough that nothing comes to depend on it: anything worth
 * keeping beyond a day belongs in a ticket, not in a log.
 */
export const RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * Transient diagnostics log for every command the toolkit shells out to.
 *
 * A gate reduces a tool to an exit code, and an exit code is not evidence of a
 * clean run: a tool that prints "no configuration found, using defaults" and then
 * exits zero looks identical to one that worked. The programme's standard is zero
 * warnings and zero errors, and without the output written down there is no
 * artefact to check that against.
 *
 * **Inside the repo, at `.forgeboard/logs/`, and self-ignoring.** The directory is
 * created with a `.gitignore` containing `*`, so it excludes itself and everything
 * under it without depending on the consuming repo's root ignore file. A wildcard
 * `git add -A` cannot stage it; committing one takes a deliberate `git add -f`.
 *
 * The system temp directory was the first choice and was wrong. Anything confined
 * to the repository — a sandboxed coding agent, a CI container that mounts only the
 * workspace — cannot reach the system temp directory, so the diagnostics were
 * written and then unreadable by exactly the thing that needed them. An override
 * existed, but it had to be remembered, and a mechanism that depends on someone
 * remembering is the failure this programme exists to correct.
 *
 * **Never fails a gate.** Every filesystem call here is best-effort. A read-only
 * directory or a full disk costs the diagnostics, not the commit.
 */
function logDir(): string {
  return (
    process.env.FORGEBOARD_LOG_DIR ?? join(process.cwd(), ".forgeboard", "logs")
  );
}

/**
 * Creates the log directory already excluded from git. The ignore file lives
 * inside the directory rather than in the repo root so it holds in a repo that
 * never ran `guardrails install`.
 */
function ensureLogDir(): void {
  const dir = logDir();
  mkdirSync(dir, { recursive: true });
  const ignore = join(dir, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, "*\n");
}

/**
 * One file per process, so the commands of a single hook run read together
 * instead of interleaved with a concurrent run's. Resolved on first write —
 * a run that shells out to nothing leaves no file behind.
 */
let sessionName: string | undefined;

/**
 * Only the file name is fixed for the process; the directory is resolved on every
 * call. Caching the full path would freeze whatever `FORGEBOARD_LOG_DIR` happened
 * to hold at the first write, which is wrong the moment it changes.
 */
function sessionPath(): string {
  if (sessionName === undefined) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    sessionName = `${stamp}-${process.pid}.log`;
  }
  return join(logDir(), sessionName);
}

/**
 * The log this process wrote, or `undefined` if there is not one — nothing was
 * run, or the write failed. Answered from the filesystem rather than from a flag,
 * so it can never name a path that does not exist.
 */
export function currentLogPath(): string | undefined {
  if (sessionName === undefined) return undefined;
  const path = sessionPath();
  return existsSync(path) ? path : undefined;
}

export interface CommandLogEntry {
  command: string;
  cwd: string;
  status: number | null;
  output: string;
}

export function logCommand(entry: CommandLogEntry): void {
  try {
    const path = sessionPath();
    if (!existsSync(path)) {
      ensureLogDir();
      sweepExpiredLogs();
    }
    const header =
      `\n=== ${new Date().toISOString()} — exit ${entry.status ?? "unknown"}\n` +
      `    command: ${entry.command}\n` +
      `    cwd:     ${entry.cwd}\n`;
    appendFileSync(path, `${header}${entry.output.trimEnd()}\n`);
  } catch {
    // Diagnostics are never worth failing a gate over.
  }
}

/**
 * Removes logs past the retention window. Runs on the first write of a process
 * rather than on a timer — there is no daemon here, and a sweep that only happens
 * when the toolkit runs is enough for files the toolkit alone creates.
 */
export function sweepExpiredLogs(now: number = Date.now()): void {
  try {
    const dir = logDir();
    for (const name of readdirSync(dir)) {
      if (name === ".gitignore") continue;
      const path = join(dir, name);
      try {
        if (now - statSync(path).mtimeMs > RETENTION_MS) {
          rmSync(path, { force: true });
        }
      } catch {
        // A file that vanished under a concurrent sweep, or one we may not stat.
      }
    }
  } catch {
    // No directory yet, or unreadable. Nothing to sweep either way.
  }
}

/**
 * Tells the developer where the full output went, on the paths where a gate has
 * just blocked them. Silent when there is no log: an absent file must never be
 * announced as if it were there.
 */
export function reportLogPath(): void {
  const path = currentLogPath();
  if (path) {
    console.error(`\nFull output of every command this run: ${path}`);
  }
}
