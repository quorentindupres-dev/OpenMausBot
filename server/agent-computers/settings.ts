/**
 * Runtime credential and API endpoint loader.
 * Reads strictly from process environment (injected via `keys run`); never reads `.env` files or serializes secret values.
 */
export interface AgentComputerRuntimeSettings {
  readonly cuaApiKey: string | null;
  readonly cuaApiBaseUrl: string;
  readonly daytonaApiKey: string | null;
  readonly daytonaApiBaseUrl: string;
  readonly orgoApiKey: string | null;
  readonly orgoApiBaseUrl: string;
}

export const DEFAULT_CUA_API_BASE_URL = "https://api.cua.ai/v1";
export const DEFAULT_DAYTONA_API_BASE_URL = "https://app.daytona.io/api";
export const DEFAULT_ORGO_API_BASE_URL = "https://www.orgo.ai/api";

function nonEmptySecret(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function normalizeBaseUrl(raw: string | undefined, fallback: string): string {
  const candidate = raw?.trim();
  if (!candidate) return fallback;
  const parsed = new URL(candidate);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Unsupported API protocol ${parsed.protocol}`);
  }
  return candidate.replace(/\/+$/, "");
}

export function loadAgentComputerSettings(
  env: NodeJS.ProcessEnv = process.env,
): AgentComputerRuntimeSettings {
  return {
    cuaApiKey: nonEmptySecret(env.CUA_API_KEY),
    cuaApiBaseUrl: normalizeBaseUrl(env.CUA_API_URL, DEFAULT_CUA_API_BASE_URL),
    daytonaApiKey: nonEmptySecret(env.DAYTONA_API_KEY),
    daytonaApiBaseUrl: normalizeBaseUrl(env.DAYTONA_API_URL, DEFAULT_DAYTONA_API_BASE_URL),
    orgoApiKey: nonEmptySecret(env.ORGO_API_KEY),
    orgoApiBaseUrl: normalizeBaseUrl(env.ORGO_API_URL, DEFAULT_ORGO_API_BASE_URL),
  };
}
