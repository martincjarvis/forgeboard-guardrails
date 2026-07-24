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

export interface GuardrailsConfig {
  appName: string;
  defaultBranch: string;
  statusContract: StatusContractConfig;
  lintStaged?: Record<string, string | string[]>;
  repo?: Record<string, string | string[]>;
  coverage?: string | string[];
  components: Record<string, ComponentConfig>;
}
