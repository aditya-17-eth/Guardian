import { useState, useCallback, useEffect } from "react";
import { captureWalletError } from "../lib/sentry";

export interface WalletState {
  address: string;
  coinPublicKey: string;
  encryptionPublicKey: string;
  balance: { tDUST: string; NIGHT: string };
  uris: {
    indexerUri: string;
    indexerWsUri: string;
    proverServerUri: string;
    nodeUri: string;
  };
}

// EIP-6963 provider detail shape
interface EIP6963ProviderDetail {
  info: { rdns: string; name: string; uuid: string; icon: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeWalletString(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "[object Object]" || trimmed === "undefined" || trimmed === "null") {
      return "";
    }
    return trimmed;
  }
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }

  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown> & { toHexString?: () => string };
  if (typeof record.toHexString === "function") {
    return record.toHexString();
  }

  const candidateKeys = [
    "address",
    "bech32",
    "value",
    "hex",
    "encoded",
    "unshieldedAddress",
    "shieldedAddress",
    "coinPublicKey",
    "coin_public_key",
    "shieldedCoinPublicKey",
    "shieldedEncryptionPublicKey",
    "publicKey",
    "cpk",
  ] as const;

  for (const key of candidateKeys) {
    const candidate = record[key];
    if (typeof candidate === "string") return candidate;
  }

  const bytes = record.bytes;
  if (bytes instanceof Uint8Array) return bytesToHex(bytes);
  if (Array.isArray(bytes) && bytes.every((byte) => typeof byte === "number")) {
    return bytesToHex(Uint8Array.from(bytes));
  }

  return "";
}

/**
 * Discover the Lace Midnight wallet via EIP-6963 event system.
 * Returns the provider object (which has .enable()) or null.
 */
async function discoverLaceProvider(): Promise<unknown | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 3000);

    // Listen for EIP-6963 announcements
    window.addEventListener(
      "eip6963:announceProvider",
      (event: Event) => {
        const detail = (event as CustomEvent<EIP6963ProviderDetail>).detail;
        // Accept any Lace wallet (Midnight or Cardano variant)
        if (
          detail?.info?.rdns?.includes("lace") ||
          detail?.info?.name?.toLowerCase().includes("lace")
        ) {
          clearTimeout(timeout);
          resolve(detail.provider);
        }
      },
      { once: false }
    );

    // Request providers — this triggers announcements from all installed wallets
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // Also check legacy window.midnight injection as fallback
    setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const midnight = (window as any).midnight;
      if (midnight) {
        // Try legacy mnLace
        if (midnight.mnLace?.enable || midnight.mnLace?.connect) {
          clearTimeout(timeout);
          resolve(midnight.mnLace);
          return;
        }
        // Try any value that has connect or enable (own or prototype)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vals = Object.values(midnight as Record<string, any>);
        const withConnect = vals.find(
          (v) => typeof v?.connect === "function" || typeof v?.enable === "function"
        );
        if (withConnect) {
          clearTimeout(timeout);
          resolve(withConnect);
        }
      }
    }, 300);
  });
}

