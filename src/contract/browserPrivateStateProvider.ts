/**
 * browserPrivateStateProvider.ts
 * In-memory + sessionStorage private state provider for browser use.
 * Implements the full PrivateStateProvider interface from midnight-js-types.
 */

import type {
  PrivateStateProvider,
  PrivateStateId,
  PrivateStateExport,
  SigningKeyExport,
  ImportPrivateStatesResult,
  ImportSigningKeysResult,
} from "@midnight-ntwrk/midnight-js-types";
import type { ContractAddress, SigningKey } from "@midnight-ntwrk/compact-runtime";

const STORAGE_KEY = "guardian:private-state:v2";
const SIGNING_KEY_STORAGE = "guardian:signing-keys:v2";

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return { __guardianType: "bigint", value: value.toString() };
  }

  if (value instanceof Uint8Array) {
    return { __guardianType: "uint8array", value: Array.from(value) };
  }

  return value;
}

function jsonReviver(_key: string, value: unknown): unknown {
  if (!value || typeof value !== "object") return value;

  const tagged = value as { __guardianType?: string; value?: unknown };
  if (tagged.__guardianType === "bigint" && typeof tagged.value === "string") {
    return BigInt(tagged.value);
  }

  if (tagged.__guardianType === "uint8array" && Array.isArray(tagged.value)) {
    return Uint8Array.from(
      tagged.value.filter((entry): entry is number => typeof entry === "number")
    );
  }

  return value;
}

function loadMap(key: string): Map<string, unknown> {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return new Map();
    return new Map(JSON.parse(raw, jsonReviver) as [string, unknown][]);
  } catch {
    return new Map();
  }
}

function saveMap(key: string, map: Map<string, unknown>): void {
  try {
    sessionStorage.setItem(key, JSON.stringify([...map.entries()], jsonReplacer));
  } catch { /* sessionStorage unavailable */ }
}

function addrKey(address: ContractAddress): string {
  return typeof address === "string" ? address : JSON.stringify(address);
}

export function browserPrivateStateProvider<
  PSI extends PrivateStateId = PrivateStateId,
  PS = unknown,
>(): PrivateStateProvider<PSI, PS> {
  const states = loadMap(STORAGE_KEY);
  const signingKeys = loadMap(SIGNING_KEY_STORAGE);
  let contractAddress: ContractAddress | null = null;

  function scopedKey(id: PSI): string {
    return contractAddress ? `${addrKey(contractAddress)}:${id}` : id;
  }

  return {
    setContractAddress(address: ContractAddress): void {
      contractAddress = address;
    },

    async get(id: PSI): Promise<PS | null> {
      const raw = states.get(scopedKey(id)) as PS | undefined;
      if (!raw) return null;

      // Reconstruct proper types if this is Guardian private state
      if (typeof raw === 'object' && raw !== null && 'ownerAddress' in raw && 'agentSecret' in raw) {
        const state = raw as unknown as { ownerAddress: unknown; agentSecret: unknown; spendingLimit: unknown };

        // Helper to ensure Uint8Array(32)
        const ensureBytes32 = (val: unknown): Uint8Array => {
          if (val instanceof Uint8Array) {
            if (val.length === 32) return val;
            return Uint8Array.from(val.slice(0, 32));
          }
          if (Array.isArray(val)) {
            return Uint8Array.from(val.slice(0, 32));
          }
          if (typeof val === 'object' && val !== null) {
            const arr = Object.keys(val)
              .filter(k => /^\d+$/.test(k))
              .sort((a, b) => parseInt(a) - parseInt(b))
              .map(k => (val as Record<string, number>)[k]);
            return Uint8Array.from(arr.slice(0, 32));
          }
          return new Uint8Array(32);
        };

        // Helper to ensure bigint
        const ensureBigint = (val: unknown): bigint => {
          if (typeof val === 'bigint') return val;
          if (typeof val === 'number') return BigInt(val);
          if (typeof val === 'string') return BigInt(val);
          if (typeof val === 'object' && val !== null && '__guardianType' in val) {
            const typed = val as { __guardianType: string; value: string };
            if (typed.__guardianType === 'bigint') return BigInt(typed.value);
          }
          return 0n;
        };

        const reconstructed = {
          ownerAddress: ensureBytes32(state.ownerAddress),
          agentSecret: ensureBytes32(state.agentSecret),
          spendingLimit: ensureBigint(state.spendingLimit)
        };

        return reconstructed as PS;
      }

      return raw ?? null;
    },

    async set(id: PSI, state: PS): Promise<void> {
      states.set(scopedKey(id), state);
      saveMap(STORAGE_KEY, states);
    },

    async remove(id: PSI): Promise<void> {
      states.delete(scopedKey(id));
      saveMap(STORAGE_KEY, states);
    },

    async clear(): Promise<void> {
      states.clear();
      saveMap(STORAGE_KEY, states);
    },

    async setSigningKey(address: ContractAddress, signingKey: SigningKey): Promise<void> {
      signingKeys.set(addrKey(address), signingKey);
      saveMap(SIGNING_KEY_STORAGE, signingKeys);
    },

    async getSigningKey(address: ContractAddress): Promise<SigningKey | null> {
      return (signingKeys.get(addrKey(address)) as SigningKey) ?? null;
    },

    async removeSigningKey(address: ContractAddress): Promise<void> {
      signingKeys.delete(addrKey(address));
      saveMap(SIGNING_KEY_STORAGE, signingKeys);
    },

    async clearSigningKeys(): Promise<void> {
      signingKeys.clear();
      saveMap(SIGNING_KEY_STORAGE, signingKeys);
    },

    async exportPrivateStates(): Promise<PrivateStateExport> {
      // Minimal export — not needed for hackathon demo
      return {
        format: "midnight-private-state-export",
        encryptedPayload: btoa(JSON.stringify([...states.entries()], jsonReplacer)),
        salt: crypto.randomUUID().replace(/-/g, ""),
      };
    },

    async importPrivateStates(
      exportData: PrivateStateExport
    ): Promise<ImportPrivateStatesResult> {
      try {
        const entries = JSON.parse(atob(exportData.encryptedPayload), jsonReviver) as [string, unknown][];
        entries.forEach(([k, v]) => states.set(k, v));
        saveMap(STORAGE_KEY, states);
        return { imported: entries.length, skipped: 0, overwritten: 0 };
      } catch {
        return { imported: 0, skipped: 0, overwritten: 0 };
      }
    },

    async exportSigningKeys(): Promise<SigningKeyExport> {
      return {
        format: "midnight-signing-key-export",
        encryptedPayload: btoa(JSON.stringify([...signingKeys.entries()], jsonReplacer)),
        salt: crypto.randomUUID().replace(/-/g, ""),
      };
    },

    async importSigningKeys(
      exportData: SigningKeyExport
    ): Promise<ImportSigningKeysResult> {
      try {
        const entries = JSON.parse(atob(exportData.encryptedPayload)) as [string, unknown][];
        entries.forEach(([k, v]) => signingKeys.set(k, v));
        saveMap(SIGNING_KEY_STORAGE, signingKeys);
        return { imported: entries.length, skipped: 0, overwritten: 0 };
      } catch {
        return { imported: 0, skipped: 0, overwritten: 0 };
      }
    },
  };
}
