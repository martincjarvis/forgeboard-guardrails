# Multi-stage build: each stage adds one agent CLI, so a plain `docker build` (or
# `devcontainer up`, which builds the LAST stage when no target is named) gets the full
# three-agent image, while `docker build --target with-opencode` (etc.) gives a smaller
# variant for lighter local testing. Stages are additive only (core -> +Claude ->
# +OpenCode -> +agy -> full) — arbitrary independent subsets (e.g. OpenCode+agy without
# Claude) aren't supported, since nothing in this project has asked for that and it would
# combinatorially multiply the stage count for variants nobody uses.
#
# Within the final `full` stage, each plugin/skill (ponytail, claude-mem, context-mode's
# OpenCode/agy wiring, RTK's per-agent init, superpowers) is independently toggleable via
# its own ARG (default true) — e.g. `--build-arg INSTALL_SUPERPOWERS=false` for a test
# build that needs the ad hoc, no-framework baseline without superpowers active. This is
# coarse per-plugin granularity only, not per-plugin-per-agent (e.g. "ponytail for
# Claude+OpenCode but not agy" isn't a separate toggle) — nothing has asked for that
# finer grain yet, and it would need 4 plugins x 3 agents = 12 ARGs for combinations
# nobody uses. Each ARG is re-exposed as an ENV of the same name so
# `validate-stack.sh` can skip (not falsely FAIL) a disabled plugin's checks.

FROM mcr.microsoft.com/devcontainers/base:debian AS core

# Single source of truth for the non-root user this image installs everything as —
# every USER/WORKDIR/path below derives from this one declaration rather than
# repeating the literal. Override at build time with `--build-arg REMOTE_USER=...` if
# a base image with a different default user is ever substituted; devcontainer.json
# deliberately does not hardcode this value either — it infers `remoteUser` from
# whatever this Dockerfile's own final `USER` instruction resolves to (confirmed live
# 2026-07-24: the devcontainer CLI reads that from the built image's own metadata).
ARG REMOTE_USER=vscode

