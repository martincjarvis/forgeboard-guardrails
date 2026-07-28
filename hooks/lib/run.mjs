// Cross-platform process helpers for the gate hooks.
//
// Windows resolves `npx` to `npx.cmd`, which spawn cannot execute without a
// shell; POSIX resolves the bare name. The difference is handled once here so
// the hooks themselves read the same on every platform, and so no hook needs a
// shell — which is what would tie them to one.
import { spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";

export function run(command, args, options = {}) {
  const base = { encoding: "utf8", shell: false, ...options };
  if (isWindows) {
    const shimmed = spawnSync(`${command}.cmd`, args, base);
    if (!shimmed.error) return shimmed;
  }
  return spawnSync(command, args, base);
}

export function git(args) {
  return spawnSync("git", args, { encoding: "utf8", shell: false });
}

export function have(command, args = ["--version"]) {
  const probe = run(command, args, { stdio: "ignore" });
  return !probe.error && probe.status === 0;
}

export async function readEvent() {
  if (process.stdin.isTTY) return {};
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    return {};
  }
}
