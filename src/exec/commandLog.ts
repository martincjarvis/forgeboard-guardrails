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
 * Transient diagnostics log for every command the toolkit shells out to, and for
 * the verdict each gate reaches on the strength of it.
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
 * workspace — cannot reach it, so the diagnostics were written and then unreadable
 * by exactly the thing that needed them.
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
 * The file name for this run, shared with every process it spawns.
 *
 * A gated commit is one hook process that spawns npm, which spawns the test
 * runner, which spawns more. One file per process scattered a single commit
 * across a dozen files. Publishing the name through the environment means a
 * child inherits it and appends to the same file, so a run reads as a run.
 *
 * Entries are written with one `appendFileSync` each, so concurrent writers
 * interleave between entries but never inside one.
 */
const SESSION_VAR = "FORGEBOARD_LOG_SESSION";

function sessionName(): string {
  const existing = process.env[SESSION_VAR];
  if (existing) return existing;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `${stamp}-${process.pid}.log`;
  process.env[SESSION_VAR] = name;
  return name;
}

function sessionPath(): string {
  return join(logDir(), sessionName());
}

/** What this run is: `pre-commit`, `pre-push`, `docs`. Set once by the CLI. */
let runLabel = "run";

export function beginRun(label: string): void {
  runLabel = label;
}

/**
 * The log this process wrote, or `undefined` if there is not one — nothing was
 * run, or the write failed. Answered from the filesystem rather than from a flag,
 * so it can never name a path that does not exist.
 */
export function currentLogPath(): string | undefined {
  const path = sessionPath();
  return existsSync(path) ? path : undefined;
}

function append(body: string): void {
  try {
    const path = sessionPath();
    // The header is written per file rather than per process. Keyed off the
    // process it would be missing from every file but the first, which is wrong
    // the moment anything writes to more than one.
    if (!existsSync(path)) {
      ensureLogDir();
      sweepExpiredLogs();
      appendFileSync(
        path,
        `=== ${runLabel} — ${new Date().toISOString()} — pid ${process.pid}\n`,
      );
    }
    appendFileSync(path, body);
  } catch {
    // Diagnostics are never worth failing a gate over.
  }
}

export interface CommandLogEntry {
  command: string;
  cwd: string;
  status: number | null;
  output: string;
  /** Wall time, when the caller measured it. Finds the slow step at a glance. */
  durationMs?: number;
}

export function logCommand(entry: CommandLogEntry): void {
  const took =
    entry.durationMs === undefined
      ? ""
      : `  ${(entry.durationMs / 1000).toFixed(1)}s`;
  // Failures lead with a marker so `grep '^!!!'` finds them without reading the
  // file. The whole point is not having to read the file.
  const marker = entry.status === 0 ? "---" : "!!!";
  const header =
    `\n${marker} exit ${entry.status ?? "unknown"}${took}  ${entry.command}\n` +
    `    cwd: ${entry.cwd}\n`;
  const body = entry.output.trimEnd();
  append(body === "" ? `${header}    (no output)\n` : `${header}${body}\n`);
}

/**
 * Records what a gate concluded, which the commands alone never say.
 *
 * Several gates never shell out — link integrity, the suppression register, PR
 * size, file length. Their verdicts existed only on the terminal, so a log could
 * show every command passing and not say why the commit was refused.
 */
export function logVerdict(gate: string, message: string): void {
  append(`\n*** GATE FAILED: ${gate}\n${message.trimEnd()}\n`);
}

/** Closes the run so the file states its own outcome. */
export function endRun(exitCode: number): void {
  if (currentLogPath() === undefined) return;
  append(
    `\n=== end ${runLabel} — exit ${exitCode} — ${new Date().toISOString()}\n`,
  );
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
    console.error(`Failures in it are marked "!!!" and "*** GATE FAILED".`);
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
