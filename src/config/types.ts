export interface ComponentConfig {
  paths: string[];
  dependsOn?: string[];
  build?: string | string[];
  unitTest?: string | string[];
  integrationTest?: string | string[];
  e2eTest?: string | string[];
  e2eSmokeTest?: string | string[];
  lintStaged?: Record<string, string | string[]>;
}

export interface StatusContractConfig {
  enabled: boolean;
  ticketIdPattern: string;
}

export interface AgentHooksConfig {
  prSize?: { warn?: number; error?: number };
  maxFileLines?: number;
  codeExtensions?: string[];
  exclude?: string[];
  complexity?: { ccn?: number; functionLines?: number; params?: number };
}

export interface GuardrailsConfig {
  appName: string;
  defaultBranch: string;
  statusContract: StatusContractConfig;
  lintStaged?: Record<string, string | string[]>;
  repo?: Record<string, string | string[]>;
  coverage?: string | string[];
  agentHooks?: AgentHooksConfig;
  components: Record<string, ComponentConfig>;
}
