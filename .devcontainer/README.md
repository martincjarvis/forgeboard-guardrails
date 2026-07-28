# MCPEval devcontainer

A reusable devcontainer with Claude Code, OpenCode, and `agy` (Antigravity CLI)
pre-installed alongside the project's adopted tool stack. See
`docs/multi-agent-devcontainer-plan.md` and
`docs/superpowers/plans/2026-07-24-experiment-12-devcontainer-base-image.md` for the
full design history; this file is the practical "how do I actually use it" reference.

## What's installed

| Item | Kind | Toggle |
|---|---|---|
| Claude Code | Agent CLI | Multi-stage target (`with-claude` and later) |
| OpenCode | Agent CLI | Multi-stage target (`with-opencode` and later) |
| `agy` (Antigravity CLI) | Agent CLI | Multi-stage target (`with-agy`/`full`) |
| QMD | Doc search | Always on (`core` stage, not `ARG`-gated) |
| RTK | Output compression CLI | Base install always on; per-agent hook registration gated by `INSTALL_RTK_WIRING` |
| Graphify | Codebase knowledge graph | Always on (`core` stage) |
| semgrep | SAST scanning | Always on (`core` stage) |
| lizard | Code metrics/complexity | Always on (`core` stage) |
| context-mode | Session memory across compaction | npm install + Claude Code wiring always on; OpenCode/agy registration gated by `INSTALL_CONTEXT_MODE_WIRING` |
| claude-mem | Cross-session memory | `INSTALL_CLAUDE_MEM` |
| ponytail | Over-engineering guard | `INSTALL_PONYTAIL` |
| superpowers | Planning/review skill pipeline | `INSTALL_SUPERPOWERS` |

The `ARG`-gated rows only apply within the `full` stage (see "Lighter variants" below
for the coarser agent-count toggle). For a no-rebuild-needed, per-invocation toggle
instead, see `.devcontainer/toggle-skills.sh` — its Claude Code and `agy` modes work
for any installed plugin by name (ponytail, claude-mem, superpowers, ...); its OpenCode
mode currently only has a convenience shorthand for superpowers' skill names (passing
any other plugin's skill names directly still works, but they aren't documented here
yet).

## Bringing it up

```bash
devcontainer up --workspace-folder .
```

Builds the full image (`full` target — all three agents, every plugin) by default and
runs `validate-stack.sh` automatically. A `FAIL=0` summary at the end means everything
installed and wired correctly.

### Lighter variants

The Dockerfile is a multi-stage build: `core → with-claude → with-opencode → with-agy →
full`. For a smaller image with only some agents:

```bash
docker build --target with-opencode -f .devcontainer/Dockerfile .   # Claude + OpenCode, no agy
docker build --target with-claude -f .devcontainer/Dockerfile .     # Claude only
```

Within the `full` stage, each plugin is independently toggleable at build time via its
own `ARG` (all default `true`):

```bash
docker build --build-arg INSTALL_SUPERPOWERS=false -f .devcontainer/Dockerfile .
```

`INSTALL_PONYTAIL`, `INSTALL_CLAUDE_MEM`, `INSTALL_CONTEXT_MODE_WIRING`,
`INSTALL_RTK_WIRING`, `INSTALL_SUPERPOWERS` are the available flags.
`validate-stack.sh` reads these back at runtime and SKIPs (not falsely FAILs) a
disabled plugin's checks.

## Task-type profiles, for an orchestrator to pick from

`build-profiles.sh` builds a small, curated set of tagged images, each a real `ARG`
combination matching a task archetype this project's own eval harness found evidence
for (`CLAUDE.md` summarizes the underlying findings) — not one image per possible `ARG`
combination:

| Profile | ponytail | superpowers | claude-mem | For |
|---|---|---|---|---|
| `minimal` | off | off | off | small, one-shot tasks — both off-toggled ARGs have a *demonstrated* cost tax/multiplier on work that doesn't need them, and one-shot tasks have no use for cross-session memory |
| `standard` | off | on | on | everyday work — planning/review skills available, memory for continuity, no over-build-guard tax paid unless needed |
| `over-build-guard` | on | on | on | tasks with real scope-creep risk — pays ponytail's tax deliberately |
| `full` | on | on | on | maximum capability regardless of cost (identical to the default `devcontainer up` build) |

```bash
bash .devcontainer/build-profiles.sh              # builds all four
bash .devcontainer/build-profiles.sh minimal       # builds just one
```

`run-profile.sh` starts a real container from a profile image, for an orchestrator to
dispatch into via `docker exec`:

```bash
bash .devcontainer/run-profile.sh minimal my-task-1
docker exec my-task-1 claude -p "..." --model claude-sonnet-5
docker rm -f my-task-1   # credential/data volumes persist, only the container goes
```

