import { runCommitMsgHook } from "../hooks/commitMsgHook.ts";
import { runPreCommitHook } from "../hooks/preCommitHook.ts";

export async function runHookCommand(hook: string, args: string[], cwd: string): Promise<number> {
  if (hook === "commit-msg") {
    return runCommitMsgHook(cwd, args[0]);
  }
  if (hook === "pre-commit") {
    return runPreCommitHook(cwd);
  }
  console.error(`Unknown hook: ${hook}`);
  return 1;
}
