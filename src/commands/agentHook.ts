import { runPostEditHook } from "../hooks/postEditHook.ts";
import { runTaskCompleteHook } from "../hooks/taskCompleteHook.ts";

export async function runAgentHook(
  name: string,
  cwd: string,
  stdin: string,
): Promise<number> {
  if (name === "post-edit") return runPostEditHook(cwd, stdin);
  if (name === "task-complete") return runTaskCompleteHook(cwd, stdin);
  console.error(`Unknown agent-hook: ${name}`);
  return 1;
}
