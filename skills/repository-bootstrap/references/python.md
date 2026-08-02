# Python tooling

Default choices for a Python 3.12 repository. An existing equivalent always
wins.

| Capability        | Tool                       | Notes                                                                  |
| ----------------- | -------------------------- | ---------------------------------------------------------------------- |
| `format`          | `ruff format`              | Auto-fix via pre-commit; `--check` only in `verify` and CI             |
| `lint`            | `ruff check`               | Zero findings; start from the default rule set and add, with reasons   |
| `typecheck`       | mypy (`--strict`)          | pyright is an acceptable swap; either way, one checker, not both       |
| `tests`           | pytest                     | Do not replace an existing runner                                      |
| `coverage`        | pytest-cov                 | `pytest --cov --cov-fail-under=80`; floor fails the run, tune per repo |
| `commit-messages` | see [shared.md](shared.md) | gitlint via pre-commit fits a Python-only shop; commitlint if Node     |
| `secrets`         | see [shared.md](shared.md) | gitleaks has a pre-commit hook                                         |
| `spelling`        | see [shared.md](shared.md) | cspell                                                                 |
| `ci-verify`       | see [shared.md](shared.md) | `verify` runs format check, lint, typecheck, tests with coverage       |
| `branch-review`   | see [shared.md](shared.md) | Host branch protection                                                 |

Wiring:

- Hook manager: [pre-commit](https://pre-commit.com) (`pre-commit install`)
  unless one exists — language-agnostic, staged-files-aware, and its standard
  hook set (large files, private keys, line endings) comes free.
  - `.pre-commit-config.yaml`: ruff-format, then ruff, then the staged checks
    — formatter first, so checks judge the formatted bytes
  - commit-msg stage: gitlint
  - pre-push stage: the `verify` command
- `pyproject.toml` is the single config point: `[tool.ruff]`, `[tool.mypy]`,
  `[tool.pytest.ini_options]`, `[tool.coverage.report]` all live there — no
  scattered `setup.cfg`/`.flake8`/`mypy.ini`.
- `verify` (a task-runner target or one script line):
  `ruff format --check . && ruff check . && mypy . && pytest --cov --cov-fail-under=80`
- Pin the floor with `requires-python = ">=3.12"` and use that version in CI
  setup-python.
