/**
 * Centralized environment settings reader for `@xlabs/space-canvas`.
 * Per `evergreen-code-baseline`, `process.env` is only read inside `settings.ts`.
 */
export type SpaceCanvasSettings = {
  agentLooksDir?: string
  vaultDir?: string
  defaultProjectSlug?: string
}

export function readSpaceCanvasSettings(): SpaceCanvasSettings {
  const env =
    typeof globalThis !== 'undefined' &&
    'process' in globalThis &&
    typeof (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      ?.env === 'object'
      ? (globalThis as { process: { env: Record<string, string | undefined> } }).process.env
      : undefined
  return {
    ...(env?.AGENT_LOOKS_DIR ? { agentLooksDir: env.AGENT_LOOKS_DIR } : {}),
    ...(env?.XLABS_VAULT_DIR ? { vaultDir: env.XLABS_VAULT_DIR } : {}),
    ...(env?.XLABS_DEFAULT_PROJECT ? { defaultProjectSlug: env.XLABS_DEFAULT_PROJECT } : {})
  }
}
