/**
 * guardian-api.ts
 * TypeScript wrapper around the compiled Compact contract.
 * Uses CompiledContract.make() + withWitnesses() per the official Midnight SDK pattern.
 */

import type { AgentRecord } from "../../contracts/managed/guardian/contract/index.js";
import { deployContract, findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import * as CompiledContract from "@midnight-ntwrk/compact-js/effect/CompiledContract";
import { captureContractError } from "../lib/sentry.js";
import { CONTRACT_DEBOUNCE_MS } from "../lib/constants.js";
import {
  type GuardianPrivateState,
  createPrivateState,
  createWitnesses,
  bufToHex,
  hexToBuf,
} from "./helpers.js";
import type { GuardianProviders } from "./providers.js";

export { createPrivateState, createWitnesses, bufToHex, hexToBuf };
export type { GuardianPrivateState, AgentRecord };

const COMPILED_ASSETS_PATH = "contracts/managed/guardian";

// ─── Build a CompiledContract with witnesses and ZK config provider ───────────

async function buildCompiledContract(privateState: GuardianPrivateState) {
  // Static import path — Vite resolves this at build time
  const contractModule = await import(
    "../../contracts/managed/guardian/contract/index.js"
  );

  if (!contractModule.Contract) {
    throw new Error('Contract module does not export "Contract" class');
  }

  // Create witnesses with CLOSURE CAPTURE of initial private state values
  // This ensures witnesses return proper types even if SDK corrupts ctx.privateState
  const witnesses = createWitnesses(privateState);

  const BaseContract = contractModule.Contract as new (...args: never[]) => {
    circuits: Record<string, unknown>;
    impureCircuits?: Record<string, unknown>;
    provableCircuits?: Record<string, unknown>;
  };

  class GuardianContractAdapter extends BaseContract {
    constructor(...args: never[]) {
      super(...args);

      const adaptedContract = this as {
        circuits: Record<string, unknown>;
        impureCircuits?: Record<string, unknown>;
        provableCircuits?: Record<string, unknown>;
      };

      adaptedContract.provableCircuits =
        adaptedContract.provableCircuits ??
        adaptedContract.impureCircuits ??
        adaptedContract.circuits;
    }
  }

  return CompiledContract.make("guardian", GuardianContractAdapter as never).pipe(
    CompiledContract.withWitnesses(witnesses as never),
    CompiledContract.withCompiledFileAssets(COMPILED_ASSETS_PATH as never)
  );
}
// ─── Contract API class ───────────────────────────────────────────────────────

export class GuardianContractAPI {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly deployed: any;
  private privateState: GuardianPrivateState;
  private lastCallTime = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(deployed: any, privateState: GuardianPrivateState) {
    this.deployed = deployed;
    this.privateState = privateState;
  }

  updatePrivateState(state: Partial<GuardianPrivateState>) {
    this.privateState = { ...this.privateState, ...state };
  }

  private checkDebounce() {
    const now = Date.now();
    if (now - this.lastCallTime < CONTRACT_DEBOUNCE_MS) {
      throw new Error(`Please wait ${CONTRACT_DEBOUNCE_MS / 1000}s between contract interactions`);
    }
    this.lastCallTime = now;
  }

  async registerAgent(params: {
    category: 1 | 2 | 3;
    riskTier: 1 | 2 | 3;
    amlClear: boolean;
    expiresAt: bigint;
    createdAt: bigint;
  }): Promise<string> {
    this.checkDebounce();
    try {
      console.log('[Guardian] Calling registerAgent with params:', params);
      const txData = await this.deployed.callTx.registerAgent(
        BigInt(params.category),
        BigInt(params.riskTier),
        params.amlClear,
        params.expiresAt,
        params.createdAt
      );
      console.log('[Guardian] registerAgent txData:', txData);

      // Extract result from various possible locations in the response
      let result = txData?.public?.result ?? txData?.result ?? txData;

      // Handle Effect-style wrapped results (common in Midnight SDK v4+)
      if (result && typeof result === 'object' && 'value' in result) {
        result = result.value;
      }

      console.log('[Guardian] Extracted result:', result, 'type:', typeof result);

      let agentId: Uint8Array;

      if (result instanceof Uint8Array) {
        // Direct Uint8Array
        agentId = result;
      } else if (result && typeof result === 'object') {
        // Check for TypedArray-like object with buffer property
        if ('buffer' in result && 'BYTES_PER_ELEMENT' in result && 'length' in result) {
          agentId = new Uint8Array(result.buffer, result.byteOffset, result.byteLength);
        } else if (Array.isArray(result)) {
          // Regular array of numbers
          agentId = new Uint8Array(result);
        } else if ('data' in result && result.data instanceof Uint8Array) {
          // Wrapped result with data property
          agentId = result.data;
        } else if ('0' in result) {
          // Object with numeric keys (like {0: 1, 1: 2, ...})
          const arr = Object.keys(result)
            .filter(k => /^\d+$/.test(k))
            .sort((a, b) => parseInt(a) - parseInt(b))
            .map(k => result[k as keyof typeof result]);
          agentId = new Uint8Array(arr as number[]);
        } else {
          console.error('[Guardian] Unexpected agent ID result format:', result);
          throw new Error(`Invalid agent ID format: ${typeof result} - ${JSON.stringify(result)}`);
        }
      } else if (typeof result === 'string') {
        // Hex string
        agentId = hexToBuf(result);
      } else {
        console.error('[Guardian] Unhandled agent ID result type:', result);
        throw new Error(`Invalid agent ID format received: ${typeof result}`);
      }

      // Ensure we have exactly 32 bytes
      if (agentId.length !== 32) {
        console.warn(`[Guardian] Agent ID length is ${agentId.length}, expected 32`);
      }

      const agentIdHex = bufToHex(agentId);
      console.log('[Guardian] Generated agent ID (hex):', agentIdHex);
      return agentIdHex;
    } catch (err) {
      console.error('[Guardian] registerAgent error:', err);
      captureContractError(err as Error, { circuit: "registerAgent", params });
      throw err;
    }
  }

  async verifyAgent(agentIdHex: string): Promise<boolean> {
    this.checkDebounce();
    try {
      const agentId = hexToBuf(agentIdHex);
      const txData = await this.deployed.callTx.verifyAgent(agentId);
      return txData.public.result ?? txData.result;
    } catch (err) {
      captureContractError(err as Error, { circuit: "verifyAgent", agentIdHex });
      throw err;
    }
  }

  async revokeAgent(agentIdHex: string): Promise<void> {
    this.checkDebounce();
    try {
      const agentId = hexToBuf(agentIdHex);
      await this.deployed.callTx.revokeAgent(agentId);
    } catch (err) {
      captureContractError(err as Error, { circuit: "revokeAgent", agentIdHex });
      throw err;
    }
  }

  async updateAgentStatus(agentIdHex: string, newStatus: boolean): Promise<void> {
    this.checkDebounce();
    try {
      const agentId = hexToBuf(agentIdHex);
      await this.deployed.callTx.updateAgentStatus(agentId, newStatus);
    } catch (err) {
      captureContractError(err as Error, { circuit: "updateAgentStatus", agentIdHex, newStatus });
      throw err;
    }
  }

  get contractAddress(): string {
    return this.deployed.deployTxData?.public?.contractAddress ?? "";
  }
}

// ─── Deploy ───────────────────────────────────────────────────────────────────

export interface DeployResult {
  contractAddress: string;
  api: GuardianContractAPI;
}

function ensureFreshPrivateState(state: GuardianPrivateState): GuardianPrivateState {
  // Helper to convert any value to Uint8Array(32)
  const toBytes32 = (val: unknown): Uint8Array => {
    if (val instanceof Uint8Array) {
      if (val.length === 32) return val;
      return Uint8Array.from(val.slice(0, 32));
    }
    if (Array.isArray(val)) {
      return Uint8Array.from(val.slice(0, 32));
    }
    if (typeof val === 'object' && val !== null) {
      const numericKeys = Object.keys(val)
        .filter(k => /^\d+$/.test(k))
        .sort((a, b) => parseInt(a) - parseInt(b));
      const values = numericKeys.map(k => (val as Record<string, number>)[k]);
      return Uint8Array.from(values.slice(0, 32));
    }
    return new Uint8Array(32);
  };

  return {
    ownerAddress: toBytes32(state.ownerAddress),
    agentSecret: toBytes32(state.agentSecret),
    spendingLimit: typeof state.spendingLimit === 'bigint'
      ? state.spendingLimit
      : BigInt(state.spendingLimit as unknown as string | number)
  };
}

export async function deployGuardianContract(
  providers: GuardianProviders,
  privateState: GuardianPrivateState
): Promise<DeployResult> {
  console.log('[Guardian] Deploying new contract...');

  // Ensure fresh private state with proper types
  const freshState = ensureFreshPrivateState(privateState);

  // Store the private state in the provider BEFORE deploying
  await providers.privateStateProvider.set("guardian-private-state", freshState);

  const compiledContract = await buildCompiledContract(freshState);

  const deployed = await deployContract(providers as never, {
    compiledContract,
    privateStateId: "guardian-private-state",
    initialPrivateState: undefined, // Force SDK to use provider
  } as never);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contractAddress = (deployed as any).deployTxData?.public?.contractAddress ?? "";
  console.log('[Guardian] Contract deployed at:', contractAddress);

  return { contractAddress, api: new GuardianContractAPI(deployed, freshState) };
}

export async function joinGuardianContract(
  providers: GuardianProviders,
  contractAddress: string,
  privateState: GuardianPrivateState
): Promise<GuardianContractAPI> {
  console.log('[Guardian] Joining existing contract:', contractAddress);

  // Ensure fresh private state with proper types
  const freshState = ensureFreshPrivateState(privateState);

  // Store the private state in the provider BEFORE joining
  await providers.privateStateProvider.set("guardian-private-state", freshState);

  const compiledContract = await buildCompiledContract(freshState);

  const joined = await findDeployedContract(providers as never, {
    compiledContract,
    contractAddress,
    privateStateId: "guardian-private-state",
    initialPrivateState: undefined, // Force SDK to use provider
  } as never);

  console.log('[Guardian] Successfully joined contract');
  return new GuardianContractAPI(joined, freshState);
}
