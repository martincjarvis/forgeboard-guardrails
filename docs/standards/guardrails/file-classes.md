---
type: reference
summary: The five file classes several checks vary their verdict by — production, configuration, test, documentation and agent context — and the rules for classifying a file.
read_when: Declaring class patterns for a repository, or working out why two files of the same length got different verdicts.
---

# File classes

Several checks treat a file differently according to what kind of file it is.
The classification is therefore load-bearing, and it is declared, not inferred
from a hunch about the path.

| Class         | Is                                                           | Counted in change size | Length limit          | Warn band     |
| ------------- | ------------------------------------------------------------ | ---------------------- | --------------------- | ------------- |
| Production    | Code that ships or runs in the product                       | Yes                    | File length           | **Push back** |
| Configuration | Build, dependency, pipeline and infrastructure definitions   | Yes                    | None                  | n/a           |
| Test          | Code that exists to exercise production code                 | No                     | File length           | Warn          |
| Documentation | Prose for humans                                             | No                     | None                  | n/a           |
| Agent context | Prose an agent loads as context, including skill definitions | No                     | Agent-document limits | Warn          |

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

- **Configuration counts toward change size but has no length limit.** A
  generated lock file or a long infrastructure definition is not a design smell;
  a 900-line change to how the system is built still needs a human to look at it.

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

## References

- [Thresholds](thresholds.md) — the limits each class is held to.
- [Gate 4 — Task completion](gate-4-task-completion.md) — where class decides
  push back versus warn.
- [Components](components.md) — the map these patterns are declared beside.
