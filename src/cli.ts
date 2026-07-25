#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { runInstall } from "./commands/install.ts";
import { runFormat } from "./commands/format.ts";
import { runHookCommand } from "./commands/run.ts";
import { runAgentHook } from "./commands/agentHook.ts";
import { runScan } from "./commands/scan.ts";

const [, , command, ...rest] = process.argv;
const cwd = process.cwd();

function readStdin(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

async function main(): Promise<number> {
  switch (command) {
    case undefined:
      console.log(
        "Usage: guardrails <install|run|format|doctor|agent-hook|scan>",
      );
      return 0;
    case "install":
      await runInstall(cwd);
      return 0;
    case "format":
      await runFormat(cwd);
      return 0;
    case "run":
      return runHookCommand(rest[0], rest.slice(1), cwd);
    case "agent-hook":
      return runAgentHook(rest[0], cwd, readStdin());
    case "scan":
      return runScan(cwd);
    default:
      console.error(`Unknown command: ${command}`);
      return 1;
  }
}

main().then((code) => process.exit(code));
