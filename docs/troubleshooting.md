---
type: reference
summary: Symptoms seen in this toolkit and what actually fixed them — read before debugging something that looks familiar.
read_when: A gate, hook or check is behaving unexpectedly, or a fix you are about to attempt might already have been tried.
---

<!-- cspell:ignore lizard opencode PYTHONUTF -->

# Troubleshooting

Read this before debugging. Each row is a symptom someone has already spent time
on, the evidence that identified it, and what did or did not fix it.

**This is not a register.** It has no gate, no approver and no removal condition,
because nothing here is an accepted exception — it is what was learnt. Rows stay
after they are fixed: the value is that the next person recognises the symptom,
not that the list stays short.

**Add a row when a symptom cost more than a few minutes to identify.** A fix that
was obvious does not need recording. One that sent someone down a wrong path does,
and the wrong path is worth naming — a row that only records the answer leaves the
next person to rule out the same things.

## Environment and tooling

| Symptom                                                                | Evidence that identified it                                          | Fix                                                                                                                                | Held? |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Tests covering SAST or complexity report as skipped, suite still green | `gate 7: SKIP … semgrep not on PATH`                                 | Prepend the Python user-scripts directory to `PATH`; `semgrep` and `lizard` are pip-installed and resolved from `PATH` by design   | yes   |
| `osv-scanner` never runs locally, CVEs appear only in CI               | `gate 5: SKIP cross-stack dependency scan — osv-scanner not on PATH` | It is a Go binary, not pip. `go install github.com/google/osv-scanner/cmd/osv-scanner@latest`, matching what CI installs           | yes   |
| A tool works in CI and appears broken in the devcontainer              | `bash -lc` reported the binary missing; plain `bash -c` found it     | `/etc/profile` resets `PATH` for login shells. `devcontainer up` and `docker exec` use non-login shells — test the way they invoke | yes   |
| Hooks fail after moving or removing a git worktree                     | Hook output naming a path that no longer exists                      | Shared hooks record the installing worktree's absolute path. Repoint before moving, not after                                      | yes   |
| cspell fails on tokens nobody wrote                                    | The unknown token matches part of the worktree directory name        | Name worktrees with dictionary words. Fixtures pick up the directory name                                                          | yes   |

## Gates and checks behaving unexpectedly

| Symptom                                                            | Evidence that identified it                                                                               | Fix                                                                                                                    | Held? |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----- |
| A check passes locally and fails only in a real `pull_request` job | The failing test builds a scratch repository; CI sets `GITHUB_HEAD_REF` and it leaked into the subprocess | Spawned-subprocess tests use an allow-list environment. A deny-list misses the next variable nobody anticipated        | yes   |
| A structural check reports nothing, everywhere                     | `gate 4: SKIP … origin/HEAD could not be resolved` in CI, and unset locally                               | `actions/checkout` sets no `origin/HEAD`. Pass the already-resolved base to a spawned check rather than re-deriving it | yes   |
| A link to a heading containing an em dash is rejected as broken    | The cited anchor matched GitHub's own slug; the checker's did not                                         | Slugs convert each space separately. Collapsing whitespace runs merges the two hyphens an em dash leaves               | yes   |
| A checker reports clean on documents it never examined             | The file count did not change after seven files were added                                                | `check-links.mjs` reads tracked files. Stage a document before trusting a result about it                              | yes   |
| `lizard` reports one function of implausible length                | The reported span covered ~64 separate `test()` blocks                                                    | Span-merge artefact in some JavaScript files. Verify against the source before acting; splitting the file resolves it  | yes   |
| A check is exempted in every repository it was meant to protect    | The exemption keyed on a signal a correctly-configured consumer also has                                  | Key an exemption on something only the exempt repository can have — and test the non-exempt direction                  | yes   |

## Measurement and reporting

| Symptom                                                            | Evidence that identified it                                                                                      | Fix                                                                                              | Held? |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----- |
| A CI finding count is lower than the job actually produced         | The job log held 16 findings where the API returned 10                                                           | The check-runs annotations endpoint caps at 10 and truncates silently. Read the raw job log      | yes   |
| A line count is consistently short                                 | `git grep -c ''` and a raw array count agreed with each other and not with the reported figure                   | PowerShell's `Measure-Object -Line` does not count blank lines. Cross-check with a second method | yes   |
| Change size counts a renamed file as production whatever its class | `--numstat` column three reads `{old => new}/path` under rename detection, so `check-attr` returns `unspecified` | Use `git diff -z --numstat`                                                                      | yes   |

## Unattended runs

| Symptom                                                           | Evidence that identified it                                             | Fix                                                                                                                        | Held?  |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------ |
| An agent session stops producing output with no error and no exit | Log frozen, no file writes, CPU at 0.1–0.5 s per 15 s sampled as a rate | Terminate and restart. Sample CPU as a rate — cumulative CPU cannot distinguish a busy process from one that has been busy | partly |
| A healthy run looks identical to a hung one                       | The file count moved while CPU sat at the idle floor                    | Bulk file writes block on I/O. Require all three signals — log, files, CPU — sustained past ten minutes                    | yes    |

The first row reads _partly_: restarting recovers the round, and the underlying
cause is not identified. Three of the observed stops occurred at a session
boundary, which is a pattern rather than a diagnosis.

## References

- [Registers](standards/guardrails/registers.md) — the enforced records this file
  is deliberately not one of
- [Documentation style](standards/docs-style.md) — why a standard states the
  current rule while this file records history
