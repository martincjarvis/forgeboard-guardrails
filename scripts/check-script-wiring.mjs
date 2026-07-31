// cspell:ignore lintstagedrc
// Gate 7 — quality-script wiring audit (fix 16; cross-gate-rules.md, "Every
// quality script is wired or declared").
//
// The defect class this closes: `package.json`'s `scripts` reads as an
// inventory of checks the repository runs, but nothing enforces that a
// listed script is actually invoked anywhere. Three real instances found
// this way — `lint` (unwired until fix 10), `spell` (wired to the Markdown
// subset only, until fix 15 extended it), `gate:7` itself (on demand by
// design, never invoked by another gate — the false positive this audit
// must not raise). To anyone scanning the manifest the first two read as
// checks the repository runs; that is worse than an absent script, because
// it answers "is this enforced?" with a confident yes.
//
// Pairs with the refusal-proof contract (check-refusal-proofs.mjs): that
// catches a check wired but structurally unable to fail; this catches a
// check declared in the manifest but never invoked by anything. Both
// present as green to a reader who only opens `package.json`.
//
// A wiring property, not a content property — it changes only when wiring
// changes, so like the refusal-proof audit this runs at gate 7 and in CI,
// never per commit.
//
// WIRING is hand-authored, not derived by scanning every script and hook
// for plausible-looking substrings: a script is either genuinely invoked
// somewhere (and the claim below is verified against that file's actual
// content, so the declaration cannot silently drift from the code) or it
// is a deliberate on-demand entry point, which is a human decision no scan
// could infer. Matching is on the tool and its defining flag, not the
// npm-script's own exact command line — `npm run lint` itself is never
// typed anywhere; pre-commit.mjs invokes `eslint --max-warnings 0`
// directly, which is the same check by a different route.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const WIRING = {
  build: {
    file: "scripts/gate-0-baseline.mjs",
    contains: 'run("npm", ["run", "build"])',
  },
  lint: {
    file: "scripts/pre-commit.mjs",
    contains: '"eslint", "--max-warnings", "0"',
  },
  test: {
    file: "scripts/gate-0-baseline.mjs",
    contains: '"--test", "hooks/test/hooks.test.mjs"',
  },
  "test:coverage": {
    file: "scripts/gate-5-push.mjs",
    contains: 'run("npm", ["run", "test:coverage"])',
  },
  format: {
    file: ".lintstagedrc.json",
    contains: '"prettier --write"',
  },
  "lint:md": {
    file: ".lintstagedrc.json",
    contains: '"markdownlint-cli2"',
  },
  spell: {
    // Fix 15 extended cspell to the code glob, the same invocation this
    // matches — before that fix this script was exactly the gap fix 16's
    // own audit found (the Markdown subset only).
    file: ".lintstagedrc.json",
    contains: '"cspell lint --no-progress --no-must-find-files"',
  },
};

/** Scripts with no gate wiring by design, and the gate that would
 *  otherwise own them. */
const ON_DEMAND = {
  "gate:0":
    "is gate 0 itself — invoked directly at the start of a unit of work; a gate does not invoke itself",
  "gate:7":
    "is gate 7 itself — invoked directly on demand or by refusal-proof-audit.yml; a gate does not invoke itself",
  "format:check":
    "superseded per commit by the auto-fixing `format` step (.lintstagedrc.json runs prettier --write before anything else reads the bytes, per gate-2-commit.md's ordering rule); kept as a read-only check for CI or a human who wants to verify without mutating. Gate 2 (commit) is the gate that would otherwise own it",
  prepare:
    "husky's own lifecycle install hook, not a check — nothing to wire or declare",
};

/** { wired, onDemand, unwired }. `scripts` is package.json's own `scripts`
 *  object; `readFile` reads the file a WIRING entry claims to find its
 *  evidence in — injectable so the self-verification is testable without
 *  touching the real tree. Defaults to a real disk read, resolved against
 *  the caller's cwd (gate 7 always runs from the repository root). */
