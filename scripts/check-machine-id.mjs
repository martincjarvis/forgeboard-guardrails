// Check 9 — machine-identifying content (gate 2, and gate 7's sweep).
//
// Bespoke by necessity: no established tool reliably flags an absolute local
// path pasted into a config, a home directory in an example command, or a
// machine name in a comment — secretlint's path rules do not cover it. That
// places this at level 3 of the tooling ladder, with this comment as the
// recorded reason (cross-gate rules: a bespoke check names its reason).
//
// What it flags: absolute paths into a user's home (/home/<name>, /Users/<name>,
// C:\\Users\\<name>), which identify a machine and a person. Placeholders pass:
// the fail-safe is a leak, not a convention.
import { trackedFiles, isText, readStaged, report } from "./lib.mjs";
import { pathToFileURL } from "node:url";

// A username segment: letter first, then word/dot/hyphen. Excludes regex
// metacharacters, which is also what keeps this checker off its own source:
// the patterns there contain backslashes and brackets the segment won't match.
const SEG = "[A-Za-z][A-Za-z0-9._-]{1,30}";

// Names that are convention, not a person. Everything else in a home path is a
// real user, and a real user in a tracked file is the leak this checks for.
// The container/image defaults (vscode, codespace, node, …) identify a role in
// an official base image, not a person or a machine — the devcontainer's own
// Dockerfile documents REMOTE_USER defaulting to `vscode`.
const PLACEHOLDERS = new Set([
  "user",
  "users",
  "username",
  "name",
  "your-name",
  "yourname",
  "your_username",
  "local",
  "share",
  "shared",
  "home",
  "placeholder",
  "example",
  "examples",
  "sample",
  "demo",
  "foo",
  "bar",
  "baz",
  "test",
  "tests",
  "testing",
  "alice",
  "bob",
  "you",
  "your",
  "someone",
  "owner",
  "admin",
  "nobody",
  "root",
  "vscode",
  "codespace",
  "node",
  "python",
  "ruby",
  "go",
  "rust",
  "postgres",
  "redis",
  "nginx",
  "ubuntu",
  "debian",
  "alpine",
]);

const PATTERNS = [
  { name: "POSIX home path", re: new RegExp(`/home/(${SEG})`) },
  { name: "macOS home path", re: new RegExp(`/Users/(${SEG})`) },
  {
    name: "Windows home path",
    re: new RegExp(`[A-Za-z]:\\\\Users\\\\(${SEG})`),
  },
];

function isPlaceholder(name) {
  const lower = name.toLowerCase();
  if (PLACEHOLDERS.has(lower)) return true;
  // "<...>", "{...}", "name" templates already excluded by SEG; also skip a
  // segment that is only the literal word used as a slot.
  return /^(user|name|username|path|dir|project|repo|app)[0-9]*$/i.test(name);
}

/** Check files for machine-identifying home paths. Returns findings. */
export function checkMachineId(files) {
  const findings = [];
  const scan = files ?? trackedFiles();
  for (const file of scan) {
    if (!isText(file)) continue;
    let md;
    try {
      md = readStaged(file);
    } catch {
      continue;
    }
    const lines = md.split("\n");
    for (let i = 0; i < lines.length; i++) {
      for (const { name, re } of PATTERNS) {
        const m = re.exec(lines[i]);
        if (m && !isPlaceholder(m[1])) {
          findings.push({
            check: "machine-identifying content",
            path: `${file}:${i + 1}`,
            problem: `${name} names a user (\`${m[1]}\`)`,
            remedy: "replace with a placeholder such as /home/user or <name>",
          });
        }
      }
    }
  }
  return findings;
}

const isMain =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const files = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const findings = checkMachineId(files.length ? files : undefined);
  process.stderr.write(
    `machine-id: ${findings.length} machine-identifying finding(s)\n`,
  );
  report("gate 2", findings);
}
