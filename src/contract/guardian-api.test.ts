/**
 * guardian-api.test.ts
 * Unit tests for pure helper functions in the contract API wrapper.
 * These run without any network or Midnight SDK dependencies.
 */

import { describe, it, expect } from "vitest";
import { bufToHex, hexToBuf, createPrivateState, createWitnesses } from "./helpers";

// ─── bufToHex / hexToBuf ──────────────────────────────────────────────────────

describe("bufToHex", () => {
  it("converts a zero buffer to all-zero hex string", () => {
    const buf = new Uint8Array(32);
    expect(bufToHex(buf)).toBe("0".repeat(64));
  });

  it("converts a known buffer correctly", () => {
    const buf = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    expect(bufToHex(buf)).toBe("deadbeef");
  });

  it("produces lowercase hex", () => {
    const buf = new Uint8Array([0xab, 0xcd, 0xef]);
    expect(bufToHex(buf)).toBe("abcdef");
  });

  it("pads single-digit bytes with leading zero", () => {
    const buf = new Uint8Array([0x01, 0x0f]);
    expect(bufToHex(buf)).toBe("010f");
  });
});

describe("hexToBuf", () => {
  it("converts hex string to correct bytes", () => {
    const buf = hexToBuf("deadbeef");
    expect(buf).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  it("handles 0x prefix", () => {
    const buf = hexToBuf("0xdeadbeef");
    expect(buf).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  it("round-trips with bufToHex", () => {
    const original = new Uint8Array(32);
    crypto.getRandomValues(original);
    const hex = bufToHex(original);
    const restored = hexToBuf(hex);
    expect(restored).toEqual(original);
  });

  it("produces correct length for 32-byte agent_id", () => {
    const hex = "a".repeat(64);
    expect(hexToBuf(hex)).toHaveLength(32);
  });
});

// ─── createPrivateState ───────────────────────────────────────────────────────

describe("createPrivateState", () => {
  it("stores all three private fields", () => {
    const ownerAddress = new Uint8Array(32).fill(1);
    const spendingLimit = 100_000n;
    const agentSecret = new Uint8Array(32).fill(2);

    const state = createPrivateState(ownerAddress, spendingLimit, agentSecret);

    expect(state.ownerAddress).toEqual(ownerAddress);
    expect(state.spendingLimit).toBe(spendingLimit);
    expect(state.agentSecret).toEqual(agentSecret);
  });
});

// ─── createWitnesses ─────────────────────────────────────────────────────────

describe("createWitnesses", () => {
  const ownerAddress = new Uint8Array(32).fill(0x11);
  const spendingLimit = 200_000n;
  const agentSecret = new Uint8Array(32).fill(0x22);
  const privateState = createPrivateState(ownerAddress, spendingLimit, agentSecret);

  const mockCtx = { privateState, ledger: {}, contractAddress: new Uint8Array(32) };

  it("ownerAddress witness returns correct value", () => {
    const witnesses = createWitnesses(privateState);
    const [nextState, value] = witnesses.ownerAddress(mockCtx as never);
    expect(value).toEqual(ownerAddress);
    expect(nextState).toBe(privateState);
  });

  it("spendingLimit witness returns correct value", () => {
    const witnesses = createWitnesses(privateState);
    const [nextState, value] = witnesses.spendingLimit(mockCtx as never);
    expect(value).toBe(spendingLimit);
    expect(nextState).toBe(privateState);
  });

  it("agentSecret witness returns correct value", () => {
    const witnesses = createWitnesses(privateState);
    const [nextState, value] = witnesses.agentSecret(mockCtx as never);
    expect(value).toEqual(agentSecret);
    expect(nextState).toBe(privateState);
  });

  it("witnesses are independent per private state instance", () => {
    const state1 = createPrivateState(new Uint8Array(32).fill(0x01), 1n, new Uint8Array(32).fill(0x01));
    const state2 = createPrivateState(new Uint8Array(32).fill(0x02), 2n, new Uint8Array(32).fill(0x02));

    const w1 = createWitnesses(state1);
    const w2 = createWitnesses(state2);

    const ctx1 = { ...mockCtx, privateState: state1 };
    const ctx2 = { ...mockCtx, privateState: state2 };

    const [, addr1] = w1.ownerAddress(ctx1 as never);
    const [, addr2] = w2.ownerAddress(ctx2 as never);

    expect(addr1).not.toEqual(addr2);
  });
});
