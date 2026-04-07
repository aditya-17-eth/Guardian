/**
 * helpers.ts
 * Pure helper functions for the Guardian contract API.
 * No Midnight SDK imports — safe to use in tests and browser.
 */

// ─── Private state ────────────────────────────────────────────────────────────

export interface GuardianPrivateState {
  ownerAddress: Uint8Array;   // 32 bytes — never stored on-chain
  spendingLimit: bigint;      // in USD cents — never stored on-chain
  agentSecret: Uint8Array;    // 32 bytes — used to derive agent_id
}

export function createPrivateState(
  ownerAddress: Uint8Array,
  spendingLimit: bigint,
  agentSecret: Uint8Array
): GuardianPrivateState {
  return { ownerAddress, spendingLimit, agentSecret };
}

// ─── Witness implementations ──────────────────────────────────────────────────

export interface WitnessLike<PS> {
  ownerAddress(ctx: { privateState: PS }): [PS, Uint8Array];
  spendingLimit(ctx: { privateState: PS }): [PS, bigint];
  agentSecret(ctx: { privateState: PS }): [PS, Uint8Array];
}

export function createWitnesses(
  _privateState: GuardianPrivateState
): WitnessLike<GuardianPrivateState> {
  return {
    ownerAddress: (ctx: { privateState: GuardianPrivateState }): [GuardianPrivateState, Uint8Array] =>
      [ctx.privateState, ctx.privateState.ownerAddress],

    spendingLimit: (ctx: { privateState: GuardianPrivateState }): [GuardianPrivateState, bigint] =>
      [ctx.privateState, ctx.privateState.spendingLimit],

    agentSecret: (ctx: { privateState: GuardianPrivateState }): [GuardianPrivateState, Uint8Array] =>
      [ctx.privateState, ctx.privateState.agentSecret],
  };
}

// ─── Hex / Buffer utilities ───────────────────────────────────────────────────

export function bufToHex(buf: Uint8Array): string {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBuf(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