Credentials are **shared across every profile** (same real identity regardless of which
one is running — confirmed live: a container from a brand-new profile authenticates
instantly via the shared volumes, no fresh login needed). The config/data volumes that
can hold profile-*divergent* baked content (`opencode-config` and friends) are **not**
shared — each profile gets its own, suffixed set. This isn't optional: a shared
`opencode-config` volume only gets an image's `opencode.json` on its first-ever
creation, so two profiles sharing one would silently shadow whichever one didn't create
it first — confirmed live as a real bug for a single image already (see
`reconcile-opencode-plugins.sh`'s own comment); running genuinely different profiles
against a shared volume would hit that on every profile switch, not just once.

Bypassing the devcontainer CLI this way (`run-profile.sh` uses a plain `docker run`) has
one known, accepted gap: the dotnet/python devcontainer *features* only apply through
the real CLI's build pipeline, matching the same standalone-build caveat
`validate-stack.sh`'s own `dotnet` check already documents.

## Authenticating each agent

None of the three agents' real login flows render cleanly through a piped/non-TTY
`docker exec`. Run each of these directly, in a real terminal (Git Bash on Windows
worked reliably; a plain `docker exec -it ... claude/opencode/agy auth login`
elsewhere):

```bash
docker exec -it <container-id> claude auth login     # browser OAuth, paste code back
docker exec -it <container-id> opencode auth login    # interactive provider picker
docker exec -it <container-id> agy -p "say hello"     # triggers Google OAuth on first use
```

Credentials persist across a real `docker stop && docker rm && devcontainer up` cycle —
verified live, not assumed. Only the actual credential file for each agent is
persisted (a named Docker volume per agent), not each agent's full config directory
(session history, private `CLAUDE.md`, etc. stay out of any volume by design).

**A real fragility this design has to work around:** Claude Code's own credential
writes (login *and* its background OAuth-refresh cycle) replace `.credentials.json`
outright via an atomic rename over the persisted-volume symlink, rather than writing
through it — silently breaking persistence on the very next write, not just
eventually. `credential-watcher.sh` runs as a background daemon inside the container
(started by `postStartCommand`) that detects this the instant it happens and re-links
automatically — you shouldn't ever need to intervene manually, but if `claude`/`opencode`/`agy`
suddenly report "not logged in" despite a prior successful login, check
`/tmp/credential-watcher.log` first before assuming a fresh login is needed.

## Disabling specific skills/plugins for a controlled test

None of the three agents share a toggle mechanism — each is genuinely different, and
none of it is obvious without checking live (this was discovered the hard way during
Experiment 11; see `docs/superpowers/plans/2026-07-19-eval-harness-verification-log.md`,
2026-07-25 follow-up). `toggle-skills.sh` codifies all three:

```bash
# Claude Code — prints a --settings JSON string, scoped to ONE invocation
claude -p "..." --settings "$(.devcontainer/toggle-skills.sh claude off superpowers@claude-plugins-official)"

# OpenCode — writes a project-level opencode.json into the given directory
# ("superpowers" expands to all 14 real skill names; or name specific ones)
.devcontainer/toggle-skills.sh opencode off /path/to/worktree superpowers
opencode run "..."   # run from /path/to/worktree — the deny rules apply there only

# agy — a real, STATEFUL, GLOBAL toggle (not scoped to one invocation!)
.devcontainer/toggle-skills.sh agy off ponytail
agy -p "..."
.devcontainer/toggle-skills.sh agy on ponytail   # remember to restore it afterward
```

Reverse any of these with `on` instead of `off`, same arguments.

**Why these three specifically, and not something more uniform:** Claude Code's
`--settings` flag disables a whole plugin per-invocation, no persistence concerns.
OpenCode has no per-invocation flag at all — a project-level `plugin` array does
**not** override the global one (they merge), so the only real lever is a
`permission.skill` deny rule against each skill's real, bare name (confirmed *not*
`superpowers`-prefixed) — `--pure` (all external plugins off) was considered and
rejected since it would also silently disable ponytail/claude-mem/context-mode.
`agy plugin disable`/`enable` is a real command, but it mutates persistent global state
rather than scoping to one call, unlike the other two.

## Real, load-bearing gotchas

- **Git operations inside the container** need
  `git config --global --add safe.directory /workspaces/MCPEval` once per container
  (bind-mounted from a different UID than the container expects).
- **OpenCode's default model in this container is not covered by the z.ai coding
  plan** — always pass `--model zai-coding-plan/glm-5.2` explicitly (or whatever the
  current real subscription model is) rather than relying on the default.
- **`docker exec`/`docker cp` from Git Bash on Windows mangle absolute container
  paths** (MSYS path conversion). Prefix with `MSYS_NO_PATHCONV=1` when a command
  targets an in-container absolute path.
