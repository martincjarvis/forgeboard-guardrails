#!/usr/bin/env node
const [, , command] = process.argv;

if (!command) {
  console.log("Usage: guardrails <install|run|format|doctor>");
  process.exit(0);
}

console.log(`Unknown command: ${command}`);
process.exit(1);