export function useMidnightWallet() {
  const [walletState, setWalletState] = useState<WalletState | null>(null);
  const [walletAPI, setWalletAPI] = useState<unknown>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-discover the provider on mount so it's ready when user clicks
  useEffect(() => {
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  }, []);

  const connectWallet = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const provider = await discoverLaceProvider();

      if (!provider) {
        throw new Error(
          "Lace Midnight wallet not found. Make sure Lace is installed and Midnight Beta features are enabled in Settings."
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const walletProvider = provider as any;

      // Official Lace Midnight API: use enable() then state()
      // connect() is NOT the correct method per official docs
      const api = typeof walletProvider.enable === "function"
        ? await walletProvider.enable()
        : await walletProvider.connect?.("preprod");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const a = api as any;

      let address = "";
      let coinPublicKey = "";
      let encryptionPublicKey = "";
      let dustBalance = "0";
      let uris: Record<string, string> = {};

      // state() is not available — skip it
      // Try getUnshieldedAddress first and log the full object
      try {
        const unshieldedAddr = await a.getUnshieldedAddress?.();
        console.log("[Guardian] getUnshieldedAddress() full object:", JSON.stringify(unshieldedAddr));
        console.log("[Guardian] getUnshieldedAddress() keys:", unshieldedAddr ? Object.keys(unshieldedAddr) : []);
        if (typeof unshieldedAddr === "string") {
          address = normalizeWalletString(unshieldedAddr);
        } else if (unshieldedAddr) {
          // Try every known key
          address = normalizeWalletString(
            unshieldedAddr.address ?? unshieldedAddr.bech32 ?? unshieldedAddr.value
              ?? unshieldedAddr.hex ?? unshieldedAddr.encoded ?? ""
          );
          // Also check if coinPublicKey is nested here
          const cpk = unshieldedAddr.coinPublicKey ?? unshieldedAddr.coin_public_key
            ?? unshieldedAddr.cpk ?? unshieldedAddr.publicKey;
          if (cpk) {
            coinPublicKey = normalizeWalletString(cpk);
          }
        }
      } catch (e) {
        console.warn("[Guardian] getUnshieldedAddress() failed:", e);
      }

      // getShieldedAddresses() returns { shieldedAddress, shieldedCoinPublicKey, shieldedEncryptionPublicKey }
      try {
        const shielded = await a.getShieldedAddresses?.();
        const entry = Array.isArray(shielded) ? shielded[0] : shielded;
        if (entry?.shieldedCoinPublicKey) {
          coinPublicKey = normalizeWalletString(entry.shieldedCoinPublicKey);
        }
        if (entry?.shieldedEncryptionPublicKey) {
          encryptionPublicKey = normalizeWalletString(entry.shieldedEncryptionPublicKey);
        }
        if (!address && entry?.shieldedAddress) {
          address = normalizeWalletString(entry.shieldedAddress);
        }
      } catch (e) {
        console.warn("[Guardian] getShieldedAddresses() failed:", e);
      }

      // getUnshieldedAddress() returns { unshieldedAddress }
      if (!address) {
        try {
          const unshielded = await a.getUnshieldedAddress?.();
          address = normalizeWalletString(unshielded?.unshieldedAddress ?? unshielded);
        } catch { /* ignore */ }
      }

      console.log("[Guardian] Final address:", address);
      console.log("[Guardian] Final coinPublicKey:", coinPublicKey);
      address = normalizeWalletString(address);
      coinPublicKey = normalizeWalletString(coinPublicKey);
      encryptionPublicKey = normalizeWalletString(encryptionPublicKey);
      if (!address) address = coinPublicKey;

      if (!coinPublicKey) {
        throw new Error(
          `Wallet connected but coin public key is unavailable. API methods: [${[...Object.keys(a ?? {}), ...Object.getOwnPropertyNames(Object.getPrototypeOf(a) ?? {})].join(", ")}]`
        );
      }

      try {
        const dust = await a.getDustBalance?.();
        dustBalance = String(dust ?? "0");
      } catch { /* ignore */ }

      try {
        const config = await a.getConfiguration?.();
        uris = config?.serviceUriConfig ?? config?.uris ?? {};
      } catch { /* ignore */ }

      setWalletAPI(api);
      setWalletState({
        address: address || "connected",
        coinPublicKey,
        encryptionPublicKey: encryptionPublicKey || coinPublicKey,
        balance: { tDUST: dustBalance, NIGHT: "0" },
        uris: {
          indexerUri: uris.indexerUri ?? "",
          indexerWsUri: uris.indexerWsUri ?? "",
          proverServerUri: uris.proverServerUri ?? "http://localhost:6300",
          nodeUri: uris.nodeUri ?? "",
        },
      });
      setIsConnected(true);

      // Register user in Supabase on connect
      const { upsertUser } = await import("../lib/supabase");
      await upsertUser(address || coinPublicKey);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown wallet error";
      setError(msg);
      captureWalletError(err instanceof Error ? err : new Error(msg));
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnectWallet = useCallback(async () => {
    try {
      const provider = await discoverLaceProvider();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (provider as any)?.disconnect?.();
    } finally {
      setWalletState(null);
      setWalletAPI(null);
      setIsConnected(false);
    }
  }, []);

  return {
    walletState,
    walletAPI,
    isConnected,
    isConnecting,
    error,
    connectWallet,
    disconnectWallet,
  };
}
