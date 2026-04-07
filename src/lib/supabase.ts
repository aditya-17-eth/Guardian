import { createClient } from "@supabase/supabase-js";

// ─── Env validation ───────────────────────────────────────────────────────────
// Fail fast at startup if required env vars are missing.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentRow {
  id?: string;
  agent_id_onchain: string;
  wallet_address: string;
  agent_name: string;
  category: 1 | 2 | 3;
  risk_tier: 1 | 2 | 3;
  aml_clear: boolean;
  active?: boolean;
  spending_limit: number;
  expires_at: number;
  created_at?: string;
}

export interface TxRow {
  id?: string;
  tx_hash: string;
  wallet_address: string;
  agent_id_onchain?: string;
  action: "register" | "revoke" | "verify" | "update";
  status: "pending" | "confirmed" | "failed";
  block_height?: number;
  created_at?: string;
}

export interface MetricsRow {
  total_users: number;
  active_agents: number;
  total_transactions: number;
  zk_credentials_issued: number;
  tx_last_24h: number;
}

// ─── User helpers ─────────────────────────────────────────────────────────────

export async function upsertUser(walletAddress: string): Promise<void> {
  const { error } = await supabase
    .from("guardian_users")
    .upsert(
      { wallet_address: walletAddress, last_seen_at: new Date().toISOString() },
      { onConflict: "wallet_address" }
    );
  if (error) console.error("upsertUser error:", error);
}

// ─── Agent helpers ────────────────────────────────────────────────────────────

export async function saveAgent(agent: AgentRow): Promise<void> {
  const { error } = await supabase.from("guardian_agents").insert(agent);
  if (error) throw error;
}

export async function getUserAgents(walletAddress: string): Promise<AgentRow[]> {
  const { data, error } = await supabase
    .from("guardian_agents")
    .select("*")
    .eq("wallet_address", walletAddress)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AgentRow[];
}

export async function updateAgentActiveStatus(
  agentIdOnchain: string,
  active: boolean
): Promise<void> {
  const { error } = await supabase
    .from("guardian_agents")
    .update({ active })
    .eq("agent_id_onchain", agentIdOnchain);
  if (error) throw error;
}

// ─── Transaction helpers ──────────────────────────────────────────────────────

export async function saveTx(tx: TxRow): Promise<void> {
  const { error } = await supabase.from("guardian_transactions").insert(tx);
  if (error) console.error("saveTx error:", error);
}

export async function updateTxStatus(
  txHash: string,
  status: "confirmed" | "failed",
  blockHeight?: number
): Promise<void> {
  await supabase
    .from("guardian_transactions")
    .update({ status, block_height: blockHeight })
    .eq("tx_hash", txHash);
}

export async function getRecentTransactions(
  walletAddress: string,
  limit = 10
): Promise<TxRow[]> {
  const { data, error } = await supabase
    .from("guardian_transactions")
    .select("*")
    .eq("wallet_address", walletAddress)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as TxRow[];
}

export async function getAllRecentTransactions(limit = 50): Promise<TxRow[]> {
  const { data, error } = await supabase
    .from("guardian_transactions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as TxRow[];
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

export async function getMetrics(): Promise<MetricsRow | null> {
  const { data } = await supabase
    .from("guardian_metrics")
    .select("*")
    .single();
  return data as MetricsRow | null;
}
