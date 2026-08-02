---
type: reference
summary: Slice 5 of the distributable-guardrails design — a script that drives the toolkit improvement loop's reset/launch/wait/capture/verify/hand-off cycle mechanically, runs implementer and auditor sessions in the devcontainer, and defines the artefact contract slice 6 reads.
read_when: Implementing or reviewing the harness, deciding whether a step belongs to the script or to a model, or reconciling slice 6's artefact requirements against what a round actually produces.
---

<!-- cspell:ignore opencode usec cgroup cgroups mjs headlessly -->

# Slice 5 — the harness

A script that runs one round of [the toolkit improvement
loop](../prompts/toolkit-improvement-loop.md) end to end for its mechanical
parts, so a round costs model tokens only where judgement is required. Scope
is fixed by [the overarching design](2026-08-01-distributable-guardrails-design.md);
anything not described there is out of scope here too.

## Scope and dependencies

This slice specifies a new script and its supporting layout, not a rework of
an existing one. It depends on nothing from slices 1–4's vocabulary — the
harness drives _bootstrapping a subject repository from the loop's fixed
prompt_, which is deliberately blind to capability ids, opt-out rows or the
bootstrap skill's internal decisions. Those are what the round is measuring,
not something the harness reads.

One boundary rule aside: **where `eval/` sits relative to `.guardrails/` is
slice 1's to decide**, and this slice takes its answer rather than asserting
one — see [The artefact contract](#the-artefact-contract).

It does invoke one script from slice 6 — `check-ledger.mjs`, as a precondition
of the round command — and reads nothing that script reads. That is a caller
relationship, not a shared vocabulary: the rule the check enforces is slice 6's,
and this slice supplies the one moment at which enforcing it means anything. See
[Preconditions](#preconditions-before-the-subject-is-touched).

It depends on:

| From                                                                                                                                                        | Used as                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| [The toolkit improvement loop](../prompts/toolkit-improvement-loop.md)                                                                                      | The round shape (reset, implement, read the verdict, audit, fix, repeat) and the three-signal hang rule this slice implements           |
| [The devcontainer](../../.devcontainer/README.md), [devcontainer.json](../../.devcontainer/devcontainer.json), [Dockerfile](../../.devcontainer/Dockerfile) | Where a role's session actually runs: the container image, the profile/build-arg toggles, `run-profile.sh`'s mount and teardown pattern |

## Division of labour

**The stated failure is a harness that needs a model to decide what to do
next at each step.** Every step below is scripted; none asks a model what to
do — a model's only inputs to a round are the two documents it writes before
the corresponding command runs.

| Step         | Owned by | What it does                                                                                                                                                                                |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reset**    | Script   | Delete-and-recreate the subject repository. No cleaning, ever                                                                                                                               |
| **Launch**   | Script   | Start an ephemeral container from a devcontainer profile, mount the subject and the toolkit, run the role's agent CLI headlessly against a prompt or brief file that already exists on disk |
| **Wait**     | Script   | Poll the three hang signals until the session exits, or until they are quiet for ten sustained minutes                                                                                      |
| **Capture**  | Script   | Write the session transcript, detect the pull request, poll CI to a conclusion, fetch the raw job log, run the subject's own gate 7 and keep its output verbatim                            |
| **Verify**   | Script   | Confirm the artefacts a round is supposed to produce actually exist and are non-empty — completeness, not compliance                                                                        |
| **Hand off** | Script   | Print the round id, the artefact root, and the next command — nothing here is invented, only assembled                                                                                      |

**Stays a model's job:**

- **Writing the implementer prompt's _values_** — the project name, the
  toolkit path, the CI platform, the operating systems. These are decided once
  per series by whoever is running it and stored in the harness's config, not
  re-derived by the script or asked for at each round.
- **Writing the audit brief** — the established facts, the priority questions,
  what would count as evidence either way. This is the loop's own adversarial
  judgement and nothing here templates it. The harness accepts a brief as an
  opaque file and launches the auditor against it; it never composes one.
- **Reading the auditor's report and writing the fix brief.** Both are
  judgement about the corpus, not about the round's mechanics, and the harness
  captures the auditor's output without interpreting it. **Writing** the fix
  brief stays outside; **capturing** the one that was dispatched does not — see
  [`fixer/brief.md`](#layout).
- **Deciding whether the round succeeded**, in the loop's sense — whether the
  prompt had to be tuned, whether a clarifying question should have been
  answered by the corpus. The harness can flag mechanical proxies (see
  [Verify](#verify) below) but never renders that verdict.

The fix agent's **execution** is out of scope for this slice: it changes the
toolkit repository, never the subject, and the loop keeps it in its own session.
Its dispatched brief is still copied into the round, because a finding citing a
brief that exists only in one session's history cannot be re-read by anyone
else. See [Decisions taken here](#decisions-taken-here).

## The round identifier

A round belongs to a **series** — one run of the loop against one unchanged
prompt. The prompt is the experiment's constant
([toolkit-improvement-loop.md](../prompts/toolkit-improvement-loop.md):
"change it only by deciding to start a new series"), so the series id is
derived from the prompt's own resolved text, not assigned by a human:

```text
seriesId = sha256(renderedPrompt)[0:12]      # first 12 hex chars
roundId  = "<seriesId>-<seq>"                # seq: zero-padded 3-digit, per series
```

`renderedPrompt` is the literal text sent to the implementer — the loop's
fixed template with this series' values substituted — not the template file,
because it is the sent text that must not drift; a template edit that
resolves to the same text is not a new series, and one that resolves
differently is, without anyone having to say so.

**Round discovery is a directory scan.** The next `seq` for a series is one
past the highest existing `eval/rounds/<seriesId>-*/` directory; there is no
separate counter file to fall out of sync with the directories it counts.

### A series never rotates silently

**Where `eval/rounds/` already holds rounds and none of them belongs to the
series this prompt renders to, the round command stops and reports the
rotation.** It does not start `-001` of a new series on its own.

```text
Prompt changed: rounds exist for series 4f2a9c1e0b7d; this prompt renders to
9b18c00a4e62. Every open finding was filed under the first, and a result from
the second is not comparable to it.

Re-run with --new-series to start one deliberately.
```

`--new-series` is the confirmation, and it is the only thing that starts one.
A repository with no rounds at all needs no flag: the first series is not a
rotation.

**This was left as a question and is now decided, because the two defaults
compose into a deadlock.** Auto-derivation looks harmless from here — the hash
changed, so it is a different experiment, and the loop's own text says as much.
From slice 6's side it is not: a one-character edit to the prompt template
strands every open finding with no result, and slice 6's rule that
[a round does not start while a previous round's fix has no Result](2026-08-01-distributable-guardrails-slice-6-tuning-skill.md#results)
then blocks every subsequent round. The two rules are each correct and together
they stop the loop. Refusing the rotation is the cheaper half to change: it
costs one flag, it is the failure direction the loop's "check the hash every
round" already implies, and it keeps the decision to abandon a series with the
person making it rather than with a typo.

## The artefact contract

**Root:** `eval/rounds/<round-id>/`, in the toolkit repository. `eval/` is new
in this slice and holds only the harness itself and the rounds it produces.

**Why `eval/` sits outside `.guardrails/`, argued rather than asserted.** Slice
1 defines `.guardrails/` as **what a consuming repository receives**, and names
the harness as one of three things in this repository that are
guardrail-adjacent and never received
([the carve-out](2026-08-01-distributable-guardrails-slice-1-foundations.md#what-guardrails-is-and-what-therefore-stays-out-of-it-here),
which also covers the two one-off `configure-*.mjs` setup scripts and slice 6's
ledger check). The harness qualifies on the definition without needing an
argument of its own: it runs the toolkit **against** a subject repository, and
a consumer _is_ a subject. Copying it would put an evaluation loop with no
rounds, no series and no subject into a repository that has nothing for it to
measure — and, concretely, would leave a `tooling`-classed script no gate there
invokes, which is a finding `check-script-wiring.mjs` raises in the consumer on
arrival.

Two consequences follow, and neither is a special case for this slice:
`eval/harness.mjs` is wired here as an on-demand script with its caller named —
a person, running a round — per slice 1's repo-local list, and nothing under
`eval/` is compared against the plugin reference by slice 4's drift check.

This is also the only place this slice touches slices 1–4 at all. It is a
boundary rule, not a vocabulary: the harness still reads no capability id and
no opt-out row.

**`eval/` is git-ignored below its own scripts and config**, the same
reasoning this repository's own `.gitignore` already states for `coverage/`
and `*.sarif`: _"Evidence the gates produce on every run. Published from CI,
never committed: a stale [artefact] in the tree is worse than none, because
it looks like a result."_ A round's log and job-log captures are exactly that
class of evidence. `eval/harness.mjs`, `eval/harness.config.json` and the
prompt template are tracked; `eval/rounds/` is not.

### Layout

```text
eval/
  harness.mjs                      the script
  harness.config.json              series-invariant values (see below)
  implementer-prompt.template.md   the loop's fixed template, placeholders unresolved
  rounds/
    <round-id>/
      manifest.json                the round's single index — see schema below
      implementer/
        prompt.md                  the rendered prompt actually sent
        log.txt                    full session transcript, appended live
        pr.json                    { number, url, branch, headSha } | null
        hang.json                  present only if this role hung
      ci/
        checks.json                gh's structured summary — cross-reference only, never authoritative
        run-<runId>-job-<jobId>.log   the raw job log, one per relevant job — the authoritative artefact
      auditor/
        brief.md                   the brief a model wrote, copied in verbatim for provenance
        log.txt
        report.md                  the auditor's own written report, if the role produces one as a file rather than only a transcript
        hang.json
      fixer/
        brief.md                   the fix brief dispatched after this round, copied in verbatim — see below
      subject-final/
        gate-7.log                 the subject's own on-demand gate, run by the harness — see below
        HEAD.txt                   the subject repository's final commit sha
        diff.patch                 the round's branch diffed against its pre-round base
```

**`fixer/brief.md` records what was dispatched, and nothing more.** Writing the
fix brief stays a model's job, outside this harness — that is unchanged. What
changes is that the brief a session was actually given is copied into the round
verbatim, the same way `auditor/brief.md` already is.

The reason is slice 6's, and it is the same reason `auditor/brief.md` exists: a
finding whose `Fix` field cites a brief that lives only in one session's history
cannot be re-read by anyone else, and slice 6's whole argument is that a claim
should be checkable. A citation pointing outside the round is not provenance.

It is written when the fix is dispatched, which is after the round's own roles
have finished. A round that never had a fix dispatched simply has no `fixer/`
directory, exactly as a role that never hung has no `hang.json`. This closes
**G18** in the design's gap register, and slice 6's R10.

**`subject-final/gate-7.log` is the round's named gate-output artefact.** After
the implementer exits and before the final snapshot, the harness runs the
subject's own `node .guardrails/gate-7-on-demand.mjs` in one more ephemeral
container and captures its stdout and stderr verbatim. Gate 7 sweeps the whole
tree and only reports, so it is the one gate whose output enumerates capability
state across the repository, in
[slice 1's line format](2026-08-01-distributable-guardrails-slice-1-foundations.md#output-format)
— every finding line carrying its capability id.

Without it, the only gate output a round holds is inside the implementer
transcript and the CI job log, neither named as gate output, and slice 6 ends up
parsing capability ids out of prose. That is its R7, and this is the whole close:
one command, one file, one manifest key.

Three properties, so the capture cannot quietly become a second audit:

- **Verbatim, never interpreted.** The harness runs the command and writes what
  came back. It does not read it, count it, or decide anything from it.
- **Best-effort, and named when it fails.** A subject with no
  `.guardrails/gate-7-on-demand.mjs` — a round whose implementer never got that
  far — records the capture as a failed `verify` check and the round continues.
  A missing capture and an empty one are different facts, which is R6.
- **It runs before `HEAD.txt` and `diff.patch` are taken**, so anything gate 7
  writes to the subject appears in the round's own diff rather than being
  invisible. If it writes at all, that is a finding about the gate.

### `manifest.json`

The one machine-readable index. Everything above is reachable from it by a
relative path; nothing above should ever need to be located by a consumer
guessing a filename.

**A manifest is frozen once its round reaches a terminal status.** The harness
writes and updates it throughout the round — that is what
`harnessHeartbeatAt` is for — but once `status` is `completed`, `hung`, `failed`
or `not-started`, no field is ever rewritten. A later round writes a new
manifest; it does not edit an old one.

This is what makes a citation worth anything. Slice 6 orders its findings by
what the manifest records, and a manifest that can be rewritten afterwards makes
every result citing it unverifiable — the reader cannot tell whether they are
looking at what the round produced or at what a later pass decided it should
have produced. This closes **G19** in the design's gap register, and slice 6's
R8.

**The freeze is on the manifest, not on the directory.** `fixer.briefPath` is
written at freeze time and names where a fix brief will be copied **if** one is
dispatched, the same way `hang.json` is a known path whose file exists only in
the case it describes. So `fixer/brief.md` appearing later rewrites no field: the
path was already recorded, and the manifest keeps its promise that nothing is
located by guessing a filename. A consumer that has read the manifest once never
has to re-read it to stay correct.

```json
{
  "roundId": "4f2a9c1e0b7d-014",
  "series": {
    "id": "4f2a9c1e0b7d",
    "promptPath": "eval/rounds/4f2a9c1e0b7d-014/implementer/prompt.md"
  },
  "toolkit": { "path": "...", "branch": "...", "headSha": "..." },
  "subject": { "path": "...", "remote": "...", "defaultBranch": "..." },
  "startedAt": "2026-08-01T09:00:00Z",
  "harnessHeartbeatAt": "2026-08-01T09:41:00Z",
  "preconditions": { "ledgerSettled": true, "overrides": [] },
  "roles": {
    "implementer": {
      "status": "completed | hung | failed | not-started",
      "container": "guardrails-round-4f2a9c1e0b7d-014-implementer",
      "startedAt": "...",
      "endedAt": "...",
      "logPath": "implementer/log.txt",
      "promptPath": "implementer/prompt.md",
      "pr": { "number": 42, "url": "...", "branch": "...", "headSha": "..." }
    },
    "auditor": {
      "status": "completed | hung | failed | not-started",
      "briefPath": "auditor/brief.md",
      "logPath": "auditor/log.txt",
      "reportPath": "auditor/report.md"
    }
  },
  "ci": {
    "runs": [
      {
        "runId": 123,
        "jobId": 456,
        "conclusion": "failure",
        "logPath": "ci/run-123-job-456.log"
      }
    ]
  },
  "gateOutput": [
    { "gate": "on-demand", "logPath": "subject-final/gate-7.log" }
  ],
  "fixer": { "briefPath": "fixer/brief.md" },
  "subjectFinal": {
    "headPath": "subject-final/HEAD.txt",
    "diffPath": "subject-final/diff.patch"
  },
  "verify": {
    "ranAt": "...",
    "checks": [{ "name": "implementer-log-nonempty", "pass": true }]
  }
}
```

**`harnessHeartbeatAt` is updated on every poll tick**, independent of
whether a role is hung. Its purpose is narrow: distinguish a role the harness
_declared_ hung (written `hang.json`, `status: "hung"`) from a harness process
that crashed or the host that lost power — both leave the manifest silent,
but only the second leaves the heartbeat stale with no hang recorded. Nothing
in this contract makes the harness fault-tolerant against its own crash; a
stale heartbeat with no hang verdict is the signal that a round needs to be
inspected and probably reset, not resumed.

**How slice 6 finds a round.** Enumerate `eval/rounds/*/manifest.json`,
newest `startedAt` first, or address one directly by `roundId`. Nothing about
this contract requires slice 6 to parse a log or a job-log itself for
anything the manifest already names — the manifest is written so a consumer
never has to guess a path.

### `harness.config.json`

The series-invariant values a human sets once, never re-derived:

```json
{
  "subject": { "path": "...", "remote": "..." },
  "toolkit": { "mountPath": "/workspaces/toolkit" },
  "profile": "standard",
  "promptValues": {
    "projectName": "...",
    "projectDescription": "...",
    "ciPlatform": "...",
    "registry": "...",
    "operatingSystems": "..."
  },
  "implementerAgent": "opencode",
  "auditorAgent": "opencode",
  "timeouts": { "hangMinutes": 10, "ciCaptureMinutes": 60 }
}
```

## Role execution in the container

**Each role invocation gets a fresh, ephemeral container** — never a reused
one, and never the same container across roles or rounds. It is created for
this invocation, from a `run-profile.sh`-style `docker run` against the
profile named in the config, and torn down (`docker rm -f`) once the role
exits or is declared hung. This is what isolates one round from the next and
one role from the other: no working directory, no shell history, no agent
session state survives from a previous invocation. Credentials still resolve
through the devcontainer's existing shared volumes
([devcontainer.json](../../.devcontainer/devcontainer.json)'s credential
mounts), so no login is repeated per round.

**Two mounts, not one:**

| Mount                  | Path                             | Mode       | Why                                                                               |
| ---------------------- | -------------------------------- | ---------- | --------------------------------------------------------------------------------- |
| The subject repository | Its own path, from config        | Read-write | What the role edits                                                               |
| The toolkit repository | `toolkit.mountPath`, from config | Read-only  | What the prompt names as "the guardrail standards, installed at \<toolkit path\>" |

The auditor gets the identical pair, both read-only — the loop's own brief
template already states this ("Read-only on both. Do not commit, push or
edit"), and the harness enforces the write half of that by mount permission
rather than trusting the session not to.

**How a role is launched:**

| Role        | Input file                                                                    | Command shape                                                                                                 |
| ----------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Implementer | `implementer/prompt.md` (rendered)                                            | The configured agent CLI, headless, given the prompt file's content, output streamed to `implementer/log.txt` |
| Auditor     | `auditor/brief.md` (model-authored, already on disk before this command runs) | Same shape, against the brief instead of the prompt, output to `auditor/log.txt`                              |

The two are the same primitive with a different input file — this is
deliberate: the harness does not need to know anything role-specific beyond
which file to feed the session and where the transcript goes.

## The round command

`eval/harness.mjs round` with no arguments is the one command the design's
own success criterion names:

```gherkin
Given a configured round
When the harness is run with no arguments
Then it resets the subject, runs the implementer, captures CI, and stops for the audit
```

### Preconditions, before the subject is touched

Two checks run first, and either stops the command before anything is reset.
They are preconditions rather than warnings because both describe a round whose
result could not be read afterwards, and a reset is unrecoverable:

| Precondition                                                             | Read from                                                                                                      | On failure                                                                                                        |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **No previous round's fix is still unmeasured**                          | `node .claude/skills/toolkit-tuning/check-ledger.mjs` — slice 6's own check, invoked rather than reimplemented | Stop, printing the check's own output. `--ignore-ledger` overrides, and the override is recorded in the manifest  |
| **The prompt still renders to the series the existing rounds belong to** | The round id derivation above                                                                                  | Stop, per [a series never rotates silently](#a-series-never-rotates-silently). `--new-series` is the confirmation |

**The first is what makes slice 6's ordering rule real.** Slice 6 states that
_a round does not start while a previous round's fix has no Result_, and calls
it structurally impossible rather than discouraged — but the check that would
know is wired at **this repository's gate 7**, which fires on a commit, not
before a round. Nothing consulted the ledger at the one moment the rule is
about. This is that moment. The check is still slice 6's and is run here: two
callers of one script, not two implementations of one rule, and the harness
reads no finding file itself.

`--ignore-ledger` exists because a harness that refuses to run while the ledger
is imperfect is a harness people route around by deleting findings. Recording
the override in the manifest is what keeps it visible: the round runs, and its
own record says the rule was overridden for it.

Concretely, in order: check the two preconditions; **reset** the subject;
**render** the prompt from the template and this series' values, fixing the
round id; **launch** the implementer; **wait** through the hang detector until
it exits or is declared hung; if it exited, **capture** the pull request it
opened and poll CI to a conclusion, fetching the raw job log, then run the
subject's own gate 7 and snapshot the subject; **verify** artefact
completeness; **hand off** — print the round id, the artefact root, and:

```text
Round 4f2a9c1e0b7d-014 ready for audit.
Write a brief, then run:
  node eval/harness.mjs run-role auditor --round 4f2a9c1e0b7d-014 --brief <path>
```

**The round command never launches the auditor.** That is a second,
separate invocation of the same `run-role` primitive, made once a model has
written the brief — the design's own "stops for the audit" is not a pause
inside one command, it is where the command's own responsibility ends.

## Hang detection

**Three signals, all of them, sustained past ten minutes** — exactly [the
loop's own rule](../prompts/toolkit-improvement-loop.md#watching-an-unattended-run).
Two of three is not enough: a bulk write reads idle on CPU and quiet on the
log while changing every file it touches, and it is the file signal alone
that tells that state apart from a genuine hang.

### Sampling

The harness polls every **60 seconds**. Each tick:

| Signal        | How it is read                                                                                                                                                              | Idle when                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Log written   | Byte size of the role's `log.txt`, compared to the value recorded at the previous tick                                                                                      | No growth since last tick           |
| Files changed | `find <subject-mount-path> -type f -newer <marker touched at previous tick>` on the host, since the subject is bind-mounted and directly readable                           | Zero matches                        |
| CPU rate      | The container's cgroup `cpu.stat` `usage_usec`, read twice **15 seconds apart** inside this tick via `docker exec`; the delta, in seconds, is the rate for that 15 s window | ≤ 0.5 s consumed in the 15 s window |

**CPU is read as a rate, never cumulatively**, per the loop's own
distinction — two `usage_usec` reads 15 seconds apart and their difference,
not the running total the container has ever spent. A working process reads
2–4 s per 15 s window; a hung one reads 0.1–0.5 s. The harness treats
anything at or below 0.5 s as idle for that tick and anything above as busy;
see [What will settle by measurement](#what-will-settle-by-measurement) on the
unclassified band between the two bands the loop's own text gives.

### The sustained window

- If **all three** signals are idle on a tick and no quiet window is open,
  open one, timestamped now.
- If **any** signal is not idle, close the window (reset to unset),
  whether or not one was open.
- If a window has been open, uninterrupted, for **ten minutes**, declare the
  role hung.

This is why a healthy but momentarily quiet tick never trips the detector:
one idle tick alone does nothing, and any single active tick before the
ten-minute mark discards the whole window rather than merely pausing it —
the window has to be quiet on every tick across the full ten minutes, not on
average.

### What happens when a role is declared hung

The harness stops the container (`docker stop` with a grace period, then
`docker rm -f`), writes `hang.json` — the timestamp the window opened, the
timestamp it fired, and every sample taken inside the window — sets that
role's manifest status to `"hung"`, and **stops the round there**. It does
not retry, and it does not continue to CI capture on a role that never
produced a pull request. This is the "reports the run as hung and does not
silently continue" half of the design's own criterion.

```gherkin
Given an implementer that has stopped writing output
When ten minutes pass with no file writes and CPU at the idle floor
Then the harness reports the run as hung and does not silently continue

Given an implementer mid-way through writing 158 generated files
When the CPU rate is at the idle floor for two consecutive ticks
Then the harness does not declare a hang, because the files-changed signal is not idle
```

### Why this avoids both failure directions

| Failure direction       | What causes it, if it happens                                                                                                  | What in this design prevents it                                                                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kills a healthy run** | Judging on CPU or log silence alone; a single quiet sample; cumulative CPU misread as instantaneous                            | All three signals required, every tick, for the full ten minutes; CPU sampled as a 15 s rate, not a running total; the earlier real incident (this exact corpus, two-of-three, a healthy run killed) is the grounding for requiring three                                                 |
| **Never fires**         | A threshold nobody enforces without a human watching; a poll that stops when the session looks busy once and is never re-armed | The poll runs unconditionally for the container's lifetime, independent of any human; the window is re-opened on the very next idle tick rather than requiring a human to notice it should restart; the ten-minute threshold is a fixed number, not a judgement call made fresh each time |

## Verify

Mechanical completeness, never compliance — the auditor judges compliance,
this only confirms the round produced what it claims to have produced:

| Check                                                    | Fails when                                                                                                                                      |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `implementer/log.txt` exists and is non-empty            | The launch never wrote anything                                                                                                                 |
| `implementer/pr.json` is non-null if `status: completed` | The session exited without opening a pull request                                                                                               |
| Every `ci/run-*.log` file is non-empty                   | A conclusion was recorded but the raw log fetch produced nothing — never substitute the `checks.json` summary for a missing log                 |
| `subject-final/gate-7.log` exists and is non-empty       | The subject had no gate 7 entry point to run, or running it produced nothing. Named, not silent — this is the round's only gate-output artefact |
| `manifest.json` parses and every path it names exists    | A partial write left the index pointing at nothing                                                                                              |

A failing check sets the round's overall status to `"incomplete"` in the
manifest rather than `"ready-for-audit"` — hand-off still happens (the round
id and path are still printed), but the message names which check failed
instead of inviting an audit brief for a round that has nothing to audit.

## Failure modes, by mechanism

| Mechanism | Failure                                                              | What the harness does                                                                                                                                                                                                                                                                       |
| --------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reset     | Deletion or recreation fails (remote unreachable, permissions)       | Aborts before launching anything; nothing runs against a subject that was not actually reset                                                                                                                                                                                                |
| Launch    | Container fails to start, or the agent CLI reports not authenticated | Aborts that role, records `status: "failed"` with the captured stderr, never retries silently                                                                                                                                                                                               |
| Wait      | Hang declared                                                        | See [Hang detection](#hang-detection) above                                                                                                                                                                                                                                                 |
| Capture   | `gh` unauthenticated, PR not found, or CI genuinely still running    | CI polling has its own, longer timeout (`timeouts.ciCaptureMinutes`, default 60) separate from the ten-minute hang rule, because CI legitimately takes longer than an idle session does; a `gh` command failure aborts capture and records `ci` as incomplete rather than fabricating a log |
| Verify    | An expected artefact is missing or empty                             | Recorded as a failing check; overall status `"incomplete"`, never silently marked ready                                                                                                                                                                                                     |

## Success and failure criteria

1. **A round runs end to end from one command with no model input beyond
   config.** `eval/harness.mjs round` with a valid `harness.config.json`
   produces a `manifest.json` whose `implementer` role reaches `completed`,
   `hung` or `failed` with no human intervention.
2. **A round's artefacts are locatable by round id alone.** Given only a
   round id, every artefact this contract names is reachable by following
   `manifest.json`'s own paths — no filename guessing.
3. **The hang detector fires on a genuine hang and not on a bulk write.**
   Demonstrated against two fixtures: a process that sleeps with no file or
   CPU activity for eleven minutes (fires), and a process that writes many
   small files with near-idle CPU throughout (does not fire, because the
   files-changed signal stays active).
4. **CI is captured from the raw job log, never the annotations endpoint.**
   `ci/run-*.log` is fetched via a job-log command (for example, `gh run view
<id> --log` or the equivalent `gh api .../logs`), and `checks.json` — the
   capped, summary view — is present only as cross-reference, never the sole
   source a later step reads.
5. **The round command never launches the auditor.** Its own transcript
   ends at hand-off; the auditor artefacts are absent (`status:
"not-started"`) until a separate `run-role auditor` invocation runs.
6. **A model's only two inputs to a full round are the prompt's _values_
   (set once, in config) and the audit brief (written per round).** No other
   step in a round's transcript requires a model's judgement about what to
   do next.
7. **A changed prompt never starts a series by itself.** Against a fixture
   holding rounds of one series and a prompt rendering to another, `round`
   exits without resetting the subject and names both series ids; the same
   invocation with `--new-series` proceeds.
8. **An unsettled ledger stops a round before the reset.** Against a fixture
   ledger carrying a `Fix` with no `Result` and a later manifest present,
   `round` exits with `check-ledger.mjs`'s own output and the subject's `HEAD`
   is unchanged; `--ignore-ledger` proceeds and the manifest records that it
   was used.
9. **Gate output is a named artefact.** `manifest.json`'s `gateOutput` names
   `subject-final/gate-7.log`, and that file carries result lines in slice 1's
   format — so a consumer reads a capability id from a named capture rather
   than from a transcript.

**Failure.** A harness that pauses mid-round to ask what to do. A round
whose artefacts a consumer has to search the filesystem for. A hang detector
that fires on the two-signal case this series already got wrong once, or one
that a human still has to babysit past the ten-minute mark to actually stop.
CI captured from a summary endpoint. An implementer prompt whose values are
re-derived or asked for at each round rather than fixed once.

## Indicative behaviour

Illustrative of the required behaviour, not a test plan.

```gherkin
Given a completed round
When slice 6's tuning skill looks for its artefacts
Then it finds implementer log, audit report, CI logs and final repository
  state at paths named in that round's own manifest.json

Given a round whose implementer session hung
When the harness declares the hang
Then the round's manifest records status "hung" and no CI capture is attempted

Given two rounds run against an unedited prompt file
When the harness computes each round's series id
Then both resolve to the same series id and increment the same sequence

Given a prompt template edited to fix a placeholder typo, resolving to different rendered text
When the next round runs
Then it stops without resetting the subject, names the series the existing
  rounds belong to and the one this prompt renders to, and starts neither until
  --new-series says so

Given a finding file carrying a Fix with no Result, and a later round's manifest
When the round command runs
Then it stops before the reset, printing check-ledger.mjs's own output
```

## Out of scope

- The fix agent's own execution — it changes the toolkit, never the subject,
  and is not part of any round's artefact set this slice defines.
- Judging a round's outcome — whether the prompt needed tuning, whether a
  clarifying question was one the corpus should have answered. That is the
  coordinator's read of the artefacts this slice produces, not a verdict the
  harness renders.
- The nine gates, capabilities, opt-out register, bootstrap or audit skills —
  slices 1–4. The harness runs against whatever those slices produce; it does
  not implement or verify them itself.
- Multi-repository or organisation-wide rollout of the harness itself.

## Decisions taken here

Nothing in this slice is open.

The question that stood fifth here — **where the rendered prompt's hash is
checked against drift** — is decided, because leaving auto-derivation as the
default composed with slice 6's settle-before-next-round rule into a deadlock
neither slice could see alone. The harness now refuses the rotation and takes
`--new-series` as the confirmation; see
[a series never rotates silently](#a-series-never-rotates-silently).

**Which agent CLI plays each role** is a config value, and its default is the
CLI the loop currently drives. The devcontainer carries three (Claude Code,
OpenCode, `agy`), and fixing one into the harness was rejected: the harness must
not need changing to test a different CLI's hook parity, which is a large part
of what the loop is for. Recording the default explicitly matters because the
twenty-six hand-run rounds' three session-boundary hangs were specifically
OpenCode's — a result that is only interpretable if the CLI in play is known.

**Reset recreates content and re-applies host-side settings** — branch
protection, required status checks, secrets — every round. The cheaper reading,
that "delete and recreate" means content only and protection persists, was
rejected: slice 3's "a required check only after it has passed once" rule is
part of what each round tests, so carrying protection over from a previous round
would prove it against stale state. This costs real round time and buys a result
that means what it says.

**`eval/rounds/` stays git-ignored.** A stale capture in the tree looks like a
result, which is the failure this avoids. Committing a round that becomes the
subject of a fix was rejected as a second mechanism: slice 6 already requires the
decisive lines to be copied verbatim into the ledger finding, with `runId` and
`jobId` beside them, which is what makes the record self-contained without
tracking the artefacts themselves.

## What will settle by measurement

These are not open questions. Each has a working answer and a stated trigger;
none blocks implementation. Both are tuning knobs, and the honest position is
that they were chosen rather than measured.

**The CPU band between 0.5 s and 2 s per 15 s window is unclassified by the
loop's own text**, which gives only the two extremes. Anything above 0.5 s
counts as busy — the safer direction, since a false hang costs a round.
_Trigger: a series of real rounds showing it calls a slow-but-working process
idle, or the reverse._

**The 60-second poll interval and 15-second CPU-sampling window** are sized to
fit ten minutes into roughly ten ticks with headroom, not taken from the loop
document. _Trigger: the first few real rounds showing them too coarse or too
fine._

## References

- [Distributable guardrails — overarching design](2026-08-01-distributable-guardrails-design.md) —
  the six slices and the decisions this one is bound by.
- [Slice 1 — Foundations](2026-08-01-distributable-guardrails-slice-1-foundations.md) — the definition
  of `.guardrails/` this slice's `eval/` boundary argument rests on, and the
  repo-local wiring list `eval/harness.mjs` is declared in.
- [The toolkit improvement loop](../prompts/toolkit-improvement-loop.md) —
  the round shape, the three-signal hang rule, and the two failure conditions
  a round is measured against.
- [The devcontainer](../../.devcontainer/README.md) — the container image,
  profiles and toggles a role's session runs inside.
- `.devcontainer/run-profile.sh` — the mount, credential-volume and teardown
  pattern this slice's ephemeral per-role container reuses.
- [Cross-gate rules: never claim more than was checked](../standards/guardrails/cross-gate-rules.md#never-claim-more-than-was-checked) —
  fix 64, the annotations-endpoint truncation this slice's CI capture step is
  built to avoid.
