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
