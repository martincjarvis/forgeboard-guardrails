// Check 16 — dependency licence register completeness (gate 2, 2.3).
//
// Change-triggered (change-triggered-checks.md): runs only when a lock file is
// part of the change, and is a visible skip otherwise. This checks
// completeness — every dependency npm resolves has a current register row —
// never policy: whether a licence is acceptable is gate 6 check 7, against the
// allow list (registers.md: "completeness and policy are different checks").
//
// cspell:ignore Unlicense
import { readStaged, run, report } from "./lib.mjs";
import { pathToFileURL } from "node:url";

export const REGISTER = "docs/registers/dependency-licence-register.md";

function cellsOf(row) {
  return row
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** Rows already recorded, as a Set of "name@version". Null means the register
 *  itself does not exist — distinct from an empty register, which parses to an
 *  empty Set and still fails completeness for every resolved dependency. */
function parseRegister() {
  let md;
  try {
    md = readStaged(REGISTER);
  } catch {
    return null;
  }
  const rows = new Set();
  for (const line of md.split("\n")) {
    if (!line.startsWith("|") || line.includes("---")) continue;
    const cells = cellsOf(line);
    if (cells.length < 2) continue;
    const dep = cells[0]?.trim();
    const version = cells[1]?.trim();
    if (!dep || (/dependency/i.test(dep) && /version/i.test(version))) continue;
    if (dep.startsWith("_") || dep.startsWith("No rows")) continue;
    rows.add(`${dep}@${version}`);
  }
  return rows;
}

/** The resolved tree, direct and transitive, as a Map of name -> version.
 *  `npm ls --all --json` is what registers.md names as the no-extra-tooling
 *  option, and it is already a pinned devDependency's neighbour — nothing new
 *  to install. Returns null when the tree could not be read at all (`npm ci`
 *  never ran, or the output is not JSON), which is unverifiable rather than
 *  clean and must not be read as "nothing resolved". */
function resolvedDependencies() {
  const r = run("npm", ["ls", "--all", "--json"]);
  let tree;
  try {
    tree = JSON.parse(r.stdout || "");
  } catch {
    return null;
  }
  const deps = new Map();
  const seen = new Set();
  (function walk(node) {
    for (const [name, info] of Object.entries(node?.dependencies ?? {})) {
      if (info?.version) deps.set(name, info.version);
      const key = `${name}@${info?.version}`;
      if (!seen.has(key)) {
        seen.add(key);
        walk(info);
      }
    }
  })(tree);
  return deps;
}

/** { findings, skips }. `lockChanged` is the caller's own scope decision — the
 *  staged set locally, the pull request's changed-file range in CI — so this
 *  module makes no assumption about where the scope came from. */
export function checkLicenceCompleteness(lockChanged) {
  const skips = [];
  if (!lockChanged) {
    skips.push(
      "dependency licence register — no lock file in scope, check skipped",
    );
    return { findings: [], skips };
  }

  const resolved = resolvedDependencies();
  if (!resolved) {
    return {
      findings: [
        {
          check: "dependency licence register",
          problem:
            "`npm ls --all --json` did not produce a readable dependency tree",
          remedy: "run `npm ci` so the tree resolves, then re-run this check",
        },
      ],
      skips,
    };
  }

  const rows = parseRegister();
  if (rows === null) {
    return {
      findings: [
        {
          check: "dependency licence register",
          path: REGISTER,
          problem:
            `the lock file changed but ${REGISTER} does not exist, so none ` +
            `of the ${resolved.size} resolved dependencies have a row`,
          remedy:
            "create the register — one row per resolved dependency, per " +
            "docs/standards/guardrails/registers.md#the-dependency-licence-register",
        },
      ],
      skips,
    };
  }

  const findings = [];
  for (const [name, version] of resolved) {
    if (!rows.has(`${name}@${version}`)) {
      findings.push({
        check: "dependency licence register",
        path: REGISTER,
        problem: `${name}@${version} is resolved but has no current register row`,
        remedy: `add a row to ${REGISTER} for ${name}@${version}`,
      });
    }
  }
  return { findings, skips };
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  // Manual run: treat any path argument naming a lock file as "changed".
  const args = process.argv.slice(2);
  const lockChanged = args.some((a) => /package-lock\.json$/.test(a));
  const { findings, skips } = checkLicenceCompleteness(lockChanged);
  report("gate 2", findings, skips);
}
