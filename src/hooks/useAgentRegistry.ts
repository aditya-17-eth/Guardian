/**
 * useAgentRegistry.ts
 * React hook that manages the Guardian contract API instance.
 * Handles provider setup, contract join/deploy, and all circuit calls.
 */

import { useState, useCallback, useRef } from "react";
import { setupProviders, checkProofServer, type GuardianProviders } from "../contract/providers";
import { GuardianContractAPI, createPrivateState } from "../contract/guardian-api";
import { waitForConfirmation } from "../contract/indexer";
import {
  upsertUser,
  saveAgent,
  saveTx,
  updateTxStatus,
  updateAgentActiveStatus,
} from "../lib/supabase";
import { CONTRACT_ADDRESS } from "../lib/constants";
import { captureContractError } from "../lib/sentry";
import type { TxStep } from "../components/TransactionStatus";

const LOCAL_CONTRACT_ADDRESS_KEY = "guardian.contractAddress.v2";

function normalizeStoredContractAddress(contractAddress: string | null | undefined): string {
  if (!contractAddress) return "";
  const trimmed = contractAddress.trim();
  if (!trimmed || trimmed === "[object Object]" || trimmed === "undefined" || trimmed === "null") {
    return "";
  }
  return trimmed;
}

function readRuntimeContractAddress(): string {
  if (typeof window === "undefined") return "";
  return normalizeStoredContractAddress(window.localStorage.getItem(LOCAL_CONTRACT_ADDRESS_KEY));
}

function persistRuntimeContractAddress(contractAddress: string) {
  if (typeof window === "undefined") return;
  const normalized = normalizeStoredContractAddress(contractAddress);
  if (!normalized) {
    window.localStorage.removeItem(LOCAL_CONTRACT_ADDRESS_KEY);
    return;
  }
  window.localStorage.setItem(LOCAL_CONTRACT_ADDRESS_KEY, normalized);
}

export interface RegisterAgentParams {
  agentName: string;
  category: 1 | 2 | 3;
  riskTier: 1 | 2 | 3;
  amlClear: boolean;
  spendingLimitCents: number;
  expiryMonths: number;
}

export interface UseAgentRegistryReturn {
  txStep: TxStep;
  txHash: string | undefined;
  txError: string | undefined;
  proofServerOk: boolean | null;
  registerAgent: (params: RegisterAgentParams, walletAPI: unknown, walletAddress: string, coinPublicKey: string, encryptionPublicKey?: string) => Promise<string | null>;
  revokeAgent: (agentIdHex: string, walletAPI: unknown, walletAddress: string, coinPublicKey: string, encryptionPublicKey?: string) => Promise<void>;
  toggleAgentStatus: (agentIdHex: string, newStatus: boolean, walletAPI: unknown, walletAddress: string, coinPublicKey: string, encryptionPublicKey?: string) => Promise<void>;
  resetTx: () => void;
}

