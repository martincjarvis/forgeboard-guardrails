---
type: reference
summary: No silent retries; a known-flaky test is quarantined explicitly, with an owner and an expiry, and still runs while it does not block.
read_when: A test fails intermittently, or deciding between a retry and a quarantine.
---

# Flaky tests

A test that fails intermittently is worse than a missing test: it teaches the
team that a red gate might mean nothing, and that lesson generalises to the
gates that were telling the truth.

| Rule                        | Detail                                                                            |
| --------------------------- | --------------------------------------------------------------------------------- |
| No silent retries           | A gate must not re-run a failing test and report the second result                |
| Quarantine is explicit      | A known-flaky test is listed, with an owner, a cause or hypothesis, and an expiry |
| Quarantined tests still run | They report their result; they do not block                                       |
| Expiry blocks               | Past its expiry, the quarantine entry itself fails the gate                       |
| Quarantine is registered    | The same register, the same columns, the same human approver as any suppression   |

**Retries and quarantine are not alternatives.** A retry hides the flake and
keeps the coverage; a quarantine surfaces it and loses the coverage until it is
fixed. The second is honest, which is why it is the one with an expiry attached.

**A newly flaky test is a defect report about the system**, not about the test,
until someone shows otherwise. Intermittency usually means real non-determinism
— an unsynchronised wait, a shared fixture, an ordering assumption — and the
test found it.

## Running it by hand

| Purpose                           | Node                                              | .NET                                                         |
| --------------------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| Repeat one test to expose a flake | `npx vitest run -t '<name>' --repeat 20`          | `dotnet test --filter 'FullyQualifiedName~<name>'` in a loop |
| Randomise order                   | `npx vitest run --sequence.shuffle`               | Configure the runner's ordering, or shuffle the filter       |
| Confirm no retry is configured    | `git grep -nE 'retries\|retryCount\|--rerun'`     | Same, over the test configuration                            |
| Find expired quarantines          | Compare each register expiry against today's date | Same                                                         |

The repeat run is the one that settles the argument: a test that passes twenty
times in a row under a shuffled order is not the flake, and the search moves to
the fixture it shares with something else.

## Verification

- [ ] No gate retries a failing test automatically.
- [ ] A quarantined test still runs and still reports its result; it only stops
      blocking.
- [ ] Every quarantined test has an owner and an expiry.
- [ ] An expired quarantine fails the gate.
- [ ] The quarantine list is registered and human-approved, not a code comment.

## References

- [Registers](registers.md) — the quarantine register's columns.
- [Gate 5 — Push](gate-5-push.md) — where the slower tiers run.
- [Thresholds](thresholds.md) — the default quarantine expiry.
