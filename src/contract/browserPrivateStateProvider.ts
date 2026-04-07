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

const STORAGE_KEY = "guardian:private-state";
const SIGNING_KEY_STORAGE = "guardian:signing-keys";

function loadMap(key: string): Map<string, unknown> {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return new Map();
    return new Map(JSON.parse(raw) as [string, unknown][]);
  } catch {
    return new Map();
  }
}

function saveMap(key: string, map: Map<string, unknown>): void {
  try {
    sessionStorage.setItem(key, JSON.stringify([...map.entries()]));
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
      return (states.get(scopedKey(id)) as PS) ?? null;
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
        encryptedPayload: btoa(JSON.stringify([...states.entries()])),
        salt: crypto.randomUUID().replace(/-/g, ""),
      };
    },

    async importPrivateStates(
      exportData: PrivateStateExport
    ): Promise<ImportPrivateStatesResult> {
      try {
        const entries = JSON.parse(atob(exportData.encryptedPayload)) as [string, unknown][];
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
        encryptedPayload: btoa(JSON.stringify([...signingKeys.entries()])),
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
