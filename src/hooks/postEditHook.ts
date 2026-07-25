import { existsSync } from "node:fs";
import { relative, isAbsolute } from "node:path";
import { runPrettierFormat } from "../gates/prettierFormat.ts";

/**
 * PostToolUse (Edit|Write|MultiEdit) hook: format the just-edited file. Best-effort
 * and non-blocking — every path, including failure, returns 0 so a formatting hiccup
 * on one file never interrupts the agent's edit loop. runPrettierFormat honours
 * .prettierignore and silently skips files it cannot parse, so no extra ignore logic
 * is needed here.
 */
export async function runPostEditHook(
  cwd: string,
  stdinJson: string,
): Promise<number> {
  let filePath: string | undefined;
  try {
    const event = JSON.parse(stdinJson);
    filePath = event?.tool_input?.file_path;
  } catch {
    return 0; // unparseable event
  }
  if (!filePath) return 0;

  const rel = relative(cwd, filePath);
  if (rel.startsWith("..") || isAbsolute(rel)) return 0; // outside the repo
  if (!existsSync(filePath)) return 0; // edit was a delete

  try {
    await runPrettierFormat([rel], cwd);
  } catch {
    // best-effort: never block the edit loop on a formatter error
  }
  return 0;
}
