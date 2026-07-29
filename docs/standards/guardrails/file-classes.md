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
  limit.** A generated lock file or a long infrastructure definition is not a
  design smell; the same holds for a long gate script — a 900-line change to
  how the system is built, or to how the repository checks itself, still needs
  a human to look at it.
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
  something that ships. The directory carries a `README.md` for humans, and an
  agent-facing instruction file following
  [the canonical-file-and-pointers rule](agent-integration.md#the-root-instruction-file)
  rather than a second convention invented locally. Both index every script —
  what it is for, and why it exists — and complement `/docs`, which describes
  the standards and processes rather than this repository's own
  implementations of them.

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
- [ ] A file classed `tooling` is absent from a packaged or deployed
      artefact — checked by inspecting the artefact's contents, not the source
      tree.
- [ ] A file classed `tooling` does not appear in the coverage report.
- [ ] The same script is classed `tooling` in a repository that consumes this
      standard, and `production` in a repository whose product is the tooling
      itself.
- [ ] A `tooling` directory has a `README.md` and exactly one canonical
      agent-facing instruction file, with every other harness's file in it a
      thin pointer.

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
  canonical-file-and-pointers rule a tooling directory's index follows.
