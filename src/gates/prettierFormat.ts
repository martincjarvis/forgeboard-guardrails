import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as prettier from "prettier";

export async function runPrettierFormat(files: string[], cwd: string): Promise<{ pass: boolean; formatted: string[] }> {
  const formatted: string[] = [];

  for (const file of files) {
    const filePath = join(cwd, file);
    const fileInfo = await prettier.getFileInfo(filePath, { ignorePath: join(cwd, ".prettierignore") });
    if (fileInfo.ignored || !fileInfo.inferredParser) continue;

    const source = readFileSync(filePath, "utf8");
    const config = (await prettier.resolveConfig(filePath)) ?? {};
    const output = await prettier.format(source, { ...config, filepath: filePath });

    if (output !== source) {
      writeFileSync(filePath, output);
    }
    formatted.push(file);
  }

  return { pass: true, formatted };
}
