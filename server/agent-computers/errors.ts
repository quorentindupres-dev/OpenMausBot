export const AGENT_COMPUTER_ERROR_CODES = [
  "INVALID_REQUEST",
  "LEASE_NOT_FOUND",
  "MISSING_CREDENTIALS",
  "HOST_OFFLINE",
  "CAPACITY_FULL",
  "UNSUPPORTED_OS",
  "PROVIDER_ERROR",
  "COMMAND_FAILED",
] as const;

export type AgentComputerErrorCode = (typeof AGENT_COMPUTER_ERROR_CODES)[number];

/** Structured error carrying an actionable `next` step for both bots and operators. */
export class AgentComputerError extends Error {
  readonly code: AgentComputerErrorCode;
  readonly next: string;
  readonly status: number;

  constructor(code: AgentComputerErrorCode, message: string, next: string, status = 409) {
    super(`error ${code}: ${message} (next: ${next})`);
    this.name = "AgentComputerError";
    this.code = code;
    this.next = next;
    this.status = status;
  }
}