# System-level package installs — these genuinely need root, unlike everything below.
# inotify-tools backs credential-watcher.sh (see that file): confirmed live 2026-07-25
# that Claude Code's own credential writes (login *and* routine OAuth refresh) replace
# `.credentials.json` outright rather than writing through a symlink, silently breaking
# the persisted-volume link on every write, not just once — a one-shot re-link at
# container start isn't enough for a long-lived container.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates git build-essential python3-pip inotify-tools \
    && rm -rf /var/lib/apt/lists/*

# Node 24 (needed standalone here for a plain `docker build`; the real devcontainer
# build also gets Node via the node feature in devcontainer.json — this line makes the
# image buildable and testable on its own too, per Task 3 Step 1's guidance). System
# package manager install — root.
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Created here, while still root, and handed to REMOTE_USER — /workspace is only used
# by this project's own standalone `docker build`/`docker run` testing (the real
# devcontainer CLI bind-mounts its own /workspaces/<folder> path instead, overriding
# this entirely). A plain `WORKDIR /workspace` issued *after* switching to a non-root
# user would hit the exact same "can't create a directory at /" permission problem this
# Dockerfile was rewritten to fix — created here instead, with the right ownership.
RUN mkdir -p /workspace && chown ${REMOTE_USER}:${REMOTE_USER} /workspace

# --- Everything below installs as ${REMOTE_USER} (uid 1000 in the base image), not
# root. None of the agent CLIs or plugins below need root: they're all self-contained,
# user-space installers by design (the same way a developer would install them on a
# normal, non-root workstation) — passwordless sudo is available (base image default:
# `vscode ALL=(root) NOPASSWD:ALL`) for the rare step that would genuinely need it, but
# nothing below does. ---
USER ${REMOTE_USER}
WORKDIR /home/${REMOTE_USER}

# npm's default global prefix (set up by the NodeSource package above) points at a
# root-owned system directory — `npm install -g` as a non-root user would fail with
# EACCES. Redirect the global prefix to a directory this user owns, the standard fix
# recommended by npm's own docs, rather than reaching for `sudo npm install -g` (global
# installs as root are their own well-documented anti-pattern, not something to trade
# one root workaround for another).
RUN mkdir -p /home/${REMOTE_USER}/.npm-global && npm config set prefix /home/${REMOTE_USER}/.npm-global
ENV PATH="/home/${REMOTE_USER}/.npm-global/bin:/home/${REMOTE_USER}/.local/bin:${PATH}"

# Agent-agnostic tools — always present regardless of which agent stages below get
# built, since none of these depend on any specific agent CLI existing yet. QMD and
# context-mode are real npm global packages (confirmed live against this project's own
# host: @tobilu/qmd@2.5.3, context-mode@1.0.169). context-mode's own postinstall already
# wires up Claude Code's hooks by default (confirmed live) — that happens here
# unconditionally; only its *separate* OpenCode/agy registration steps below (in the
# `full` stage) are gated by INSTALL_CONTEXT_MODE_WIRING.
RUN npm install -g @tobilu/qmd context-mode

# RTK
RUN curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh

# Graphify — `--user` (not a system/root install) + `--break-system-packages` (bypasses
# Debian's PEP 668 externally-managed-environment guard, a distribution-level safety
# check unrelated to file permissions, not a privilege escalation).
RUN pip install --user --break-system-packages graphifyy

# semgrep (SAST) and lizard (code metrics/complexity) — both real PyPI packages,
# confirmed live 2026-07-25 (semgrep 1.171.0, lizard 1.23.0), same `--user
# --break-system-packages` pattern as Graphify. Agent-agnostic CLI tools, not wired
# into any agent's plugin/skill system — invoked directly (`semgrep --config auto
# <path>`, `lizard <path>`), confirmed working against a real fixture file before being
# added here.
RUN pip install --user --break-system-packages semgrep lizard

FROM core AS with-claude

# Claude Code
RUN curl -fsSL https://claude.ai/install.sh | bash

FROM with-claude AS with-opencode

# OpenCode (confirmed live against this project's own host: opencode-ai@1.18.4)
RUN npm install -g opencode-ai

FROM with-opencode AS with-agy

# agy (Antigravity CLI) — confirmed install command 2026-07-24. Task 1 Step 2 originally
# assumed auth used the Linux Secret Service (dbus keyring), not a plain token file, and
# deliberately skipped keyring infrastructure on that basis. Corrected 2026-07-24 via a
# real login: there is no keyring involved at all on this image — auth writes a plain
# OAuth token file to ~/.gemini/antigravity-cli/antigravity-oauth-token, which
# setup-credential-persistence.sh now symlinks into its own dedicated volume, the same
# scoped pattern as Claude Code and OpenCode.
RUN curl -fsSL https://antigravity.google/cli/install.sh | bash

# The full, three-agent image with every plugin/skill wired in by default — what
# `devcontainer up`/a plain `docker build` (no --target) actually builds, since this is
# the last stage.
FROM with-agy AS full

ARG REMOTE_USER=vscode
ARG INSTALL_PONYTAIL=true
ARG INSTALL_CLAUDE_MEM=true
ARG INSTALL_CONTEXT_MODE_WIRING=true
ARG INSTALL_RTK_WIRING=true
ARG INSTALL_SUPERPOWERS=true
ENV INSTALL_PONYTAIL=${INSTALL_PONYTAIL} \
    INSTALL_CLAUDE_MEM=${INSTALL_CLAUDE_MEM} \
    INSTALL_CONTEXT_MODE_WIRING=${INSTALL_CONTEXT_MODE_WIRING} \
    INSTALL_RTK_WIRING=${INSTALL_RTK_WIRING} \
    INSTALL_SUPERPOWERS=${INSTALL_SUPERPOWERS}

# ponytail — multi-agent, per its own README ("works with 20 agents"). Claude Code is
# the primary target (build fails loud if this breaks when enabled); OpenCode and agy
# are best-effort additions (`|| true`) so a secondary-agent hiccup doesn't block the
# whole image, but any real failure there is still visible in the build log.
RUN if [ "$INSTALL_PONYTAIL" = "true" ]; then \
      claude plugin marketplace add DietrichGebert/ponytail \
      && claude plugin install ponytail@ponytail; \
    fi
RUN if [ "$INSTALL_PONYTAIL" = "true" ]; then \
      mkdir -p /home/${REMOTE_USER}/.config/opencode && node -e " \
        const fs = require('fs'); const p = '/home/${REMOTE_USER}/.config/opencode/opencode.json'; \
        let c = {}; if (fs.existsSync(p)) c = JSON.parse(fs.readFileSync(p, 'utf8')); \
        c.plugin = [...new Set([...(c.plugin || []), '@dietrichgebert/ponytail'])]; \
        fs.writeFileSync(p, JSON.stringify(c, null, 2)); \
      "; \
    fi || true
RUN if [ "$INSTALL_PONYTAIL" = "true" ]; then agy plugin install https://github.com/DietrichGebert/ponytail; fi || true

# claude-mem — confirmed real multi-agent flags. Claude Code needs Bun + uv, the exact
# dependency that failed on Windows via a PowerShell-script-based auto-installer
# (Experiment 8) — this is the actual hypothesis test: does claude-mem's own installer
# succeed cleanly on Linux, or does a different bug show up. Do not pre-install Bun/uv
# manually here — let claude-mem's own installer attempt it, so Task 3's validation
# genuinely tests the real install path. OpenCode/Antigravity variants are best-effort.
RUN if [ "$INSTALL_CLAUDE_MEM" = "true" ]; then npx claude-mem install; fi || true
RUN if [ "$INSTALL_CLAUDE_MEM" = "true" ]; then npx claude-mem install --ide opencode; fi || true
RUN if [ "$INSTALL_CLAUDE_MEM" = "true" ]; then npx claude-mem install --ide antigravity; fi || true

# context-mode — npm install (in `core`, above) already wires up Claude Code's hooks by
# default. OpenCode and agy each need their own explicit registration, confirmed via
# context-mode's own README (its OpenCode section documents the plugin.json entry;
# its Antigravity CLI section documents the exact `agy plugin install` URL below).
RUN if [ "$INSTALL_CONTEXT_MODE_WIRING" = "true" ]; then \
      mkdir -p /home/${REMOTE_USER}/.config/opencode && node -e " \
        const fs = require('fs'); const p = '/home/${REMOTE_USER}/.config/opencode/opencode.json'; \
        let c = {}; if (fs.existsSync(p)) c = JSON.parse(fs.readFileSync(p, 'utf8')); \
        c.plugin = [...new Set([...(c.plugin || []), 'context-mode'])]; \
        fs.writeFileSync(p, JSON.stringify(c, null, 2)); \
      "; \
    fi || true
RUN if [ "$INSTALL_CONTEXT_MODE_WIRING" = "true" ]; then agy plugin install https://github.com/mksglu/context-mode/tree/main/configs/antigravity-cli; fi || true

# superpowers — confirmed 2026-07-24 (Experiment 11 Task 1 Step 3 / container-auth
# setup) via a real, from-scratch investigation, not the plan's originally-assumed
# mechanism. Claude Code: real marketplace + plugin install, matching this project's
# own host exactly (`claude-plugins-official`, sourced from `anthropics/claude-plugins-
# official` — a *different*, ad hoc `superpowers-dev`/`obra/superpowers` marketplace
# was tried first during live debugging and had to be removed and redone to match).
# OpenCode: the real, current official mechanism is a `plugin` array entry in
# opencode.json referencing the git repo directly (the plan's originally-assumed
# "fetch and follow instructions from a URL" mechanism was stale) — confirmed by
# fetching `.opencode/INSTALL.md` directly rather than trusting a paraphrase.
RUN if [ "$INSTALL_SUPERPOWERS" = "true" ]; then \
      claude plugin marketplace add anthropics/claude-plugins-official \
      && claude plugin install superpowers@claude-plugins-official; \
    fi
RUN if [ "$INSTALL_SUPERPOWERS" = "true" ]; then \
      mkdir -p /home/${REMOTE_USER}/.config/opencode && node -e " \
        const fs = require('fs'); const p = '/home/${REMOTE_USER}/.config/opencode/opencode.json'; \
        let c = {}; if (fs.existsSync(p)) c = JSON.parse(fs.readFileSync(p, 'utf8')); \
        c.plugin = [...new Set([...(c.plugin || []), 'superpowers@git+https://github.com/obra/superpowers.git'])]; \
        fs.writeFileSync(p, JSON.stringify(c, null, 2)); \
      "; \
    fi || true

# RTK — confirmed real per-agent flags via `rtk init --help`, corrected after a real
# build failure: `--opencode` alone does NOT include the base Claude Code hook (the
# first attempt logged "No hook installed — run `rtk init -g`" for the opencode-only
# call) — a bare `rtk init -g` is needed first, `--opencode` is a genuinely separate
# additional install, not a modifier on the default. `-g` writes to the global
# assistant config directory (matching this image's "reusable across projects" goal).
RUN if [ "$INSTALL_RTK_WIRING" = "true" ]; then rtk init -g --auto-patch; fi || true
RUN if [ "$INSTALL_RTK_WIRING" = "true" ]; then rtk init -g --opencode --auto-patch; fi || true
# `--agent antigravity` does NOT support `-g` — confirmed via a real build failure:
# "rtk: Antigravity is project-scoped. Use: rtk init --agent antigravity". This is a
# genuine limitation of RTK's own Antigravity integration, not something to work around
# here — it means RTK's antigravity setup cannot be baked into this shared base image
# and must be run per-project when the container is actually used. Recorded as a real
# finding for Task 6, not silently dropped.

WORKDIR /workspace
