import "dotenv/config";

import { randomBytes } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as CompiledContract from "@midnight-ntwrk/compact-js/effect/CompiledContract";
import { deployContract } from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";

import { createPrivateState, createWitnesses, type GuardianPrivateState } from "../src/contract/helpers.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(PROJECT_ROOT, ".env");
const PACKAGE_JSON_PATH = path.join(PROJECT_ROOT, "package.json");
const CONTRACT_INFO_PATH = path.join(
  PROJECT_ROOT,
  "contracts",
  "managed",
  "guardian",
  "compiler",
  "contract-info.json"
);
const CONTRACT_MODULE_PATH = path.join(
  PROJECT_ROOT,
  "contracts",
  "managed",
  "guardian",
  "contract",
  "index.js"
);
const COMPILED_ASSETS_PATH = path.join(PROJECT_ROOT, "contracts", "managed", "guardian");
const PRIVATE_STATE_ID = "guardian-private-state";
const DEFAULT_PROOF_SERVER_URI = "http://localhost:6300";
const PREPROD_NETWORK_ID = 2;

interface EnvConfig {
  midnightNetwork: string;
  sdkNetworkId: string;
  indexerUri: string;
  indexerWsUri: string;
  proofServerUri: string;
  nodeUri: string;
  walletSeed: string;
  privateStatePassword: string;
}

interface PackageJson {
  dependencies?: Record<string, string>;
}

interface ContractInfo {
  "compiler-version": string;
  "language-version": string;
  "runtime-version": string;
}

interface WalletStateLike {
  address: string;
  coinPublicKey: unknown;
  encryptionPublicKey?: unknown;
}

interface SubscriptionLike {
  unsubscribe?: () => void;
}

interface SubscribableLike<T> {
  subscribe: (
    next:
      | ((value: T) => void)
      | {
          next?: (value: T) => void;
          error?: (error: unknown) => void;
        }
  ) => SubscriptionLike;
}

interface WalletLike {
  state(): SubscribableLike<WalletStateLike>;
  balanceTransaction?: (...args: unknown[]) => Promise<unknown>;
  balanceAndProveTransaction?: (...args: unknown[]) => Promise<unknown>;
  proveTransaction?: (...args: unknown[]) => Promise<unknown>;
  submitTransaction?: (...args: unknown[]) => Promise<string>;
  submitTx?: (...args: unknown[]) => Promise<string>;
}

function normalizeVersion(version: string | undefined): string {
  return (version ?? "").trim().replace(/^[~^><=\s]+/, "");
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }

  return value;
}

