// Flat config, @eslint/js recommended at zero warnings. For TypeScript, add
// typescript-eslint's recommended configs here during bootstrap.
import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**"] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
    // Sensible defaults on; a repository loosens them with a reason, not by
    // never enabling them.
    rules: {
      complexity: ["error", 15],
      "max-depth": ["error", 4],
      "no-unused-expressions": "error",
    },
  },
];
