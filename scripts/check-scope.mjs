// Gate 3 — commit message, checks 3, 4 and 5 (structure/type are commitlint's).
//
// The scope is the component name, and the component set is derived from the
// plugin manifest (ADR-0001, ADR-0003): one component, whose paths are the
// conventional plugin directories. An empty scope means repository-wide and is
// always allowed; any other scope is not a declared component and is refused.
//
// checkCommitMessage is the reusable check: one message plus the paths that
// commit touched. .husky/commit-msg calls it once, against the staged index,
// for the commit being made. Gate 6 calls it once per commit in the pull
// request's range — gate-6-pull-request.md is explicit that this check adapts
// per commit in `git log origin/<base>..HEAD`, not once against the branch tip
// — with `git diff-tree` standing in for the staged list a checkout does not
// have.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  stagedFiles,
  deriveComponent,
  touchesComponent,
  report,
  run,
  splitLines,
} from "./lib.mjs";

const ALLOWED_TYPES = [
  "feat",
  "fix",
  "refactor",
  "perf",
  "test",
  "docs",
  "build",
  "ci",
  "chore",
];

// Checks 2 and 3 — type and scope are each one flat rule; kept as their own
// functions rather than folded into checkCommitMessage so no single function
// carries every branch (a gate script is held to the same complexity gap-fill
// this repository runs everywhere else — thresholds.md, 15 per function).
/** @param {string} type */
function checkType(type) {
  if (ALLOWED_TYPES.includes(type)) return null;
  return {
    check: "commit type",
    problem: "type '" + type + "' is outside the declared set",
    remedy: "use one of: " + ALLOWED_TYPES.join(", "),
  };
}

/** @param {string} scope @param {{ name: string, paths: string[] } | null} component */
function checkScopeDeclared(scope, component) {
  if (!scope || (component && scope === component.name)) return null;
  return {
    check: "commit scope",
    problem: "scope '" + scope + "' is not a declared component",
    remedy: component
      ? "the one component is '" +
        component.name +
        "'; use it, or omit the scope for repository-wide work"
      : "omit the scope for repository-wide work",
  };
}

// Check 5 — scope agreement: a scope naming the component must touch it.
/** @param {string} scope @param {string[]} files @param {{ name: string, paths: string[] } | null} component */
function checkScopeAgreement(scope, files, component) {
  if (!component || scope !== component.name) return null;
  if (
    !files.length ||
    files.some((f) => touchesComponent(f, component.paths))
  ) {
    return null;
  }
  return {
    check: "scope agreement",
    problem:
      "scope '" +
      scope +
      "' names the component but no touched path is in it (" +
      component.paths.join(", ") +
      ")",
    remedy: "either touch the component's paths, or drop the scope",
  };
}

// Check 4 — a breaking marker needs a footer describing the migration.
/** @param {string} message @param {string | undefined} breaking */
function checkBreakingFooter(message, breaking) {
  if (!breaking && !/BREAKING CHANGE:/i.test(message)) return null;
  if (/^BREAKING CHANGE:\s*\S.*$/m.test(message)) return null;
  return {
    check: "breaking change",
    problem: "a breaking marker is set without a BREAKING CHANGE: footer",
    remedy: "add a BREAKING CHANGE: footer describing the migration",
  };
}

/** Checks 3, 4 and 5 against one message and the paths its commit touches.
 *  Returns an array of findings; empty means clean.
 *  @param {string} message
 *  @param {string[]} files
 *  @param {{ name: string, paths: string[] } | null} component
 *  @returns {{check: string, path?: string, problem: string, remedy: string}[]} */
export function checkCommitMessage(message, files, component) {
  const header = message.split("\n")[0] ?? "";
  const parsed = header.match(/^([a-z]+)(?:\(([^)]*)\))?(!)?: /);
  if (!parsed) {
    return [
      {
        check: "commit message structure",
        problem: "header is not `type(scope): summary` — got: " + header,
        remedy: "see docs/standards/guardrails/gate-3-commit-message.md",
      },
    ];
  }

  const [, type, scopeRaw, breaking] = parsed;
  const scope = scopeRaw ?? "";
  return [
    checkType(type ?? ""),
    checkScopeDeclared(scope, component),
    checkScopeAgreement(scope, files, component),
    checkBreakingFooter(message, breaking),
  ].filter((f) => f !== null);
}

/** Every non-merge commit in a two-dot log range (`base..HEAD`), each checked
 *  against the paths that one commit — not the branch as a whole — touched.
 *  Returns findings prefixed with the short SHA they came from.
 *  @param {string} logRange
 *  @param {{ name: string, paths: string[] } | null} component */
export function checkCommitRange(logRange, component) {
  const findings = [];
  const shas = run("git", ["log", logRange, "--no-merges", "--format=%H"]);
  if (shas.status !== 0) {
    return [
      {
        check: "commit message range",
        problem: `\`git log ${logRange}\` failed`,
        remedy: "confirm the base ref was fetched before this check runs",
      },
    ];
  }
  for (const sha of splitLines(shas.stdout)) {
    const msg = run("git", ["log", "-1", "--format=%B", sha]);
    const message = msg.status === 0 ? msg.stdout : "";
    const diff = run("git", [
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      sha,
    ]);
    const files = diff.status === 0 ? splitLines(diff.stdout) : [];
    const short = sha.slice(0, 8);
    for (const f of checkCommitMessage(message, files, component)) {
      findings.push({ ...f, path: f.path ? `${short} ${f.path}` : short });
    }
  }
  return findings;
}

const argv1 = process.argv[1];
const isMain = argv1 && import.meta.url === pathToFileURL(argv1).href;
if (isMain) {
  const component = deriveComponent();
  process.stderr.write(
    component
      ? "gate 3: component set = " +
          component.name +
          " (paths: " +
          component.paths.join(", ") +
          ")\n"
      : "gate 3: no plugin manifest found — only empty scope is allowed\n",
  );

  if (process.argv[2] === "--range") {
    // Gate 6 usage: validate every commit in the pull request, not the
    // staged index — there is no staged index in a checkout.
    const logRange = process.argv[3];
    if (!logRange) {
      process.stderr.write("gate 3: --range needs a log range argument\n");
      process.exit(1);
    }
    report("gate 3", checkCommitRange(logRange, component));
  } else {
    // .husky/commit-msg usage: the one message about to be committed.
    const msgFile = process.argv[2];
    let message = "";
    if (msgFile) {
      try {
        message = readFileSync(msgFile, "utf8");
      } catch {
        message = "";
      }
    }
    if (!message && process.stdin.isTTY === false) {
      // Some harnesses pipe the message on stdin instead.
      try {
        message = readFileSync(0, "utf8");
      } catch {
        /* ignore */
      }
    }
    report("gate 3", checkCommitMessage(message, stagedFiles(), component));
  }
}