function getEnvConfig(): EnvConfig {
  const walletSeed = process.env.MIDNIGHT_WALLET_SEED?.trim();
  if (!walletSeed) {
    const suggestedSeed = randomBytes(32).toString("hex");
    throw new Error(
      [
        "MIDNIGHT_WALLET_SEED is missing.",
        "Add a 32-byte hex seed to .env so the deploy script can build a Midnight wallet.",
        `Suggested seed: ${suggestedSeed}`,
      ].join("\n")
    );
  }

  const privateStatePassword = process.env.MIDNIGHT_PRIVATE_STATE_PASSWORD?.trim();
  if (!privateStatePassword) {
    throw new Error(
      "MIDNIGHT_PRIVATE_STATE_PASSWORD is missing. Add a strong password with at least 16 characters to .env."
    );
  }

  if (privateStatePassword.length < 16) {
    throw new Error("MIDNIGHT_PRIVATE_STATE_PASSWORD must be at least 16 characters long.");
  }

  const midnightNetwork = (process.env.VITE_MIDNIGHT_NETWORK ?? "preprod").trim().toLowerCase();
  if (midnightNetwork !== "preprod") {
    throw new Error(
      `Guardian is configured for Midnight Preprod only. Received VITE_MIDNIGHT_NETWORK=${midnightNetwork}.`
    );
  }

  return {
    midnightNetwork,
    sdkNetworkId: "test",
    indexerUri: getRequiredEnv("VITE_INDEXER_URI"),
    indexerWsUri: getRequiredEnv("VITE_INDEXER_WS_URI"),
    proofServerUri: (process.env.MIDNIGHT_PROOF_SERVER_URI ?? DEFAULT_PROOF_SERVER_URI).trim(),
    nodeUri: getRequiredEnv("MIDNIGHT_NODE_URI"),
    walletSeed,
    privateStatePassword,
  };
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function getConfiguredRuntimeVersion(): Promise<string> {
  const packageJson = await readJsonFile<PackageJson>(PACKAGE_JSON_PATH);
  const runtimeVersion = normalizeVersion(
    packageJson.dependencies?.["@midnight-ntwrk/compact-runtime"]
  );

  if (!runtimeVersion) {
    throw new Error("Could not determine @midnight-ntwrk/compact-runtime from package.json.");
  }

  return runtimeVersion;
}

async function preflightContractArtifacts(): Promise<void> {
  const contractInfo = await readJsonFile<ContractInfo>(CONTRACT_INFO_PATH);
  const configuredRuntimeVersion = await getConfiguredRuntimeVersion();

  if (contractInfo["runtime-version"] !== configuredRuntimeVersion) {
    throw new Error(
      [
        "Guardian contract artifacts are out of sync with the installed Midnight runtime.",
        `Compiled runtime: ${contractInfo["runtime-version"]}`,
        `Installed runtime: ${configuredRuntimeVersion}`,
        `Artifact file: ${CONTRACT_INFO_PATH}`,
        "",
        "Run the Compact compiler again in WSL before deploying:",
        "compact compile contracts/guardian.compact contracts/managed/guardian",
        "",
        "If the compiled runtime still does not match after recompiling, the repo's Midnight SDK versions and Compact toolchain are not compatible yet.",
      ].join("\n")
    );
  }
}

async function ensureProofServerAvailable(proofServerUri: string): Promise<void> {
  const healthUrl = `${proofServerUri.replace(/\/$/, "")}/health`;
  const response = await fetch(healthUrl, { signal: AbortSignal.timeout(3_000) });

  if (!response.ok) {
    throw new Error(`Proof server health check failed at ${healthUrl} with status ${response.status}.`);
  }
}

function addressToWitnessBytes(address: string): Uint8Array {
  const encoded = new TextEncoder().encode(address);
  return encoded.length >= 32 ? encoded.slice(0, 32) : Uint8Array.from([...encoded, ...new Uint8Array(32 - encoded.length)]);
}

async function waitForWalletState(wallet: WalletLike): Promise<WalletStateLike> {
  return new Promise<WalletStateLike>((resolve, reject) => {
    let settled = false;
    let subscription: SubscriptionLike | undefined;

    const cleanup = () => {
      if (!settled) {
        settled = true;
      }
      subscription?.unsubscribe?.();
    };

    try {
      subscription = wallet.state().subscribe({
        next: (state) => {
          if (!state?.address || state.coinPublicKey == null) {
            return;
          }

          cleanup();
          resolve(state);
        },
        error: (error) => {
          cleanup();
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      });
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

async function buildWallet(config: EnvConfig): Promise<{ wallet: WalletLike; state: WalletStateLike }> {
  const walletModule = (await import("@midnight-ntwrk/wallet")) as {
    WalletBuilder?: {
      build?: (...args: unknown[]) => Promise<WalletLike>;
    };
  };

  if (!walletModule.WalletBuilder?.build) {
    throw new Error("Could not find WalletBuilder.build in @midnight-ntwrk/wallet.");
  }

  const wallet = await walletModule.WalletBuilder.build(
    config.indexerUri,
    config.indexerWsUri,
    config.proofServerUri,
    config.nodeUri,
    config.walletSeed,
    PREPROD_NETWORK_ID
  );

  const state = await waitForWalletState(wallet);
  return { wallet, state };
}

async function balanceWithWallet(wallet: WalletLike, tx: unknown): Promise<unknown> {
  if (typeof wallet.balanceAndProveTransaction === "function") {
    return wallet.balanceAndProveTransaction(tx);
  }

  if (typeof wallet.balanceTransaction === "function") {
    const attempts: unknown[][] = [[tx], [tx, []]];

    let lastError: unknown;
    for (const args of attempts) {
      try {
        const balancedTx = await wallet.balanceTransaction(...args);

        if (typeof wallet.proveTransaction === "function") {
          try {
            return await wallet.proveTransaction(balancedTx);
          } catch {
            return balancedTx;
          }
        }

        return balancedTx;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Wallet failed to balance the deployment transaction.");
  }

  throw new Error("Wallet does not expose a supported balance method.");
}

async function submitWithWallet(wallet: WalletLike, tx: unknown): Promise<string> {
  if (typeof wallet.submitTransaction === "function") {
    return wallet.submitTransaction(tx);
  }

  if (typeof wallet.submitTx === "function") {
    return wallet.submitTx(tx);
  }

  throw new Error("Wallet does not expose a supported submit method.");
}

async function buildCompiledContract(privateState: GuardianPrivateState) {
  const contractModule = (await import(pathToFileURL(CONTRACT_MODULE_PATH).href)) as {
    Contract: new (...args: never[]) => {
      circuits: Record<string, unknown>;
      impureCircuits?: Record<string, unknown>;
      provableCircuits?: Record<string, unknown>;
    };
  };

  const witnesses = createWitnesses(privateState);
  const BaseContract = contractModule.Contract;

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

async function updateEnvContractAddress(contractAddress: string): Promise<void> {
  let envContents = "";

  try {
    await access(ENV_PATH);
    envContents = await readFile(ENV_PATH, "utf8");
  } catch {
    envContents = "";
  }

  const nextLine = `VITE_CONTRACT_ADDRESS=${contractAddress}`;
  const updatedContents = /^VITE_CONTRACT_ADDRESS=.*$/m.test(envContents)
    ? envContents.replace(/^VITE_CONTRACT_ADDRESS=.*$/m, nextLine)
    : `${envContents.trimEnd()}${envContents.trim() ? "\n" : ""}${nextLine}\n`;

  await writeFile(ENV_PATH, updatedContents, "utf8");
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}

async function main(): Promise<void> {
  await preflightContractArtifacts();
  const config = getEnvConfig();
  await ensureProofServerAvailable(config.proofServerUri);

  setNetworkId(config.sdkNetworkId);

  const { wallet, state } = await buildWallet(config);

  console.log(`Using Midnight wallet address: ${state.address}`);

  const privateState = createPrivateState(
    addressToWitnessBytes(state.address),
    0n,
    randomBytes(32)
  );
  const compiledContract = await buildCompiledContract(privateState);

  const zkConfigProvider = new NodeZkConfigProvider(COMPILED_ASSETS_PATH);
  const providers = {
    privateStateProvider: levelPrivateStateProvider({
      privateStoragePasswordProvider: async () => config.privateStatePassword,
      accountId: state.address,
    }),
    publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri),
    proofProvider: httpClientProofProvider(config.proofServerUri, zkConfigProvider),
    zkConfigProvider,
    walletProvider: {
      coinPublicKey: state.coinPublicKey,
      getCoinPublicKey: () => state.coinPublicKey,
      getEncryptionPublicKey: () => state.encryptionPublicKey ?? state.coinPublicKey,
      balanceTx: (tx: unknown) => balanceWithWallet(wallet, tx),
    },
    midnightProvider: {
      submitTx: (tx: unknown) => submitWithWallet(wallet, tx),
    },
  };

  const deployed = await deployContract(providers as never, {
    compiledContract,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: privateState,
  } as never);

  const contractAddress = (
    deployed as {
      deployTxData?: {
        public?: {
          contractAddress?: string;
        };
      };
    }
  ).deployTxData?.public?.contractAddress;

  if (!contractAddress) {
    throw new Error("Deployment finished without returning a contract address.");
  }

  await updateEnvContractAddress(contractAddress);

  console.log("");
  console.log(`Guardian deployed successfully: ${contractAddress}`);
  console.log(`Updated ${ENV_PATH} with VITE_CONTRACT_ADDRESS.`);
  console.log("Restart pnpm dev after deployment so the frontend picks up the new env value.");
}

main().catch((error) => {
  console.error("");
  console.error("Guardian deployment failed.");
  console.error(formatError(error));
  process.exitCode = 1;
});
