export class GateFailure extends Error {
  constructor(public gate: string, public remediation: string, public detail?: string) {
    super(`[${gate}] ${detail ?? ""} ${remediation}`.trim());
    this.name = "GateFailure";
  }
}
