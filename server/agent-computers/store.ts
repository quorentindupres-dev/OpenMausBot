import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  cloudBurstPolicySchema,
  computerLeaseSchema,
  mac2HostConfigSchema,
  type AgentComputerProviderId,
  type CloudBurstPolicy,
  type CloudBurstPolicyInput,
  type ComputerLease,
  type Mac2HostConfig,
  type Mac2HostConfigInput,
} from "../../shared/agent-computers.ts";
import { writeFileAtomic } from "../atomic.ts";

export const AGENT_COMPUTERS_FILENAME = "agent-computers.json";

const storeFileSchema = z
  .object({
    version: z.literal(1),
    mac2: mac2HostConfigSchema,
    burstPolicy: cloudBurstPolicySchema,
    leases: z.array(computerLeaseSchema).max(500),
  })
  .strict();

type StoreSnapshot = z.output<typeof storeFileSchema>;

function defaultStoreSnapshot(): StoreSnapshot {
  return {
    version: 1,
    mac2: mac2HostConfigSchema.parse({}),
    burstPolicy: cloudBurstPolicySchema.parse({}),
    leases: [],
  };
}

/**
 * Atomic JSON store at `<DATA_DIR>/agent-computers.json` (`0600`).
 * Stores only host routing parameters and non-secret lease records; API keys are never persisted here.
 */
export class AgentComputerStore {
  private readonly filePath: string;
  private state: StoreSnapshot;

  constructor(dataDirOrFilePath: string) {
    this.filePath = dataDirOrFilePath.endsWith(".json")
      ? dataDirOrFilePath
      : join(dataDirOrFilePath, AGENT_COMPUTERS_FILENAME);
    this.state = this.loadFromDisk();
  }

  private loadFromDisk(): StoreSnapshot {
    if (!existsSync(this.filePath)) {
      return defaultStoreSnapshot();
    }
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as unknown;
      return storeFileSchema.parse(parsed);
    } catch (error) {
      console.warn(
        `agent-computers: could not parse ${this.filePath}, starting with clean state: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return defaultStoreSnapshot();
    }
  }

  private saveToDisk(): void {
    mkdirSync(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const serialized = `${JSON.stringify(this.state, null, 2)}\n`;
    writeFileAtomic(this.filePath, serialized, { mode: 0o600 });
  }

  path(): string {
    return this.filePath;
  }

  getMac2Config(): Mac2HostConfig {
    return { ...this.state.mac2 };
  }

  updateMac2Config(patch: Partial<Mac2HostConfigInput>): Mac2HostConfig {
    const merged = mac2HostConfigSchema.parse({ ...this.state.mac2, ...patch });
    this.state = { ...this.state, mac2: merged };
    this.saveToDisk();
    return { ...merged };
  }

  getBurstPolicy(): CloudBurstPolicy {
    return {
      ...this.state.burstPolicy,
      fallbackOrder: [...this.state.burstPolicy.fallbackOrder],
    };
  }

  updateBurstPolicy(patch: Partial<CloudBurstPolicyInput>): CloudBurstPolicy {
    const merged = cloudBurstPolicySchema.parse({ ...this.state.burstPolicy, ...patch });
    this.state = { ...this.state, burstPolicy: merged };
    this.saveToDisk();
    return this.getBurstPolicy();
  }

  listLeases(filter?: {
    agentId?: string;
    provider?: AgentComputerProviderId;
    includeDestroyed?: boolean;
  }): ComputerLease[] {
    return this.state.leases
      .filter((lease) => {
        if (!filter?.includeDestroyed && lease.state === "destroyed") return false;
        if (filter?.agentId && lease.agentId !== filter.agentId) return false;
        if (filter?.provider && lease.provider !== filter.provider) return false;
        return true;
      })
      .map((lease) => ({ ...lease }));
  }

  getLease(leaseId: string): ComputerLease | null {
    const found = this.state.leases.find((lease) => lease.leaseId === leaseId);
    return found ? { ...found } : null;
  }

  findPersistentLease(input: {
    provider: AgentComputerProviderId;
    instanceName: string;
  }): ComputerLease | null {
    const found = this.state.leases.find(
      (lease) =>
        lease.mode === "long-term" &&
        lease.provider === input.provider &&
        lease.instanceName === input.instanceName &&
        lease.state !== "destroyed",
    );
    return found ? { ...found } : null;
  }

  upsertLease(lease: ComputerLease): ComputerLease {
    const validated = computerLeaseSchema.parse(lease);
    const others = this.state.leases.filter((candidate) => candidate.leaseId !== validated.leaseId);
    // Prune destroyed ephemeral leases beyond recent 100 entries so the file stays compact.
    const activeOrPersistent = others.filter((candidate) => candidate.state !== "destroyed");
    const destroyedHistory = others.filter((candidate) => candidate.state === "destroyed").slice(-50);
    this.state = {
      ...this.state,
      leases: [...destroyedHistory, ...activeOrPersistent, validated],
    };
    this.saveToDisk();
    return { ...validated };
  }

  removeLease(leaseId: string): boolean {
    const before = this.state.leases.length;
    const remaining = this.state.leases.filter((candidate) => candidate.leaseId !== leaseId);
    if (remaining.length === before) return false;
    this.state = { ...this.state, leases: remaining };
    this.saveToDisk();
    return true;
  }
}
