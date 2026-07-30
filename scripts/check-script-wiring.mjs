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
import { readFileSync } from "node:fs";
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

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const { wired, onDemand, unwired } = checkScriptWiring(pkg.scripts);
  for (const s of wired) process.stderr.write(`script wiring: WIRED ${s}\n`);
  for (const s of onDemand)
    process.stderr.write(`script wiring: ON-DEMAND ${s} — ${ON_DEMAND[s]}\n`);
  for (const s of unwired)
    process.stderr.write(`script wiring: UNWIRED ${s}\n`);
  process.stderr.write(
    `script wiring: ${wired.length} wired, ${onDemand.length} on-demand, ${unwired.length} unwired\n`,
  );
  process.exit(unwired.length > 0 ? 2 : 0);
}
