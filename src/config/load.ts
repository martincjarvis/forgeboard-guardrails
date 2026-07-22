import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import schema from "../../schemas/guardrails.config.schema.json" with { type: "json" };
import type { GuardrailsConfig } from "./types.ts";

// The validated input is the repo's own guardrails.config.json, not untrusted data,
// and reporting every schema error at once is what lets a misconfiguration name all
// its problems in one run rather than one per attempt.
// nosemgrep: javascript.ajv.security.audit.ajv-allerrors-true.ajv-allerrors-true
const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

export function loadConfig(cwd: string): GuardrailsConfig {
  const configPath = join(cwd, ".forgeboard", "guardrails.config.json");
  if (!existsSync(configPath)) {
    throw new Error(
      `No .forgeboard/guardrails.config.json found at ${configPath}`,
    );
  }

  const raw = JSON.parse(readFileSync(configPath, "utf8"));

  if (!validate(raw)) {
    const messages = (validate.errors ?? [])
      .map((e) => `${e.instancePath || "(root)"} ${e.message}`)
      .join("; ");
    throw new Error(`Invalid guardrails.config.json: ${messages}`);
  }

  const config = raw as GuardrailsConfig;
  config.statusContract = {
    enabled: config.statusContract?.enabled ?? false,
    ticketIdPattern: config.statusContract?.ticketIdPattern ?? "[A-Z]+-\\d+",
  };

  return config;
}
