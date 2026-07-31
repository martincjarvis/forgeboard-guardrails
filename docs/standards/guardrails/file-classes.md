---
type: reference
summary: The six file classes several checks vary their verdict by — production, configuration, test, documentation, agent context and tooling — and the rules for classifying a file.
read_when: Declaring class patterns for a repository, or working out why two files of the same length got different verdicts.
---

# File classes

Several checks treat a file differently according to what kind of file it is.
The classification is therefore load-bearing, and it is declared, not inferred
from a hunch about the path.

| Class         | Is                                                                                                                | Counted in change size | Length limit          | Warn band     |
| ------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------- | --------------------- | ------------- |
| Production    | Code that ships or runs in the product                                                                            | Yes                    | File length           | **Push back** |
| Configuration | Build, dependency, pipeline and infrastructure definitions                                                        | Yes                    | None                  | n/a           |
| Test          | Code that exists to exercise production code                                                                      | No                     | File length           | Warn          |
| Documentation | Prose for humans                                                                                                  | No                     | None                  | n/a           |
| Agent context | Prose an agent loads as context, including skill definitions                                                      | No                     | Agent-document limits | Warn          |
| Tooling       | Code that implements or runs the repository's own gates and other development-only automation — never the product | Yes                    | None                  | n/a           |

## Rules

- **Declared in `.gitattributes`, through a `guardrail-class` attribute.** Not a
  bespoke configuration file: git already owns per-path attributes, already
  defines their precedence, and already answers them without a parser
  ([ADR-0003](../../ADR/0003-derive-configuration.md)).

  ```gitattributes
  src/**       guardrail-class=production
  tests/**     guardrail-class=test
  docs/**      guardrail-class=documentation
  skills/**    guardrail-class=agent-context
  *.csproj     guardrail-class=configuration
  ```

  Query one path with `git check-attr guardrail-class -- <path>`. Because the
  attributes are per-directory and inherited, a subdirectory can correct its
  parent without a central list to keep in step — and the file is present in a
  conforming repository anyway, carrying the line-ending normalisation.

- **Exactly one class per file.** Git resolves the most specific match, so a
  file cannot hold two classes — but two patterns of equal specificity
  disagreeing is a defect, reported as one rather than settled by file order.
- **A dual-audience document is not a tie — it is two artefacts.** A reference
  document stays a human document, classified as documentation. Its frontmatter
  is what lets an agent decide whether to load it at all, which is progressive
  disclosure working as intended and costs nothing when the answer is no.
  Agent-specific instruction does not belong in its body as a second voice; it
  belongs in an accompanying skill definition, classified as agent context and
  held to those limits. Splitting by audience keeps the reference coherent for
  everyone and gives the agent something written entirely for it.
