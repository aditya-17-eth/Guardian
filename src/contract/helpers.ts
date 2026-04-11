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
  initialPrivateState: GuardianPrivateState
): WitnessLike<GuardianPrivateState> {
  // Store raw bytes as plain array (avoids Uint8Array prototype issues)
  const ownerBytes = initialPrivateState.ownerAddress instanceof Uint8Array
    ? Array.from(initialPrivateState.ownerAddress.slice(0, 32))
    : new Array(32).fill(0);

  const secretBytes = initialPrivateState.agentSecret instanceof Uint8Array
    ? Array.from(initialPrivateState.agentSecret.slice(0, 32))
    : Array.from(crypto.getRandomValues(new Uint8Array(32)));

  const spendingLimitValue = typeof initialPrivateState.spendingLimit === 'bigint'
    ? initialPrivateState.spendingLimit
    : BigInt(initialPrivateState.spendingLimit as unknown as string | number || 0);

  console.log('[Guardian] Witnesses initialized');

  return {
    ownerAddress: (ctx: { privateState: GuardianPrivateState }): [GuardianPrivateState, Uint8Array] => {
      // Create fresh Uint8Array from raw bytes - avoids SDK corruption
      const fresh = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        fresh[i] = ownerBytes[i] ?? 0;
      }
      return [ctx.privateState, fresh];
    },

    spendingLimit: (ctx: { privateState: GuardianPrivateState }): [GuardianPrivateState, bigint] => {
      return [ctx.privateState, spendingLimitValue];
    },

    agentSecret: (ctx: { privateState: GuardianPrivateState }): [GuardianPrivateState, Uint8Array] => {
      // Create fresh Uint8Array from raw bytes - avoids SDK corruption
      const fresh = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        fresh[i] = secretBytes[i] ?? 0;
      }
      return [ctx.privateState, fresh];
    },
  };
}

// ─── Hex / Buffer utilities ───────────────────────────────────────────────────

export function bufToHex(buf: Uint8Array): string {
  if (!buf || !(buf instanceof Uint8Array)) {
    console.error('[Guardian] bufToHex received invalid input:', buf, 'type:', typeof buf);
    throw new Error(`bufToHex expected Uint8Array, got ${typeof buf}`);
  }
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBuf(hex: string): Uint8Array {
  if (typeof hex !== 'string') {
    console.error('[Guardian] hexToBuf received non-string:', hex, 'type:', typeof hex);
    throw new Error(`hexToBuf expected string, got ${typeof hex}`);
  }
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  // Validate hex string
  if (!/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error(`Invalid hex string: ${clean.substring(0, 20)}...`);
  }
  if (clean.length % 2 !== 0) {
    throw new Error(`Hex string must have even length, got ${clean.length}`);
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    if (isNaN(byte)) {
      throw new Error(`Invalid byte at position ${i * 2}: "${clean.slice(i * 2, i * 2 + 2)}"`);
    }
    bytes[i] = byte;
  }
  return bytes;
}