export function checkScriptWiring(
  scripts,
  readFile = (file) => readFileSync(file, "utf8"),
) {
  const wired = [];
  const onDemand = [];
  const unwired = [];
  for (const name of Object.keys(scripts ?? {})) {
    if (name in WIRING) {
      const { file, contains } = WIRING[name];
      let content = "";
      try {
        content = readFile(file);
      } catch {
        content = "";
      }
      if (content.includes(contains)) {
        wired.push(name);
      } else {
        unwired.push(
          `${name} — expected to find its wiring in ${file} (looked for ${JSON.stringify(contains)}) but it is not there; the declaration has drifted from the code`,
        );
      }
    } else if (name in ON_DEMAND) {
      onDemand.push(name);
    } else {
      unwired.push(
        `${name} — no gate, hook or workflow invokes it, and it is not declared on-demand`,
      );
    }
  }
  return { wired, onDemand, unwired };
}

// --- Fix 40, "close the class, not just the instance" ----------------------
// The defect above's own instance: check-standards-instantiation.mjs was
// never a package.json script at all, so checkScriptWiring never had a
// chance to see it — it was ported, carried unit tests, and sat unimported
// by anything that runs. WIRING and ON_DEMAND above are keyed by npm-script
// name because that is the only place a "wired or declared" claim could be
// checked; a script that never reached package.json needs the check applied
// to the directory itself.

/** scripts/*.mjs files that are check scripts by naming convention
 *  (`check-*.mjs`) but are deliberately not imported by any gate in THIS
 *  repository — a human decision no scan could infer, the same reason
 *  ON_DEMAND above is hand-authored rather than derived. Keyed by filename,
 *  each value the reason, so a false claim here is as visible as the
 *  wiring claims above. */
const SCRIPT_FILE_ON_DEMAND = {
  "check-standards-instantiation.mjs":
    "reference implementation meant to be ported into a consuming repository's own tooling directory and wired into that repository's own gate 7 (docs-style.md#standards-in-a-consuming-repository, and the file's own header) — this repository is the canonical corpus, not an instantiated copy, and correctly documents every stack it supports, so it is not run here",
  "check-licence-table.mjs":
    "licence-table re-validation against each entry's own external reference — the file's own header: invoked by hand when adding a licence or confirming the table is current, deliberately not folded into gate 7's default sweep because it depends on external hosts staying reachable, a slower and less reliable failure mode than the rest of that sweep",
  "check-pr-body-artefacts.mjs":
    "fix 68's reserved-class citation check: it reads an already-open pull request's own body via `gh pr view`, which has nothing to read before a pull request exists — a chicken-and-egg gate 6 cannot resolve by running earlier. Invoked by hand, or from a reviewer session, against the pull request under review; the file's own header records the same reasoning.",
};

/** { wired, onDemand, unwired } for `check-*.mjs` files in scripts/ itself,
 *  independent of what package.json's `scripts` object happens to list —
 *  the generic form of checkScriptWiring above. `scriptFiles` is every
 *  filename in scripts/ (readdirSync's own list, injectable for the same
 *  reason `readFile` is); `readFile` reads one script's own source, keyed
 *  by that same filename, so an import elsewhere is verified against real
 *  content rather than assumed. "Wired" means at least one other file in
 *  scripts/ imports it (`from "./<file>"`) — which, transitively, is how
 *  every check that genuinely runs reaches a gate in this repository; a
 *  check-*.mjs file imported by nothing but its own unit test has no such
 *  import to find. */
export function checkScriptFileWiring(scriptFiles, readFile) {
  const wired = [];
  const onDemand = [];
  const unwired = [];
  const sources = new Map();
  for (const f of scriptFiles) {
    try {
      sources.set(f, readFile(f) ?? "");
    } catch {
      sources.set(f, "");
    }
  }
  for (const file of scriptFiles) {
    if (!/^check-.*\.mjs$/.test(file)) continue;
    const imported = [...sources.entries()].some(
      ([other, text]) => other !== file && text.includes(`"./${file}"`),
    );
    if (imported) {
      wired.push(file);
    } else if (file in SCRIPT_FILE_ON_DEMAND) {
      onDemand.push(file);
    } else {
      unwired.push(
        `${file} — no other script in scripts/ imports it, and it is not declared on-demand (SCRIPT_FILE_ON_DEMAND in check-script-wiring.mjs)`,
      );
    }
  }
  return { wired, onDemand, unwired };
}

