import { readFileSync } from "node:fs";
import { runCommitMsgHook } from "../hooks/commitMsgHook.ts";
import { runPreCommitHook } from "../hooks/preCommitHook.ts";
import { runPrePushHook } from "../hooks/prePushHook.ts";

export async function runHookCommand(
  hook: string,
  args: string[],
  cwd: string,
): Promise<number> {
  if (hook === "commit-msg") {
    return runCommitMsgHook(cwd, args[0]);
  }
  if (hook === "pre-commit") {
    return runPreCommitHook(cwd);
  }
  if (hook === "pre-push") {
    return runPrePushHook(cwd, readStdin());
  }
  console.error(`Unknown hook: ${hook}`);
  return 1;
}

/** Git delivers pushed refs on stdin. Reading fd 0 synchronously is fine in a
 *  hook process; an empty read (no ref updates) yields an empty string. */
function readStdin(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}
