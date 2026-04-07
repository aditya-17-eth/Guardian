// Network configuration for Midnight Preprod testnet
export const MIDNIGHT_NETWORK = import.meta.env.VITE_MIDNIGHT_NETWORK ?? "preprod";
export const MIDNIGHT_SDK_NETWORK_ID =
  MIDNIGHT_NETWORK.toLowerCase() === "preprod" ? "test" : MIDNIGHT_NETWORK;

export const INDEXER_URI =
  import.meta.env.VITE_INDEXER_URI ?? "https://indexer.preprod.midnight.network";

export const INDEXER_WS_URI =
  import.meta.env.VITE_INDEXER_WS_URI ?? "wss://indexer.preprod.midnight.network";

export const PROOF_SERVER_URI = "http://localhost:6300";

export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS ?? "";

// Agent category mapping
export const AGENT_CATEGORIES = {
  1: "DCA Trader",
  2: "Yield Scout",
  3: "Portfolio Rebalancer",
} as const;

// Risk tier labels
export const RISK_TIERS = {
  1: "Low",
  2: "Medium",
  3: "High",
} as const;

// Spending limit bounds (in USD cents)
export const MIN_SPENDING_LIMIT_CENTS = 100;       // $1
export const MAX_SPENDING_LIMIT_CENTS = 10_000_000; // $100,000

// Debounce for contract interactions (ms)
export const CONTRACT_DEBOUNCE_MS = 2000;