// --- Fix 43 — the same defect class one level up, in the documentation that
// describes the wiring rather than the manifest. A tooling index (e.g.
// scripts/README.md) that names the gate a script runs at is making a
// checkable claim; nothing previously re-verified it against the script's
// actual invocation, which is exactly how a false "runs at gate 7" line
// survived unnoticed.

/** Which gate file corresponds to which gate number, for the claims a
 *  tooling index makes in prose ("gate 6", "gate 7") — hand-authored for the
 *  same reason WIRING above is: which file implements which gate is a
 *  structural fact about this repository, not something worth deriving from
 *  a naming convention a rename could break silently. */
export const GATE_FILES = {
  0: "gate-0-baseline.mjs",
  2: "pre-commit.mjs",
  5: "gate-5-push.mjs",
  6: "gate-6-pull-request.mjs",
  7: "gate-7-on-demand.mjs",
};

/** Findings where a tooling index's own prose claims a script runs at a gate
 *  that gate's own source does not actually import it from. `indexText` is
 *  the index file's content (e.g. scripts/README.md); `gateSources` maps
 *  each gate file name (GATE_FILES' values) to that file's own source, so
 *  "does this gate really invoke it" is answered by import evidence, not by
 *  trusting the index's own prose back to itself. A row naming a gate number
 *  this repository has no file for is also a mismatch — a typo or a stale
 *  gate number reads the same as a false claim to a reader. */
export function checkIndexGateClaims(indexText, gateSources) {
  const findings = [];
  const rowRe = /`([\w-]+\.mjs)`[^\n]*?\bgate\s*(\d+)\b/gi;
  let m;
  while ((m = rowRe.exec(indexText))) {
    const [, script, gateNumStr] = m;
    const gateNum = Number(gateNumStr);
    const gateFile = GATE_FILES[gateNum];
    const gateText = gateFile ? gateSources[gateFile] : undefined;
    const invoked =
      gateText !== undefined &&
      gateText !== null &&
      gateText.includes(`"./${script}"`);
    if (!invoked) {
      findings.push(
        `${script} — the index claims it runs at gate ${gateNum}, but ${gateFile ?? `no gate ${gateNum} file is known`} does not invoke it`,
      );
    }
  }
  return findings;
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const { wired, onDemand, unwired } = checkScriptWiring(pkg.scripts);
  for (const s of wired) process.stderr.write(`script wiring: WIRED ${s}\n`);
  for (const s of onDemand)
    process.stderr.write(`script wiring: ON-DEMAND ${s} — ${ON_DEMAND[s]}\n`);
  for (const s of unwired)
    process.stderr.write(`script wiring: UNWIRED ${s}\n`);

  const scriptFiles = readdirSync("scripts").filter((f) => f.endsWith(".mjs"));
  const readScript = (f) => readFileSync(join("scripts", f), "utf8");
  const files = checkScriptFileWiring(scriptFiles, readScript);
  for (const s of files.wired)
    process.stderr.write(`script-file wiring: WIRED ${s}\n`);
  for (const s of files.onDemand)
    process.stderr.write(
      `script-file wiring: ON-DEMAND ${s} — ${SCRIPT_FILE_ON_DEMAND[s]}\n`,
    );
  for (const s of files.unwired)
    process.stderr.write(`script-file wiring: UNWIRED ${s}\n`);

  let indexFindings = [];
  const indexPath = join("scripts", "README.md");
  if (existsSync(indexPath)) {
    const gateSources = Object.fromEntries(
      Object.values(GATE_FILES).map((f) => {
        try {
          return [f, readFileSync(join("scripts", f), "utf8")];
        } catch {
          return [f, ""];
        }
      }),
    );
    indexFindings = checkIndexGateClaims(
      readFileSync(indexPath, "utf8"),
      gateSources,
    );
    for (const f of indexFindings)
      process.stderr.write(`script-index wiring: MISMATCH ${f}\n`);
  } else {
    process.stderr.write(
      "script-index wiring: SKIP — no scripts/README.md in this repository\n",
    );
  }

  const totalUnwired =
    unwired.length + files.unwired.length + indexFindings.length;
  process.stderr.write(
    `script wiring: ${wired.length + files.wired.length} wired, ${onDemand.length + files.onDemand.length} on-demand, ${totalUnwired} unwired\n`,
  );
  process.exit(totalUnwired > 0 ? 2 : 0);
}
