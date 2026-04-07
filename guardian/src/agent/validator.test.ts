import { describe, it, expect } from "vitest";
import {
  validateAgent,
  detectRapidSequence,
  detectMixerPatterns,
  detectHighFrequency,
  detectUnusualPattern,
  computeRiskTier,
  generateReasoning,
  generateMockTransactions,
  generateCleanMockTransactions,
  AgentInputSchema,
  type AgentInput,
  type Transaction,
} from "./validator";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseInput: AgentInput = {
  agentName: "Test Bot",
  agentType: "trader",
  spendingLimit: 10_000, // $100
  walletHistory: [],
};

const now = Date.now();

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    hash: `0x${Math.random().toString(16).slice(2).padEnd(64, "0")}`,
    amount: 1_000,
    to: "mn_addr_preprod1dest",
    from: "mn_addr_preprod1src",
    timestamp: now,
    type: "send",
    ...overrides,
  };
}

// ─── validateAgent ────────────────────────────────────────────────────────────

describe("validateAgent", () => {
  it("approves a clean agent with empty history", async () => {
    const result = await validateAgent(baseInput);
    expect(result.aml_clear).toBe(true);
    expect(result.flags).toHaveLength(0);
    expect(result.recommendation).toBe("approve");
    expect(result.score).toBe(100);
    expect(result.risk_tier).toBe(1);
  });

  it("maps agentType to correct category", async () => {
    const trader = await validateAgent({ ...baseInput, agentType: "trader" });
    const assistant = await validateAgent({ ...baseInput, agentType: "assistant" });
    const service = await validateAgent({ ...baseInput, agentType: "service" });
    expect(trader.category).toBe(1);
    expect(assistant.category).toBe(2);
    expect(service.category).toBe(3);
  });

  it("rejects when mixer interaction detected", async () => {
    const txs = [makeTx({ to: "tornado_contract_addr" })];
    const result = await validateAgent({ ...baseInput, walletHistory: txs });
    expect(result.flags).toContain("MIXER_INTERACTION");
    expect(result.aml_clear).toBe(false);
    expect(result.recommendation).toBe("reject");
    expect(result.risk_tier).toBe(3);
  });

  it("flags RAPID_SEQUENCE for 10+ txns in 60s", async () => {
    const rapidTxns = Array.from({ length: 12 }, (_, i) =>
      makeTx({ timestamp: now + i * 1_000 }) // 1s apart
    );
    const result = await validateAgent({ ...baseInput, walletHistory: rapidTxns });
    expect(result.flags).toContain("RAPID_SEQUENCE");
    expect(result.aml_clear).toBe(false);
  });

  it("flags LARGE_TX_VOLUME for >5 txns over $10k", async () => {
    const largeTxns = Array.from({ length: 6 }, () =>
      makeTx({ amount: 1_500_000 }) // $15k each
    );
    const result = await validateAgent({ ...baseInput, walletHistory: largeTxns });
    expect(result.flags).toContain("LARGE_TX_VOLUME");
  });

  it("flags HIGH_FREQUENCY for >100 txns/day", async () => {
    // 200 txns over 1 day = 200/day
    const txns = Array.from({ length: 200 }, (_, i) =>
      makeTx({ timestamp: now - i * 432_000 }) // spread over ~1 day
    );
    const result = await validateAgent({ ...baseInput, walletHistory: txns });
    expect(result.flags).toContain("HIGH_FREQUENCY");
  });

  it("flags UNUSUAL_PATTERN for circular flows", async () => {
    const txns = [
      makeTx({ type: "send", amount: 50_000, timestamp: now }),
      makeTx({ type: "receive", amount: 51_000, timestamp: now + 60_000 }), // same amount ±5%, within 5min
    ];
    const result = await validateAgent({ ...baseInput, walletHistory: txns });
    expect(result.flags).toContain("UNUSUAL_PATTERN");
  });

  it("score decreases with each flag", async () => {
    const clean = await validateAgent(baseInput);
    const oneFlag = await validateAgent({
      ...baseInput,
      walletHistory: [makeTx({ to: "mixer_addr" })],
    });
    expect(clean.score).toBeGreaterThan(oneFlag.score);
  });

  it("recommendation is approve when aml_clear and risk_tier is 2", async () => {
    // High spending limit → risk_tier 2, but no flags → aml_clear true
    // Per spec: aml_clear && risk_tier <= 2 → "approve"
    const result = await validateAgent({
      ...baseInput,
      spendingLimit: 600_000, // >$5k triggers tier 2
    });
    expect(result.aml_clear).toBe(true);
    expect(result.risk_tier).toBe(2);
    expect(result.recommendation).toBe("approve");
  });
});

