/**
 * validator.ts
 * Client-side AI AML validator. Runs entirely in the browser.
 * NO data is ever sent to a server — core privacy guarantee of Guardian.
 */

import { z } from "zod";

// ─── Zod input schema (used for validation before contract calls) ─────────────

export const AgentInputSchema = z.object({
  agentName: z.string().min(1).max(32).regex(/^[a-zA-Z0-9 _-]+$/),
  agentType: z.enum(["trader", "assistant", "service"]),
  spendingLimit: z.number().int().min(100).max(10_000_000), // in cents
  expiryMonths: z.number().int().min(1).max(24),
});

export type AgentInputSchemaType = z.infer<typeof AgentInputSchema>;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentInput {
  agentName: string;
  agentType: "trader" | "assistant" | "service";
  spendingLimit: number; // in USD cents
  walletHistory: Transaction[];
  description?: string;
}

export interface Transaction {
  hash: string;
  amount: number; // in USD cents
  to: string;
  from: string;
  timestamp: number; // Unix ms
  type: "send" | "receive" | "swap";
}

export interface ValidationResult {
  aml_clear: boolean;
  risk_tier: 1 | 2 | 3;
  category: 1 | 2 | 3;
  flags: AMLFlag[];
  score: number; // 0–100
  recommendation: "approve" | "review" | "reject";
  reasoning: string;
}

export type AMLFlag =
  | "MIXER_INTERACTION"
  | "RAPID_SEQUENCE"
  | "LARGE_TX_VOLUME"
  | "UNUSUAL_PATTERN"
  | "HIGH_FREQUENCY";

// ─── Main validation function ─────────────────────────────────────────────────

export async function validateAgent(input: AgentInput): Promise<ValidationResult> {
  const flags: AMLFlag[] = [];

  // Rule 1: Rapid transaction sequence (>10 txns within a 60s window)
  if (detectRapidSequence(input.walletHistory)) {
    flags.push("RAPID_SEQUENCE");
  }

  // Rule 2: Large transaction volume (>5 txns over $10,000 each)
  const largeTxns = input.walletHistory.filter((tx) => tx.amount > 1_000_000); // $10k in cents
  if (largeTxns.length > 5) {
    flags.push("LARGE_TX_VOLUME");
  }

  // Rule 3: Mixer pattern detection (known mixer address signatures)
  if (detectMixerPatterns(input.walletHistory)) {
    flags.push("MIXER_INTERACTION");
  }

  // Rule 4: High frequency trading (>100 txns/day average)
  if (detectHighFrequency(input.walletHistory)) {
    flags.push("HIGH_FREQUENCY");
  }

  // Rule 5: Unusual pattern — circular flows (send then receive same amount within 5 min)
  if (detectUnusualPattern(input.walletHistory)) {
    flags.push("UNUSUAL_PATTERN");
  }

  const aml_clear = flags.length === 0;
  const risk_tier = computeRiskTier(input, flags);
  const category = ({ trader: 1, assistant: 2, service: 3 } as const)[input.agentType];
  const score = Math.max(0, 100 - flags.length * 25 - (risk_tier - 1) * 10);
  const recommendation =
    aml_clear && risk_tier <= 2 ? "approve" : aml_clear ? "review" : "reject";

  return {
    aml_clear,
    risk_tier,
    category,
    flags,
    score,
    recommendation,
    reasoning: generateReasoning(flags, risk_tier, score),
  };
}

// ─── Detection helpers ────────────────────────────────────────────────────────

/** Detects 10+ transactions within any 60-second window */
export function detectRapidSequence(txs: Transaction[]): boolean {
  if (txs.length < 10) return false;
  const sorted = [...txs].sort((a, b) => a.timestamp - b.timestamp);
  for (let i = 0; i <= sorted.length - 10; i++) {
    if (sorted[i + 9].timestamp - sorted[i].timestamp < 60_000) return true;
  }
  return false;
}

