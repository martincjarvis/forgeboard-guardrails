import { existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PRETTIER_IGNORE } from "../install/defaultPrettierIgnore.ts";
import { runDoctorCheck } from "./doctor.ts";
import { loadConfig } from "../config/load.ts";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const DEFAULT_EDITORCONFIG = `root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2
`;

const DEFAULT_GITATTRIBUTES = `* text=auto eol=lf
*.png binary
*.jpg binary
*.ico binary
`;

const STARTER_CONFIG = {
  appName: "my-app",
  defaultBranch: "main",
  statusContract: { enabled: false, ticketIdPattern: "[A-Z]+-\\d+" },
  components: {
    example: { paths: ["src/**"] }
  }
};

export async function runInstall(cwd: string): Promise<void> {
  writeIfAbsent(join(cwd, ".forgeboard", "guardrails.config.json"), JSON.stringify(STARTER_CONFIG, null, 2), true);
  writeIfAbsent(join(cwd, ".editorconfig"), DEFAULT_EDITORCONFIG);
  writeIfAbsent(join(cwd, ".gitattributes"), DEFAULT_GITATTRIBUTES);
  writeIfAbsent(join(cwd, ".prettierignore"), DEFAULT_PRETTIER_IGNORE);
  writeIfAbsent(join(cwd, ".secretlintrc.json"), readFileSync(join(packageRoot, ".secretlintrc.json"), "utf8"));
  writeIfAbsent(join(cwd, "cspell.json"), readFileSync(join(packageRoot, "cspell.json"), "utf8"));

  ensureGitignoreEntry(cwd, ".forgeboard/state/");
  writeHookShims(cwd);

  const config = loadConfig(cwd);
  const warnings = runDoctorCheck(config);
  for (const warning of warnings) {
    console.warn(`[doctor] ${warning}`);
  }
  console.log(
    "guardrails installed. If this is an existing repo (not a fresh bootstrap), run `guardrails format` " +
    "once and commit the result before your next real commit — otherwise the universal formatter will " +
    "reformat old files the first time you touch them, burying real changes in reflow noise."
  );
}

function writeIfAbsent(path: string, content: string, ensureParentDir = false): void {
  if (existsSync(path)) return;
  if (ensureParentDir) mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function ensureGitignoreEntry(cwd: string, entry: string): void {
  const path = join(cwd, ".gitignore");
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (existing.includes(entry)) return;
  appendFileSync(path, (existing.endsWith("\n") || existing === "" ? "" : "\n") + entry + "\n");
}

function writeHookShims(cwd: string): void {
  const hooksDir = join(cwd, ".git", "hooks");
  mkdirSync(hooksDir, { recursive: true });

  const cliPath = join(packageRoot, "src", "cli.ts");

  writeFileSync(
    join(hooksDir, "commit-msg"),
    `#!/bin/sh\nnpx tsx "${cliPath}" run commit-msg "$1"\n`,
    { mode: 0o755 }
  );
  writeFileSync(
    join(hooksDir, "pre-commit"),
    `#!/bin/sh\nnpx tsx "${cliPath}" run pre-commit\n`,
    { mode: 0o755 }
  );
}