// ─── detectRapidSequence ──────────────────────────────────────────────────────

describe("detectRapidSequence", () => {
  it("returns false for fewer than 10 txns", () => {
    const txs = Array.from({ length: 9 }, (_, i) =>
      makeTx({ timestamp: now + i * 1_000 })
    );
    expect(detectRapidSequence(txs)).toBe(false);
  });

  it("returns true for exactly 10 txns within 60s", () => {
    const txs = Array.from({ length: 10 }, (_, i) =>
      makeTx({ timestamp: now + i * 5_000 }) // 5s apart = 45s total
    );
    expect(detectRapidSequence(txs)).toBe(true);
  });

  it("returns false for 10 txns spread over >60s", () => {
    const txs = Array.from({ length: 10 }, (_, i) =>
      makeTx({ timestamp: now + i * 10_000 }) // 10s apart = 90s total
    );
    expect(detectRapidSequence(txs)).toBe(false);
  });

  it("handles unsorted input correctly", () => {
    const txs = [
      makeTx({ timestamp: now + 50_000 }),
      makeTx({ timestamp: now + 10_000 }),
      makeTx({ timestamp: now + 20_000 }),
      makeTx({ timestamp: now + 30_000 }),
      makeTx({ timestamp: now + 40_000 }),
      makeTx({ timestamp: now + 5_000 }),
      makeTx({ timestamp: now + 15_000 }),
      makeTx({ timestamp: now + 25_000 }),
      makeTx({ timestamp: now + 35_000 }),
      makeTx({ timestamp: now + 45_000 }),
    ];
    // 10 txns from now+5000 to now+50000 = 45s window → true
    expect(detectRapidSequence(txs)).toBe(true);
  });
});

// ─── detectMixerPatterns ──────────────────────────────────────────────────────

describe("detectMixerPatterns", () => {
  it("returns false for clean addresses", () => {
    const txs = [makeTx({ to: "mn_addr_preprod1clean", from: "mn_addr_preprod1user" })];
    expect(detectMixerPatterns(txs)).toBe(false);
  });

  it("detects 'tornado' in destination address", () => {
    const txs = [makeTx({ to: "tornado_cash_contract" })];
    expect(detectMixerPatterns(txs)).toBe(true);
  });

  it("detects 'mixer' in source address", () => {
    const txs = [makeTx({ from: "mixer_protocol_v2" })];
    expect(detectMixerPatterns(txs)).toBe(true);
  });

  it("detects zero-address pattern", () => {
    const txs = [makeTx({ to: "0x000000000000000000000000dead" })];
    expect(detectMixerPatterns(txs)).toBe(true);
  });

  it("is case-insensitive", () => {
    const txs = [makeTx({ to: "TORNADO_CASH" })];
    expect(detectMixerPatterns(txs)).toBe(true);
  });
});

// ─── detectHighFrequency ──────────────────────────────────────────────────────

describe("detectHighFrequency", () => {
  it("returns false for fewer than 2 txns", () => {
    expect(detectHighFrequency([makeTx()])).toBe(false);
    expect(detectHighFrequency([])).toBe(false);
  });

  it("returns false for normal frequency", () => {
    // 10 txns over 10 days = 1/day
    const txs = Array.from({ length: 10 }, (_, i) =>
      makeTx({ timestamp: now - i * 86_400_000 })
    );
    expect(detectHighFrequency(txs)).toBe(false);
  });

  it("returns true for >100 txns/day", () => {
    // 200 txns over 1 day
    const txs = Array.from({ length: 200 }, (_, i) =>
      makeTx({ timestamp: now - i * 432_000 }) // ~0.5 day span
    );
    expect(detectHighFrequency(txs)).toBe(true);
  });
});

// ─── detectUnusualPattern ─────────────────────────────────────────────────────