- **An unclassified file is production.** The fail-safe direction: treating
  production code as documentation removes it from change size, from the length
  limit and from complexity in one step, and nothing downstream notices.

  Note the neighbouring rule points the other way, and both are correct. An
  unclassified **file** narrows to the strictest class; an unclassified **path**
  widens to [every component](components.md#the-changed-component-rule). Each
  fails safe for its own question: "how strictly is this judged" defaults to
  strictly, and "how much must be rebuilt" defaults to everything. They are easy
  to cross-wire precisely because both are called the fail-safe direction.

- **Configuration and tooling count toward change size but carry no length
  limit.** A long infrastructure definition is not a design smell; the same
  holds for a long gate script — a 900-line change to how the system is
  built, or to how the repository checks itself, still needs a human to look
  at it.
- **A generated file counts toward neither change size nor the length
  limit.** Change size's remedy is "split the change" or "justify its size";
  neither is available for a file no author can meaningfully edit, because the
  next generation run discards whatever was written. `package-lock.json` is
  the recurring case — one file, regenerated wholesale by a routine dependency
  bump — but the property is not confined to lock files: `*.g.cs`, designer
  files, protobuf and gRPC output, and OpenAPI clients all share it. A
  blocking check whose remedy cannot be performed is not a gate, it is a toll
  payable only in overrides, and an override that fires on every dependency
  bump stops being read
  ([bypass-and-exceptions.md](bypass-and-exceptions.md) makes the same
  argument about routine exceptions generally).

  **Declared through its own `guardrail-generated` attribute — a separate
  boolean, never a sixth `guardrail-class`.** A lockfile keeps its
  `guardrail-class` (`configuration`) for every other check that reads it —
  secret scanning, licence policy and the advisory scan must still see it;
  it is the change-size remedy that is impossible, not the file that is
  uninteresting. Folding this into `guardrail-class=generated` would strip
  the file of its class instead, and those checks would stop seeing it as
  configuration — the same "an exemption hides a code path" failure an
  earlier cycle shipped once already. Query independently:
  `git check-attr guardrail-generated -- <path>`.

  ```gitattributes
  package-lock.json  guardrail-generated
  **/*.g.cs          guardrail-generated
  ```

  `git check-attr` always prints a line for a queried path, even one no
  `.gitattributes` pattern ever names — `unspecified`, not silence — the same
  as `guardrail-class`. Only `set` counts as generated; `unspecified` and an
  explicit `-guardrail-generated` (`unset`) both count as not-generated, the
  fail-safe direction, and the one a negative fixture proves.

  Reused deliberately, not GitHub's own `linguist-generated`: that attribute
  means something only where Linguist runs, a platform tool this toolkit does
  not control ([ADR-0002](../../ADR/0002-analysis-tool-distribution.md)'s own
  reasoning about depending on a host's behaviour rather than on `PATH` and
  declared attributes, applied here to a second host feature). A per-path git
  attribute this toolkit names itself works identically everywhere git runs.

  Do not hardcode a list of generated filenames in a check — `package-lock.json`
  today, `yarn.lock`, `Cargo.lock` and `packages.lock.json` tomorrow, and the
  next one after that. A bootstrap declares `guardrail-generated` for whatever
  its own stack actually generates, derived from the manifests and build
  configuration already present (a `package.json` implies a `package-lock.json`;
  a `.csproj` referencing a code generator implies its own `*.g.cs` pattern),
  never a fixed list carried from repository to repository.

- **Tooling is never deployed, and packaging excludes it by class.** Packaging
  and release select what ships by `guardrail-class` — the same declaration
  that already classifies the file for the gates — never a hand-maintained
  ignore list that drifts out of step with what the repository actually added.
  See [Deployment strategy](../deployment-strategy.md#packages-exclude-tooling-by-class)
  for where a package is assembled.
- **Tooling is excluded from coverage.** Coverage measures production code
  only; a repository's own gate scripts are not the code the floor protects,
  and counting them pressures the floor downward for a number that no longer
  means what it claims. See [Testing strategy](../testing-strategy.md#coverage)
  for the rule.
- **Tooling has no complexity or length band, and whether it should is an
  open decision, not a settled one.** The code that decides what merges is,
  by this omission, the least examined code in the repository — a gap an
  audit found real rather than a distortion of scope creeping in from
  elsewhere. [ADR-0008](../../ADR/0008-tooling-complexity-band.md) names the
  two ways to close it and is left `Proposed` on purpose: this is a standing
  policy decision for a human, not a default this standard or an
  implementer may pick unilaterally.
- **The class is per repository, not per filename.** In a repository that
  consumes this standard, gate scripts and other development automation are
  `tooling`: excluded from coverage, never deployed. In a repository whose
  _product_ is the tooling — a guardrails toolkit itself — those same scripts
  are `production`, and its own coverage floor rightly applies to them.
  `.gitattributes` already makes classification a per-repository declaration;
  this is that rule applied to one class, not new machinery.
- **Tooling lives in its own tracked directory, separate from application
  source, declared with its own `guardrail-class=tooling` pattern in
  `.gitattributes`.** The directory's name is the repository's own choice —
  this standard does not mandate one — but the separation must exist and be
  declared, so neither a human nor an agent mistakes a gate script for
  something that ships. The directory carries a `README.md` indexing every
  script — what it is for, and why it exists — complementing `/docs`, which
  describes the standards and processes rather than this repository's own
  implementations of them. Keep the `README.md` requirement; an earlier
  version of this checklist also required a directory-level agent
  instruction file unconditionally, and a bootstrapped repository complied
  by producing one whose entire content was "read the other file, I carry
  nothing of my own" — a file that adds a hop for the agent that already
  reads the root instruction file, and a second thing to keep in step with
  it, for no rule the directory actually needed. **A directory-level
  instruction file earns its place only when it carries rules specific to
  that directory** — a build quirk, a script's calling convention, anything
  the root file has no reason to state. Where nothing like that exists, the
  `README.md` alone is compliance; a pointer-only instruction file is a
  finding, not a second required artefact. This is a different question
  from [the canonical-file-and-pointers
  rule](agent-integration.md#the-root-instruction-file), which governs
  multiple _harnesses_ reading the same root-level content
  (`AGENTS.md`/`CLAUDE.md`/`GEMINI.md`) and where a pointer is the whole
  point — it says nothing about whether a _directory_ needs an instruction
  file at all, and does not license inventing one just to have one.

## Verification

- [ ] The class patterns are checked in, and two people reading them classify
      the same file the same way.
- [ ] A file matching two class patterns is reported as a defect, not resolved
      silently.
- [ ] A file matching none is treated as production.
- [ ] A test file and a production file of the same length receive different
      verdicts.
- [ ] A reference document that an agent loads has a skill definition beside it,
      rather than agent instructions in its body.
- [ ] A file classed `tooling` counts toward change size but is not held to a
      length limit.
- [ ] A file marked `guardrail-generated` in `.gitattributes` contributes zero
      to change size, and keeps its `guardrail-class` for every other check.
- [ ] A code-generated source file — `*.g.cs` is the worked example — is
      discounted on the same grounds as a lock file, whatever its
      `guardrail-class`.
- [ ] The same generated file is also exempt from the length limit — no
      regression on the rule that already exempted configuration and tooling.
- [ ] A hand-written configuration or tooling file of the same size still
      counts toward change size. The distinction is the `guardrail-generated`
      marker, not the file's name or extension.
- [ ] A path no `.gitattributes` pattern marks `guardrail-generated` is
      treated as not generated — the fail-safe direction — proved with a
      negative fixture, not assumed from the attribute's absence.
- [ ] A bootstrap declares `guardrail-generated` for the lock files and
      generated sources its own stack actually produces, derived from the
      manifests present rather than a fixed list carried from repository to
      repository.
- [ ] A file classed `tooling` is absent from a packaged or deployed
      artefact — checked by inspecting the artefact's contents, not the source
      tree.
- [ ] A file classed `tooling` does not appear in the coverage report — a
      `tooling`-classed file written in the product's own language, not only
      one lizard or the coverage tool happens to skip by extension or import
      scope, is proof: `scripts/check-tooling-class.mjs`'s own fixtures cover
      exactly this case (fix 45; audit 12 found the class-exclusion machinery
      had never been exercised against a real `tooling`-classed file).
- [ ] The same script is classed `tooling` in a repository that consumes this
      standard, and `production` in a repository whose product is the tooling
      itself.
- [ ] A repository that consumes this standard and carries ported gate or
      check scripts has at least one file classed `tooling` — a repository
      with such scripts and zero, checked by `scripts/check-tooling-class.mjs`
      (`checkToolingClassDeclared`), is the audit-12 defect: the rule stated
      above and nothing enforcing it.
- [ ] A check that decides what to scan or measure by file class does not
      substitute a file extension or language for it — an extension filter
      only accidentally excludes a `tooling`-classed file that happens to be
      written in a different language from the product; one in the same
      language passes straight through it.
- [ ] A `tooling` directory has a `README.md` indexing what each script is
      for and why it exists.
- [ ] A `tooling` directory's instruction file, where one exists, carries
      rules specific to that directory — a pointer-only file (its entire
      content pointing back to the root instruction file) is reported as a
      finding, not accepted as compliance.

## References

- [Thresholds](thresholds.md) — the limits each class is held to.
- [Gate 4 — Task completion](gate-4-task-completion.md) — where class decides
  push back versus warn.
- [Components](components.md) — the map these patterns are declared beside.
- [Deployment strategy](../deployment-strategy.md#packages-exclude-tooling-by-class) —
  where packaging reads the class.
- [Testing strategy](../testing-strategy.md#coverage) — where coverage reads
  the class.
- [Agent integration](agent-integration.md#the-root-instruction-file) — the
  canonical-file-and-pointers rule for multiple _harnesses_, a different
  question from whether a _directory_ needs an instruction file at all.
- [ADR-0005](../../ADR/0005-generated-files-discounted-from-change-size.md) —
  why a generated file is discounted rather than left counted with the
  `[large-pr]` override as its only remedy.
- [ADR-0008](../../ADR/0008-tooling-complexity-band.md) — the open decision
  on whether tooling gets its own complexity and length band.