export function useAgentRegistry(): UseAgentRegistryReturn {
  const [txStep, setTxStep] = useState<TxStep>("idle");
  const [txHash, setTxHash] = useState<string | undefined>();
  const [txError, setTxError] = useState<string | undefined>();
  const [proofServerOk, setProofServerOk] = useState<boolean | null>(null);

  // Cache providers per wallet session
  const providersRef = useRef<GuardianProviders | null>(null);
  const providersIdentityRef = useRef<string>("");
  const contractRef = useRef<GuardianContractAPI | null>(null);
  const runtimeContractAddressRef = useRef<string>(CONTRACT_ADDRESS || readRuntimeContractAddress());

  function resetTx() {
    setTxStep("idle");
    setTxHash(undefined);
    setTxError(undefined);
  }

  function getContractAddress(): string {
    return CONTRACT_ADDRESS || runtimeContractAddressRef.current || readRuntimeContractAddress();
  }

  /**
   * Lazily initialise providers from the wallet API.
   * Reuses cached providers if already set up.
   */
  async function getProviders(walletAPI: unknown, walletAddress: string, coinPublicKey: string, encryptionPublicKey?: string): Promise<GuardianProviders> {
    const providerIdentity = [
      walletAddress,
      coinPublicKey,
      encryptionPublicKey ?? coinPublicKey,
    ].join("|");

    if (providersRef.current && providersIdentityRef.current === providerIdentity) {
      return providersRef.current;
    }

    const providers = await setupProviders(walletAPI, walletAddress, coinPublicKey, encryptionPublicKey);
    providersRef.current = providers;
    providersIdentityRef.current = providerIdentity;
    contractRef.current = null;
    return providers;
  }

  /**
   * Full E2E flow:
   * 1. Validate inputs
   * 2. Check proof server
   * 3. Setup providers
   * 4. Generate ZK proof (registerAgent circuit)
   * 5. Submit tx to Midnight
   * 6. Wait for indexer confirmation
   * 7. Save to Supabase
   */
  const registerAgent = useCallback(async (
    params: RegisterAgentParams,
    walletAPI: unknown,
    walletAddress: string,
    coinPublicKey: string,
    encryptionPublicKey?: string
  ): Promise<string | null> => {
    resetTx();
    setTxStep("validating");

    try {
      // Step 1: Validate
      if (!params.agentName || params.spendingLimitCents < 100) {
        throw new Error("Invalid agent parameters");
      }

      // Check proof server health
      const serverOk = await checkProofServer();
      setProofServerOk(serverOk);
      if (!serverOk) {
        throw new Error(
          "Proof server unreachable at localhost:6300. Please start it with: docker run -p 6300:6300 midnightntwrk/proof-server:8.0.3 -- midnight-proof-server -v"
        );
      }

      // Step 2: Setup providers
      const providers = await getProviders(walletAPI, walletAddress, coinPublicKey, encryptionPublicKey);

      // Build private state — owner address from wallet, random agent secret
      if (!walletAddress) {
        throw new Error("Wallet address is required to create agent");
      }
      // Ensure we have exactly 32 bytes for owner address
      const normalizedAddress = walletAddress.slice(0, 32).padEnd(32, "0");
      const ownerBytes = new TextEncoder().encode(normalizedAddress);
      if (ownerBytes.length !== 32) {
        throw new Error(`Owner address must be 32 bytes, got ${ownerBytes.length}`);
      }

      const agentSecretBytes = crypto.getRandomValues(new Uint8Array(32));
      if (agentSecretBytes.length !== 32) {
        throw new Error(`Agent secret must be 32 bytes, got ${agentSecretBytes.length}`);
      }

      console.log('[Guardian] Creating private state...');

      const privateState = createPrivateState(
        ownerBytes,
        BigInt(params.spendingLimitCents),
        agentSecretBytes
      );

      // Compute expiry timestamp
      const expiresAt = BigInt(
        Math.floor(Date.now() / 1000) + params.expiryMonths * 30 * 24 * 3600
      );
      const createdAt = BigInt(Math.floor(Date.now() / 1000));

      // Step 3: Generate ZK proof
      setTxStep("generating");

      let api: GuardianContractAPI;
      const contractAddress = getContractAddress();
      console.log('[Guardian] Contract address:', contractAddress || 'none (will deploy)');

      if (contractAddress) {
        const { joinGuardianContract } = await import("../contract/guardian-api");
        api = await joinGuardianContract(providers as never, contractAddress, privateState);
      } else {
        const { deployGuardianContract } = await import("../contract/guardian-api");
        const deployed = await deployGuardianContract(providers as never, privateState);
        api = deployed.api;
        runtimeContractAddressRef.current = deployed.contractAddress;
        persistRuntimeContractAddress(deployed.contractAddress);
      }
      contractRef.current = api;

      // Step 4: Wallet signing (happens inside registerAgent call)
      setTxStep("signing");
      const agentIdHex = await api.registerAgent({
        category: params.category,
        riskTier: params.riskTier,
        amlClear: params.amlClear,
        expiresAt,
        createdAt,
      });

      // Step 5: Submit to Midnight (handled inside the SDK call above)
      setTxStep("submitting");
      const pendingTxHash = `pending-${Date.now()}-${agentIdHex.slice(0, 8)}`;
      setTxHash(pendingTxHash);

      // Save pending tx to Supabase
      await upsertUser(walletAddress);
      await saveTx({
        tx_hash: pendingTxHash,
        wallet_address: walletAddress,
        agent_id_onchain: agentIdHex,
        action: "register",
        status: "pending",
      });

      // Step 6: Wait for confirmation
      setTxStep("confirming");

      try {
        const confirmation = await waitForConfirmation(agentIdHex, 120_000);
        await updateTxStatus(pendingTxHash, "confirmed", confirmation.blockHeight);
        setTxHash(agentIdHex);
      } catch {
        // Indexer subscription failed — still save the agent optimistically
        await updateTxStatus(pendingTxHash, "confirmed");
      }

      // Step 7: Save agent to Supabase
      await saveAgent({
        agent_id_onchain: agentIdHex,
        wallet_address: walletAddress,
        agent_name: params.agentName,
        category: params.category,
        risk_tier: params.riskTier,
        aml_clear: params.amlClear,
        active: true,
        spending_limit: params.spendingLimitCents,
        expires_at: Number(expiresAt),
      });

      setTxStep("confirmed");
      return agentIdHex;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setTxError(msg);
      setTxStep("failed");
      captureContractError(err instanceof Error ? err : new Error(msg), {
        circuit: "registerAgent",
        params,
      });
      return null;
    }
  }, []);

  /**
   * Revoke an agent: ZK-prove ownership → set active=false → update Supabase
   */
  const revokeAgent = useCallback(async (
    agentIdHex: string,
    walletAPI: unknown,
    walletAddress: string,
    coinPublicKey: string,
    encryptionPublicKey?: string
  ): Promise<void> => {
    resetTx();
    setTxStep("validating");

    try {
      const contractAddress = getContractAddress();
      if (!contractAddress) {
        throw new Error(
          "No Guardian contract address is configured yet. Register an agent once to deploy it from the connected wallet, or add VITE_CONTRACT_ADDRESS to .env and restart pnpm dev."
        );
      }

      const serverOk = await checkProofServer();
      if (!serverOk) throw new Error("Proof server unreachable at localhost:6300");

      const providers = await getProviders(walletAPI, walletAddress, coinPublicKey, encryptionPublicKey);
      setTxStep("generating");

      if (!contractRef.current) {
        const { joinGuardianContract } = await import("../contract/guardian-api");
        const dummyState = createPrivateState(new Uint8Array(32), 0n, new Uint8Array(32));
        contractRef.current = await joinGuardianContract(providers as never, contractAddress, dummyState);
      }

      setTxStep("signing");
      await contractRef.current.revokeAgent(agentIdHex);

      setTxStep("submitting");
      const txHash = `revoke-${Date.now()}-${agentIdHex.slice(0, 8)}`;
      setTxHash(txHash);

      await saveTx({
        tx_hash: txHash,
        wallet_address: walletAddress,
        agent_id_onchain: agentIdHex,
        action: "revoke",
        status: "pending",
      });

      setTxStep("confirming");
      await updateAgentActiveStatus(agentIdHex, false);
      await updateTxStatus(txHash, "confirmed");
      setTxStep("confirmed");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setTxError(msg);
      setTxStep("failed");
      captureContractError(err instanceof Error ? err : new Error(msg), {
        circuit: "revokeAgent",
        agentIdHex,
      });
    }
  }, []);

  /**
   * Pause or resume an agent: ZK-prove ownership → update status → update Supabase
   */
  const toggleAgentStatus = useCallback(async (
    agentIdHex: string,
    newStatus: boolean,
    walletAPI: unknown,
    walletAddress: string,
    coinPublicKey: string,
    encryptionPublicKey?: string
  ): Promise<void> => {
    resetTx();
    setTxStep("validating");

    try {
      const contractAddress = getContractAddress();
      if (!contractAddress) {
        throw new Error(
          "No Guardian contract address is configured yet. Register an agent once to deploy it from the connected wallet, or add VITE_CONTRACT_ADDRESS to .env and restart pnpm dev."
        );
      }

      const serverOk = await checkProofServer();
      if (!serverOk) throw new Error("Proof server unreachable at localhost:6300");

      const providers = await getProviders(walletAPI, walletAddress, coinPublicKey, encryptionPublicKey);
      setTxStep("generating");

      if (!contractRef.current) {
        const { joinGuardianContract } = await import("../contract/guardian-api");
        const dummyState = createPrivateState(new Uint8Array(32), 0n, new Uint8Array(32));
        contractRef.current = await joinGuardianContract(providers as never, contractAddress, dummyState);
      }

      setTxStep("signing");
      await contractRef.current.updateAgentStatus(agentIdHex, newStatus);

      setTxStep("submitting");
      const txHash = `update-${Date.now()}-${agentIdHex.slice(0, 8)}`;
      setTxHash(txHash);

      await saveTx({
        tx_hash: txHash,
        wallet_address: walletAddress,
        agent_id_onchain: agentIdHex,
        action: "update",
        status: "pending",
      });

      setTxStep("confirming");
      await updateAgentActiveStatus(agentIdHex, newStatus);
      await updateTxStatus(txHash, "confirmed");
      setTxStep("confirmed");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setTxError(msg);
      setTxStep("failed");
      captureContractError(err instanceof Error ? err : new Error(msg), {
        circuit: "updateAgentStatus",
        agentIdHex,
        newStatus,
      });
    }
  }, []);

  return {
    txStep,
    txHash,
    txError,
    proofServerOk,
    registerAgent,
    revokeAgent,
    toggleAgentStatus,
    resetTx,
  };
}