describe("detectUnusualPattern", () => {
  it("returns false for normal send/receive pairs", () => {
    const txs = [
      makeTx({ type: "send", amount: 10_000, timestamp: now }),
      makeTx({ type: "receive", amount: 50_000, timestamp: now + 3_600_000 }), // different amount, 1hr later
    ];
    expect(detectUnusualPattern(txs)).toBe(false);
  });

  it("detects circular flow: same amount within 5 minutes", () => {
    const txs = [
      makeTx({ type: "send", amount: 100_000, timestamp: now }),
      makeTx({ type: "receive", amount: 101_000, timestamp: now + 120_000 }), // ~1% diff, 2min later
    ];
    expect(detectUnusualPattern(txs)).toBe(true);
  });

  it("ignores small amounts below $100", () => {
    const txs = [
      makeTx({ type: "send", amount: 5_000, timestamp: now }),
      makeTx({ type: "receive", amount: 5_100, timestamp: now + 60_000 }),
    ];
    expect(detectUnusualPattern(txs)).toBe(false);
  });

  it("ignores pairs outside 5-minute window", () => {
    const txs = [
      makeTx({ type: "send", amount: 100_000, timestamp: now }),
      makeTx({ type: "receive", amount: 100_500, timestamp: now + 600_000 }), // 10 min later
    ];
    expect(detectUnusualPattern(txs)).toBe(false);
  });
});

// ─── computeRiskTier ─────────────────────────────────────────────────────────

describe("computeRiskTier", () => {
  it("returns tier 1 for clean history with low spending", () => {
    expect(computeRiskTier({ ...baseInput, spendingLimit: 10_000 }, [])).toBe(1);
  });

  it("returns tier 2 for high spending limit (>$5k)", () => {
    expect(computeRiskTier({ ...baseInput, spendingLimit: 600_000 }, [])).toBe(2);
  });

  it("returns tier 2 for single flag", () => {
    expect(computeRiskTier(baseInput, ["RAPID_SEQUENCE"])).toBe(2);
  });

  it("returns tier 3 for mixer interaction", () => {
    expect(computeRiskTier(baseInput, ["MIXER_INTERACTION"])).toBe(3);
  });

  it("returns tier 3 for 2+ flags", () => {
    expect(computeRiskTier(baseInput, ["RAPID_SEQUENCE", "HIGH_FREQUENCY"])).toBe(3);
  });
});

// ─── generateReasoning ───────────────────────────────────────────────────────

describe("generateReasoning", () => {
  it("returns approval message for no flags", () => {
    const msg = generateReasoning([], 1, 100);
    expect(msg).toContain("approved");
    expect(msg).toContain("100/100");
  });

  it("includes flag descriptions for flagged agents", () => {
    const msg = generateReasoning(["MIXER_INTERACTION", "RAPID_SEQUENCE"], 3, 25);
    expect(msg).toContain("mixer");
    expect(msg).toContain("rapid");
    expect(msg).toContain("25/100");
  });
});

// ─── AgentInputSchema ─────────────────────────────────────────────────────────

describe("AgentInputSchema", () => {
  it("accepts valid input", () => {
    const result = AgentInputSchema.safeParse({
      agentName: "DCA Bot",
      agentType: "trader",
      spendingLimit: 100_000,
      expiryMonths: 6,
    });
    expect(result.success).toBe(true);
  });

  it("rejects agent name with special characters", () => {
    const result = AgentInputSchema.safeParse({
      agentName: "Bot<script>",
      agentType: "trader",
      spendingLimit: 100_000,
      expiryMonths: 6,
    });
    expect(result.success).toBe(false);
  });

  it("rejects spending limit below minimum", () => {
    const result = AgentInputSchema.safeParse({
      agentName: "Bot",
      agentType: "trader",
      spendingLimit: 50, // below $1
      expiryMonths: 6,
    });
    expect(result.success).toBe(false);
  });

  it("rejects spending limit above maximum", () => {
    const result = AgentInputSchema.safeParse({
      agentName: "Bot",
      agentType: "trader",
      spendingLimit: 20_000_000, // above $100k
      expiryMonths: 6,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid agentType", () => {
    const result = AgentInputSchema.safeParse({
      agentName: "Bot",
      agentType: "hacker",
      spendingLimit: 100_000,
      expiryMonths: 6,
    });
    expect(result.success).toBe(false);
  });
});

// ─── Mock data generators ─────────────────────────────────────────────────────

describe("generateMockTransactions", () => {
  it("returns correct count", () => {
    expect(generateMockTransactions(15)).toHaveLength(15);
  });

  it("returns valid transaction shape", () => {
    const txs = generateMockTransactions(1);
    expect(txs[0]).toHaveProperty("hash");
    expect(txs[0]).toHaveProperty("amount");
    expect(txs[0]).toHaveProperty("timestamp");
    expect(txs[0]).toHaveProperty("type");
  });
});

describe("generateCleanMockTransactions", () => {
  it("generates transactions that pass AML validation", async () => {
    const txs = generateCleanMockTransactions(10);
    const result = await validateAgent({ ...baseInput, walletHistory: txs });
    expect(result.aml_clear).toBe(true);
    expect(result.flags).toHaveLength(0);
  });
});
