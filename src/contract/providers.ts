/**
 * providers.ts
 * Sets up all Midnight provider instances from the Lace wallet.
 * Runs in the browser — uses window.midnight.mnLace.
 */

import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { ZKConfigProvider } from "@midnight-ntwrk/midnight-js-types";
import type { ProverKey, VerifierKey, ZKIR } from "@midnight-ntwrk/midnight-js-types";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { PROOF_SERVER_URI, INDEXER_URI, INDEXER_WS_URI, MIDNIGHT_SDK_NETWORK_ID } from "../lib/constants";
import { browserPrivateStateProvider } from "./browserPrivateStateProvider";

// ─── Browser ZK Config Provider ──────────────────────────────────────────────
// Fetches compiled ZK artifacts from the Vite dev server / CDN.
// The artifacts are served from /contracts/managed/guardian/ as static files.

type GuardianCircuitId = "registerAgent" | "verifyAgent" | "revokeAgent" | "updateAgentStatus";

function assertWalletKey(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized === "[object Object]" || normalized === "undefined" || normalized === "null") {
    throw new Error(
      `${label} is invalid. Disconnect and reconnect Lace so Guardian can refresh the Midnight wallet keys.`
    );
  }
  return normalized;
}

class BrowserZkConfigProvider extends ZKConfigProvider<GuardianCircuitId> {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    super();
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async fetchBinary(path: string): Promise<Uint8Array> {
    const res = await fetch(`${this.baseUrl}/${path}`);
    if (!res.ok) throw new Error(`Failed to fetch ZK artifact: ${path} (${res.status})`);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }

  async getProverKey(circuitId: GuardianCircuitId): Promise<ProverKey> {
    return this.fetchBinary(`keys/${circuitId}.prover`) as Promise<ProverKey>;
  }

  async getVerifierKey(circuitId: GuardianCircuitId): Promise<VerifierKey> {
    return this.fetchBinary(`keys/${circuitId}.verifier`) as Promise<VerifierKey>;
  }

  async getZKIR(circuitId: GuardianCircuitId): Promise<ZKIR> {
    return this.fetchBinary(`zkir/${circuitId}.bzkir`) as Promise<ZKIR>;
  }
}

// ─── Provider types ───────────────────────────────────────────────────────────

export interface GuardianProviders {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  privateStateProvider: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  publicDataProvider: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proofProvider: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  zkConfigProvider: any;
  walletProvider: {
    coinPublicKey: string;
    getCoinPublicKey: () => string;
    getEncryptionPublicKey: () => string;
    balanceTx: (tx: unknown, newCoins: unknown) => Promise<unknown>;
  };
  midnightProvider: {
    submitTx: (tx: unknown) => Promise<string>;
  };
}

// ─── Proof server health check ────────────────────────────────────────────────

export async function checkProofServer(): Promise<boolean> {
  try {
    const res = await fetch(`${PROOF_SERVER_URI}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Main provider setup ──────────────────────────────────────────────────────

/**
 * Build all providers from the connected Lace wallet API.
 * Must be called after wallet.enable() succeeds.
 */
export async function setupProviders(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walletAPI: any,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _walletAddress: string,
  coinPublicKey: string,
  encryptionPublicKey?: string
): Promise<GuardianProviders> {
  // Ensure network ID is set before any SDK operation
  setNetworkId(MIDNIGHT_SDK_NETWORK_ID);

  const normalizedCoinPublicKey = assertWalletKey(coinPublicKey, "Coin public key");
  const normalizedEncryptionPublicKey = assertWalletKey(
    encryptionPublicKey ?? normalizedCoinPublicKey,
    "Encryption public key"
  );

  if (!normalizedCoinPublicKey) {
    throw new Error(
      "Could not retrieve coin public key from wallet. Make sure Lace Midnight is connected and unlocked."
    );
  }

  // Resolve URIs from wallet config or env constants
  let indexerUri = INDEXER_URI;
  let indexerWsUri = INDEXER_WS_URI;
  let proverUri = PROOF_SERVER_URI;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const midnight = (window as any).midnight;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lace = midnight?.mnLace ?? Object.values(midnight as Record<string, any> ?? {})[0];
    const uris = lace ? await lace.serviceUriConfig?.() : null;
    if (uris) {
      indexerUri = uris.indexerUri ?? indexerUri;
      indexerWsUri = uris.indexerWsUri ?? indexerWsUri;
      proverUri = uris.proverServerUri ?? proverUri;
    }
  } catch { /* use defaults */ }

  // ZK artifacts are served from the Vite public dir or CDN
  const zkArtifactsBase = `${window.location.origin}/contracts/managed/guardian`;
  const zkConfigProvider = new BrowserZkConfigProvider(zkArtifactsBase);

  return {
    privateStateProvider: browserPrivateStateProvider(),
    publicDataProvider: indexerPublicDataProvider(indexerUri, indexerWsUri),
    proofProvider: httpClientProofProvider(proverUri, zkConfigProvider),
    zkConfigProvider,

    walletProvider: {
      coinPublicKey: normalizedCoinPublicKey,
      getCoinPublicKey: () => normalizedCoinPublicKey,
      getEncryptionPublicKey: () => normalizedEncryptionPublicKey,
      balanceTx: (tx: unknown, newCoins: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = walletAPI as any;
        if (typeof w.balanceUnsealedTransaction === "function") {
          return w.balanceUnsealedTransaction(tx, newCoins);
        }
        if (typeof w.balanceSealedTransaction === "function") {
          return w.balanceSealedTransaction(tx, newCoins);
        }
        return w.balanceAndProveTransaction(tx, newCoins);
      },
    },

    midnightProvider: {
      submitTx: (tx: unknown) => walletAPI.submitTransaction(tx) as Promise<string>,
    },
  };
}
