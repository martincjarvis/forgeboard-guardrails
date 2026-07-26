import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  utimesSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  logCommand,
  currentLogPath,
  sweepExpiredLogs,
  RETENTION_MS,
  reportLogPath,
} from "../../src/exec/commandLog.ts";

/** Log files only — the directory also carries the .gitignore that protects it. */
function logFiles(dir: string): string[] {
  return readdirSync(dir).filter((f) => f.endsWith(".log"));
}

function withLogDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "gr-log-"));
  const previous = process.env.FORGEBOARD_LOG_DIR;
  process.env.FORGEBOARD_LOG_DIR = dir;
  try {
    return fn(dir);
  } finally {
    if (previous === undefined) delete process.env.FORGEBOARD_LOG_DIR;
    else process.env.FORGEBOARD_LOG_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
}

test("records the command, its exit status and both streams", () => {
  withLogDir((dir) => {
    logCommand({
      command: "npm run build",
      cwd: "/repo",
      status: 1,
      output: "on stdout\non stderr",
    });

    const files = logFiles(dir);
    assert.equal(files.length, 1);
    const body = readFileSync(join(dir, files[0]), "utf8");

    assert.match(body, /npm run build/);
    assert.match(body, /exit 1/);
    assert.match(body, /on stdout/);
    assert.match(body, /on stderr/);
  });
});

test("records commands that succeeded, not only ones that failed", () => {
  // The point of the log is checking a zero-exit run for warnings it printed
  // anyway — "no config found, using defaults" and friends. A log of failures
  // only cannot answer the question it exists for.
  withLogDir((dir) => {
    logCommand({
      command: "cspell .",
      cwd: "/repo",
      status: 0,
      output: "warning: no configuration found, using defaults",
    });

    const body = readFileSync(join(dir, logFiles(dir)[0]), "utf8");
    assert.match(body, /exit 0/);
    assert.match(body, /no configuration found/);
  });
});

test("every command in one run lands in a single file", () => {
  withLogDir((dir) => {
    logCommand({ command: "first", cwd: "/r", status: 0, output: "a" });
    logCommand({ command: "second", cwd: "/r", status: 0, output: "b" });

    assert.equal(logFiles(dir).length, 1, "one file per run, not per command");
    const body = readFileSync(join(dir, logFiles(dir)[0]), "utf8");
    assert.match(body, /first/);
    assert.match(body, /second/);
  });
});

test("sweeps logs older than the retention window and keeps newer ones", () => {
  withLogDir((dir) => {
    const old = join(dir, "old.log");
    const recent = join(dir, "recent.log");
    writeFileSync(old, "stale\n");
    writeFileSync(recent, "fresh\n");

    // Backdate past the window rather than trusting a mocked clock: the sweep
    // reads the real modification time, so this exercises the path that runs.
    const expired = (Date.now() - RETENTION_MS - 60_000) / 1000;
    utimesSync(old, expired, expired);

    sweepExpiredLogs();

    assert.equal(
      existsSync(old),
      false,
      "a log past the window must be removed",
    );
    assert.equal(
      existsSync(recent),
      true,
      "a log inside the window must be kept",
    );
  });
});

test("an unwritable log directory degrades to no logging rather than throwing", () => {
  // A gate must never fail because diagnostics could not be written. Pointing the
  // directory at a path that cannot be created is the cheapest reliable way to
  // make every filesystem call fail.
  const previous = process.env.FORGEBOARD_LOG_DIR;
  process.env.FORGEBOARD_LOG_DIR = join("\0invalid", "nope");
  try {
    assert.doesNotThrow(() =>
      logCommand({ command: "x", cwd: "/r", status: 0, output: "y" }),
    );
    assert.doesNotThrow(() => sweepExpiredLogs());
    assert.equal(
      currentLogPath(),
      undefined,
      "no path when nothing was written",
    );
  } finally {
    if (previous === undefined) delete process.env.FORGEBOARD_LOG_DIR;
    else process.env.FORGEBOARD_LOG_DIR = previous;
  }
});

test("the log directory excludes itself from git", () => {
  // The log lives in the repo so that anything confined to the repo — a sandboxed
  // agent, a CI container — can read it. What keeps it out of history is the
  // ignore file the directory carries, not its location, and it must not depend on
  // the consuming repo's root .gitignore having an entry.
  const repo = mkdtempSync(join(tmpdir(), "gr-log-repo-"));
  execFileSync("git", ["init", "-q"], { cwd: repo });

  const previous = process.env.FORGEBOARD_LOG_DIR;
  process.env.FORGEBOARD_LOG_DIR = join(repo, ".forgeboard", "logs");
  try {
    logCommand({ command: "x", cwd: repo, status: 0, output: "y" });
    const path = currentLogPath();
    assert.ok(path, "a path is reported once something is written");

    assert.equal(
      readFileSync(join(repo, ".forgeboard", "logs", ".gitignore"), "utf8"),
      "*\n",
    );

    // git's own answer, not ours: stage everything and confirm no log came with it.
    execFileSync("git", ["add", "-A"], { cwd: repo });
    const staged = execFileSync("git", ["diff", "--cached", "--name-only"], {
      cwd: repo,
      encoding: "utf8",
    });
    assert.ok(
      !staged.includes(".log"),
      `a wildcard "git add -A" staged a log file:\n${staged}`,
    );
  } finally {
    if (previous === undefined) delete process.env.FORGEBOARD_LOG_DIR;
    else process.env.FORGEBOARD_LOG_DIR = previous;
    rmSync(repo, { recursive: true, force: true });
  }
});

test("the sweep never removes the ignore file that protects the directory", () => {
  withLogDir((dir) => {
    logCommand({ command: "x", cwd: "/r", status: 0, output: "y" });
    const ignore = join(dir, ".gitignore");

    const expired = (Date.now() - RETENTION_MS - 60_000) / 1000;
    utimesSync(ignore, expired, expired);
    sweepExpiredLogs();

    assert.equal(
      existsSync(ignore),
      true,
      "sweeping the ignore file would silently un-protect the directory",
    );
  });
});

test("reportLogPath names the file, and says nothing when there is none", () => {
  const said: string[] = [];
  const realError = console.error;
  console.error = (...args: unknown[]) => said.push(args.map(String).join(" "));
  try {
    withLogDir(() => {
      reportLogPath();
      assert.deepEqual(said, [], "nothing written yet, so nothing to point at");

      logCommand({ command: "x", cwd: "/r", status: 1, output: "y" });
      reportLogPath();
      assert.equal(said.length, 1);
      assert.match(said[0], /\.log/);
    });
  } finally {
    console.error = realError;
  }
});
