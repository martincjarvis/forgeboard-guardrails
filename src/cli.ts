#!/usr/bin/env node
import { runInstall } from "./commands/install.ts";
import { runFormat } from "./commands/format.ts";
import { runHookCommand } from "./commands/run.ts";
import { runGateCommand } from "./commands/gate.ts";

const [, , command, ...rest] = process.argv;
const cwd = process.cwd();

async function main(): Promise<number> {
  switch (command) {
    case undefined:
      console.log("Usage: guardrails <install|run|format|gate|doctor>");
      return 0;
    case "install":
      await runInstall(cwd);
      return 0;
    case "format":
      await runFormat(cwd);
      return 0;
    case "run":
      return runHookCommand(rest[0], rest.slice(1), cwd);
    case "gate":
      return runGateCommand(rest, cwd);
    default:
      console.error(`Unknown command: ${command}`);
      return 1;
  }
}

main().then((code) => process.exit(code));