/** Detects interactions with known mixer contract signatures */
export function detectMixerPatterns(txs: Transaction[]): boolean {
  const MIXER_SIGNATURES = ["0x000000000000000000000000", "mixer", "tornado"];
  return txs.some((tx) =>
    MIXER_SIGNATURES.some(
      (sig) =>
        tx.to.toLowerCase().includes(sig) || tx.from.toLowerCase().includes(sig)
    )
  );
}

/** Detects average transaction rate > 100 txns/day */
export function detectHighFrequency(txs: Transaction[]): boolean {
  if (txs.length < 2) return false;
  const sorted = [...txs].sort((a, b) => a.timestamp - b.timestamp);
  const durationDays =
    (sorted[sorted.length - 1].timestamp - sorted[0].timestamp) / 86_400_000;
  return durationDays > 0 && txs.length / durationDays > 100;
}

/**
 * Detects unusual circular flow patterns:
 * A send followed by a receive of the same amount (±5%) within 5 minutes.
 * This is a common layering technique in money laundering.
 */
export function detectUnusualPattern(txs: Transaction[]): boolean {
  const sends = txs.filter((tx) => tx.type === "send");
  const receives = txs.filter((tx) => tx.type === "receive");

  for (const send of sends) {
    for (const recv of receives) {
      const timeDiff = Math.abs(recv.timestamp - send.timestamp);
      const amountDiff = Math.abs(recv.amount - send.amount) / send.amount;
      // Same amount (within 5%) within 5 minutes = suspicious circular flow
      if (timeDiff < 300_000 && amountDiff < 0.05 && send.amount > 10_000) {
        return true;
      }
    }
  }
  return false;
}

// ─── Risk tier computation ────────────────────────────────────────────────────

export function computeRiskTier(input: AgentInput, flags: AMLFlag[]): 1 | 2 | 3 {
  if (flags.includes("MIXER_INTERACTION")) return 3;
  if (flags.length >= 2) return 3;
  if (flags.length === 1 || input.spendingLimit > 500_000) return 2; // >$5k
  return 1;
}

// ─── Reasoning generator ──────────────────────────────────────────────────────

export function generateReasoning(
  flags: AMLFlag[],
  risk_tier: number,
  score: number
): string {
  if (flags.length === 0) {
    return `Clean transaction history. Risk tier ${risk_tier}. Score: ${score}/100. Agent approved.`;
  }

  const flagDescriptions: Record<AMLFlag, string> = {
    MIXER_INTERACTION: "interaction with known mixer contracts",
    RAPID_SEQUENCE: "rapid transaction sequence (>10 txns in 60s)",
    LARGE_TX_VOLUME: "high volume of large transactions (>$10k each)",
    UNUSUAL_PATTERN: "circular flow pattern detected (possible layering)",
    HIGH_FREQUENCY: "high-frequency trading (>100 txns/day average)",
  };

  const descriptions = flags.map((f) => flagDescriptions[f]).join("; ");
  return `Found ${flags.length} flag(s): ${descriptions}. Risk tier ${risk_tier}. Score: ${score}/100. Manual review recommended.`;
}

// ─── Mock data generator (for demo/testing) ──────────────────────────────────

export function generateMockTransactions(count = 20): Transaction[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    hash: `0x${Math.random().toString(16).slice(2).padEnd(64, "0")}`,
    amount: Math.floor(Math.random() * 50_000) + 100,
    to: `mn_addr_preprod1${Math.random().toString(36).slice(2, 12)}`,
    from: `mn_addr_preprod1${Math.random().toString(36).slice(2, 12)}`,
    timestamp: now - i * 3_600_000,
    type: (["send", "receive", "swap"] as const)[Math.floor(Math.random() * 3)],
  }));
}

export function generateCleanMockTransactions(count = 10): Transaction[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    hash: `0x${i.toString(16).padStart(64, "0")}`,
    amount: Math.floor(Math.random() * 10_000) + 100, // small amounts
    to: `mn_addr_preprod1clean${i}`,
    from: `mn_addr_preprod1user`,
    timestamp: now - i * 86_400_000, // 1 per day
    type: "send" as const,
  }));
}
