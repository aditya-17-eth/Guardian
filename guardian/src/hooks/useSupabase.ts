import { useState, useEffect, useCallback } from "react";
import {
  getUserAgents,
  getRecentTransactions,
  type AgentRow,
  type TxRow,
} from "../lib/supabase";

export function useAgents(walletAddress: string | null) {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!walletAddress) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getUserAgents(walletAddress);
      setAgents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { agents, loading, error, refresh };
}

export function useTransactions(walletAddress: string | null) {
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!walletAddress) return;
    setLoading(true);
    try {
      const data = await getRecentTransactions(walletAddress);
      setTransactions(data as TxRow[]);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { transactions, loading, refresh };
}
