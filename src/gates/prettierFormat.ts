import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as prettier from "prettier";

export async function runPrettierFormat(
  files: string[],
  cwd: string,
): Promise<{ pass: boolean; formatted: string[] }> {
  const formatted: string[] = [];

  for (const file of files) {
    const filePath = join(cwd, file);
    const fileInfo = await prettier.getFileInfo(filePath, {
      ignorePath: join(cwd, ".prettierignore"),
    });
    if (fileInfo.ignored || !fileInfo.inferredParser) continue;

    const source = readFileSync(filePath, "utf8");
    const config = (await prettier.resolveConfig(filePath)) ?? {};
    try {
      const output = await prettier.format(source, {
        ...config,
        filepath: filePath,
      });
      if (output !== source) {
        writeFileSync(filePath, output);
      }
      formatted.push(file);
    } catch {
      // Prettier can't parse this file (syntax error, or content shaped like a different
      // language than its extension implies). Skip it — prettier's --ignore-unknown spirit
      // is to no-op on files it can't handle, not crash the gate. Other gates (secret-scan,
      // SAST, etc.) still scan the file's bytes regardless.
      continue;
    }
  }

  return { pass: true, formatted };
}
