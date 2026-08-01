---
type: reference
summary: User journeys are declared in the spec, and the end-to-end test for each is written failing when implementation starts and green when it completes.
read_when: Implementing slice 7, or deciding whether a spec has been broken down far enough to build.
---

# Slice 7 — User journeys declared, and bracketed by a failing test

Part of the [distributable guardrails design](2026-08-01-distributable-guardrails-design.md).
Scope is corpus only: changes to
[testing-strategy](../standards/testing-strategy.md) and the checks that read it.
The skill that helps a planning session produce journeys is a separate design.

## The gap

`testing-strategy.md` already requires the test:

> **End-to-end** — a user journey through public interfaces only.
>
> Written **behaviour-first**, in the given–when–then shape, and named for the
> journey rather than the endpoint. **At least one per user journey.**

Nothing says where the list of journeys comes from. "Every user journey has a
test" is satisfied by whichever journeys someone chose to name, so it cannot fail
— the same shape as a coverage figure on code nobody runs.

Two changes close it.

## Change 1 — journeys are declared in the spec

A spec names its user journeys before implementation starts. That turns "every
journey" into a finite list a reviewer can count against, and makes an undeclared
journey a defect in the spec rather than an omission nobody can see.

### What counts as declared

A journey is one given–when–then a failing test could be written against
tomorrow. It names who acts, what they do, and what is then observably true —
including what must **not** be true, which is where most under-specification
hides.

Worked example, a command-line tool that prints a greeting:

```gherkin
Given a user wants a general greeting
When they invoke the application without any arguments
Then the application responds with `Hello, world!`
And no application version
And no help text

Given a user has a particular person they want to greet, named `Sally`
When they invoke the application passing that name
Then the application responds with `Hello, Sally!`
And no application version
And no help text

Given a user doesn't know the syntax for the greet app
When they invoke the application with `--help` or `/?`
Then the application responds with the application version
And help text describing how to invoke the application correctly
```

Three properties make these declarations rather than aspirations: each names an
invocation, each names exact expected output, and each states negative assertions.
`And no help text` is what stops the first journey passing against an
implementation that prints everything.

### What a journey covers at larger scope

A journey is a user's path through public interfaces, and for anything beyond a
command-line tool that includes the operational surface:

- **Logging and monitoring are configured as the policy requires** — not that a
  log line exists, but that the journey's own actions are observable the way
  [logging and diagnostics](../standards/logging-diagnostics.md) requires.
- **Infrastructure is deployed and healthy** — resources exist, health checks
  pass, and the journey runs against them rather than against a substitute.

A journey that exercises the product but not its operability is a partial
journey, and the part it omits is the part that fails in production.

### Granularity follows scope

Each level of specification declares journeys at its own granularity. A design
covering several slices declares journeys that cross them; a slice declares
journeys within its own boundary. The same rule applies at each level — the test
must be writable — and what changes is what counts as one journey.

### Dependencies between specs are declared

Where one spec's journey depends on another spec delivering something, the
dependency is named in both. Two plans that each build the same thing because
neither knew the other would is the failure this prevents, and it is only visible
when the journeys are written down.

## Change 2 — the test brackets the delivery

**The end-to-end test for each declared journey is written when implementation
starts, and it fails.** It is green when the plan delivering the spec is
complete. Nothing else marks the plan done.

That bracket is what makes the journey load-bearing rather than decorative:

- A test written first and failing proves it _can_ fail, which a test written
  afterwards against working code does not.
- A plan cannot be declared complete while a journey it promised is unproven.
- The intermediate work — unit tests, integration tests — is driven by making the
  end-to-end test pass, in the shape
  [testing-strategy](../standards/testing-strategy.md) already sets out.

The unit and integration layers are unchanged by this slice. What changes is that
they now have a destination: they exist to turn a failing journey green, rather
than to raise a coverage figure.

## The decomposition heuristic

**The scope of work required to make one journey's test pass indicates whether the
spec needs breaking down.** A journey whose test cannot plausibly be made to pass
in one plan is a journey spanning several pieces of work, and the spec describing
it is too large.

This is a better test than judging a spec's size directly, because it is answered
by attempting something concrete rather than by estimating. It is the same
judgement that split the distributable-guardrails design into slices.

## Success

- A spec that declares no journeys is a finding.
- A declared journey with no end-to-end test is a finding once implementation has
  started.
- Each end-to-end test failed at least once, before the code it exercises existed.
- A plan is not complete while a journey's test is red.
- A journey's dependencies on other specs are named in both.

## Failure

- Journeys declared so loosely that no test follows from them — "the user can
  manage their account".
- Journeys written after implementation, matching what was built rather than what
  was promised.
- An end-to-end test that has only ever passed.
- A spec whose journeys are each too large to deliver, with no decomposition.
- Journeys covering the product but not the logging, monitoring or infrastructure
  the same journey depends on.

## Indicative behaviour

```gherkin
Given a spec declaring three user journeys
When implementation starts
Then three end-to-end tests exist and all three fail

Given a plan delivering that spec
When every task in it is complete
Then all three end-to-end tests pass

Given a spec that declares no user journeys
When it is reviewed
Then that is a finding against the spec, not against the implementation

Given a journey whose test would take several plans to make pass
When the spec is reviewed
Then the spec is decomposed and each piece declares its own journeys
```

## Questions

1. **Where journeys are declared within a spec** — a required section, or
   frontmatter a checker can read? A section is easier to write and harder to
   parse; frontmatter is the reverse. The corpus's derive-don't-type principle
   favours something machine-readable, but a journey is prose by nature.
2. **What enforces "the test failed first".** A test that has only ever passed is
   indistinguishable from one written afterwards, unless the failing run is
   evidenced. Git history shows the test predating the implementation, which is
   close but not the same claim.
3. **Whether this applies to a spec that delivers no user-facing behaviour** — a
   refactor, a corpus change like this one. Slices 1 to 6 declare no journeys;
   the cross-slice journeys in the design document arguably serve that purpose,
   which suggests the rule attaches to the design rather than to every spec.
4. **Whether an existing repository adopting the guardrails must retrofit
   journeys** for behaviour already built, or only declare them for new work.
   Retrofitting is the honest reading and the expensive one.

## References

- [Testing strategy](../standards/testing-strategy.md) — the six kinds of test,
  and the end-to-end rule this slice completes
- [Logging and diagnostics](../standards/logging-diagnostics.md) — what a
  journey's operational assertions are held to
