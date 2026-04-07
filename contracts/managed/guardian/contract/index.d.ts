import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type AgentRecord = { credential_hash: Uint8Array;
                            category: bigint;
                            risk_tier: bigint;
                            aml_clear: boolean;
                            active: boolean;
                            expires_at: bigint;
                            created_at: bigint
                          };

export type Witnesses<PS> = {
  ownerAddress(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  spendingLimit(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  agentSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  registerAgent(context: __compactRuntime.CircuitContext<PS>,
                category_0: bigint,
                risk_tier_0: bigint,
                aml_clear_0: boolean,
                expires_at_0: bigint,
                created_at_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  verifyAgent(context: __compactRuntime.CircuitContext<PS>,
              agent_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  revokeAgent(context: __compactRuntime.CircuitContext<PS>,
              agent_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  updateAgentStatus(context: __compactRuntime.CircuitContext<PS>,
                    agent_id_0: Uint8Array,
                    new_status_0: boolean): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  registerAgent(context: __compactRuntime.CircuitContext<PS>,
                category_0: bigint,
                risk_tier_0: bigint,
                aml_clear_0: boolean,
                expires_at_0: bigint,
                created_at_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  verifyAgent(context: __compactRuntime.CircuitContext<PS>,
              agent_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  revokeAgent(context: __compactRuntime.CircuitContext<PS>,
              agent_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  updateAgentStatus(context: __compactRuntime.CircuitContext<PS>,
                    agent_id_0: Uint8Array,
                    new_status_0: boolean): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  registerAgent(context: __compactRuntime.CircuitContext<PS>,
                category_0: bigint,
                risk_tier_0: bigint,
                aml_clear_0: boolean,
                expires_at_0: bigint,
                created_at_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  verifyAgent(context: __compactRuntime.CircuitContext<PS>,
              agent_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, boolean>;
  revokeAgent(context: __compactRuntime.CircuitContext<PS>,
              agent_id_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  updateAgentStatus(context: __compactRuntime.CircuitContext<PS>,
                    agent_id_0: Uint8Array,
                    new_status_0: boolean): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  agent_registry: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): AgentRecord;
    [Symbol.iterator](): Iterator<[Uint8Array, AgentRecord]>
  };
  readonly credential_count: bigint;
  readonly total_transactions: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
