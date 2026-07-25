import { spawnSync } from "node:child_process";

/** True when a runnable `lizard` is resolvable on PATH. shell:false so a missing
 *  binary is a clean ENOENT (status null), never a shell "not recognized" exit. */
export function lizardAvailable(): boolean {
  const result = spawnSync("lizard", ["--version"], {
    shell: false,
    encoding: "utf8",
  });
  return result.status === 0;
}

/** node:test `skip` value: false (run) when Lizard is present, else a reason string. */
export const skipWithoutLizard: false | string = lizardAvailable()
  ? false
  : "lizard not installed (pip install lizard)";
