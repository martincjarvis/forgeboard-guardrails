export interface ParsedCounts {
  passed: number;
  failed: number;
  total: number;
}

export function parseTestOutput(output: string): ParsedCounts | null {
  const dotnetMatch = output.match(
    /Failed:\s*(\d+),\s*Passed:\s*(\d+),\s*Skipped:\s*\d+,\s*Total:\s*(\d+)/,
  );
  if (dotnetMatch) {
    return {
      failed: Number(dotnetMatch[1]),
      passed: Number(dotnetMatch[2]),
      total: Number(dotnetMatch[3]),
    };
  }

  const mochaPassing = output.match(/(\d+)\s+passing/);
  const mochaFailing = output.match(/(\d+)\s+failing/);
  if (mochaPassing) {
    const passed = Number(mochaPassing[1]);
    const failed = mochaFailing ? Number(mochaFailing[1]) : 0;
    return { passed, failed, total: passed + failed };
  }

  return null;
}

/**
 * Names the tests a runner reported as failing.
 *
 * A gate that says only "the command exited non-zero" makes the developer re-run
 * the suite by hand to find out what broke. The runner already said; this reads it.
 *
 * node:test's spec reporter marks failures with `✖`, but so do many tools' ordinary
 * progress lines, so only the block after the `failing tests:` summary header is
 * trusted — matching a bare `✖` anywhere would collect gate labels and fixture noise.
 */
export function extractFailingTests(output: string): string[] {
  const names: string[] = [];
  const lines = output.split("\n");

  const summaryStart = lines.findIndex((l) => /^✖ failing tests:/.test(l));
  if (summaryStart !== -1) {
    for (const line of lines.slice(summaryStart + 1)) {
      // The trailing duration is what separates a result line from a message.
      const match = line.match(/^✖ (.+?) \([\d.]+m?s\)\s*$/);
      if (match) names.push(match[1]);
    }
  }

  for (const line of lines) {
    const tap = line.match(/^not ok \d+ - (.+?)\s*$/);
    if (tap) names.push(tap[1]);

    const dotnet = line.match(/^\s*Failed\s+(\S+)\s+\[[\d.]+\s*m?s\]/);
    if (dotnet) names.push(dotnet[1]);
  }

  return [...new Set(names)];
}

/**
 * Builds the detail a gate reports when a command fails: the failing test names
 * first, then the command's own output beneath them.
 *
 * Order matters. The output is routinely thousands of lines — a coverage table, a
 * full spec run — and burying the one thing the developer needs at the bottom of it
 * is the same as not reporting it.
 */
export function describeFailure(output: string, fallback: string): string {
  const body = output.trim();
  if (body === "") return fallback;

  const failing = extractFailingTests(body);
  if (failing.length === 0) return body;

  const heading = `${failing.length} failing test${failing.length === 1 ? "" : "s"}:`;
  return `${heading}\n${failing.map((n) => `  - ${n}`).join("\n")}\n\n${body}`;
}
