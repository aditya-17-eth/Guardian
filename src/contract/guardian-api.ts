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
      const txData = await this.deployed.callTx.registerAgent(
        BigInt(params.category),
        BigInt(params.riskTier),
        params.amlClear,
        params.expiresAt,
        params.createdAt
      );
      const agentId: Uint8Array = txData.public.result ?? txData.result;
      return bufToHex(agentId);
    } catch (err) {
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

export async function deployGuardianContract(
  providers: GuardianProviders,
  privateState: GuardianPrivateState
): Promise<DeployResult> {
  const compiledContract = await buildCompiledContract(privateState);

  const deployed = await deployContract(providers as never, {
    compiledContract,
    privateStateId: "guardian-private-state",
    initialPrivateState: privateState,
  } as never);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contractAddress = (deployed as any).deployTxData?.public?.contractAddress ?? "";

  return { contractAddress, api: new GuardianContractAPI(deployed, privateState) };
}

export async function joinGuardianContract(
  providers: GuardianProviders,
  contractAddress: string,
  privateState: GuardianPrivateState
): Promise<GuardianContractAPI> {
  const compiledContract = await buildCompiledContract(privateState);

  const joined = await findDeployedContract(providers as never, {
    compiledContract,
    contractAddress,
    privateStateId: "guardian-private-state",
    initialPrivateState: privateState,
  } as never);

  return new GuardianContractAPI(joined, privateState);
}
