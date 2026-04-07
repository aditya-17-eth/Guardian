import { useEffect, useState, useCallback } from "react";
import { getMetrics, getAllRecentTransactions, type MetricsRow, type TxRow } from "../lib/supabase";
import styles from "./AdminPage.module.css";

const REFRESH_INTERVAL = 30_000;

export default function AdminPage() {
  const [metrics, setMetrics] = useState<MetricsRow | null>(null);
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [m, txs] = await Promise.all([getMetrics(), getAllRecentTransactions(50)]);
      setMetrics(m);
      setTransactions(txs);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Admin fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  const metricCards = metrics
    ? [
        { label: "Total Users", value: metrics.total_users },
        { label: "Active Agents", value: metrics.active_agents },
        { label: "Total Transactions", value: metrics.total_transactions },
        { label: "ZK Credentials Issued", value: metrics.zk_credentials_issued },
        { label: "Txns (24h)", value: metrics.tx_last_24h },
      ]
    : [];

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.logo}>
            <svg width="24" height="24" viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <circle cx="14" cy="14" r="13" stroke="#1d9e75" strokeWidth="2"/>
              <path d="M9 14l3.5 3.5L19 10" stroke="#1d9e75" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Guardian</span>
          </div>
          <span className="badge badge-accent">Admin</span>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.refreshTime} aria-live="polite">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </span>
          <button
            className="btn btn-secondary"
            onClick={fetchData}
            disabled={loading}
            aria-label="Refresh metrics"
          >
            {loading ? <span className="spinner" aria-hidden="true" /> : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
            )}
            Refresh
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <h1 className={styles.pageTitle}>Metrics Dashboard</h1>

        {/* Metric cards */}
        <section className={styles.metricsGrid} aria-label="Platform metrics">
          {loading && !metrics ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`card ${styles.metricCard} ${styles.skeleton}`} aria-hidden="true" />
            ))
          ) : (
            metricCards.map((m) => (
              <div key={m.label} className={`card ${styles.metricCard}`}>
                <span className={styles.metricLabel}>{m.label}</span>
                <span className={styles.metricValue}>{m.value?.toLocaleString() ?? "—"}</span>
              </div>
            ))
          )}
        </section>

        {/* Transactions table */}
        <section className={`card ${styles.tableSection}`} aria-label="Recent transactions">
          <h2 className={styles.tableTitle}>Recent Transactions</h2>

          {loading && transactions.length === 0 ? (
            <div className={styles.tableLoading} aria-live="polite" aria-busy="true">
              <span className="spinner" aria-hidden="true" />
              <span>Loading…</span>
            </div>
          ) : transactions.length === 0 ? (
            <p className={styles.empty}>No transactions yet</p>
          ) : (
            <div className={styles.tableWrapper} role="region" aria-label="Transactions table" tabIndex={0}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Tx Hash</th>
                    <th scope="col">Action</th>
                    <th scope="col">Status</th>
                    <th scope="col">Wallet</th>
                    <th scope="col">Block</th>
                    <th scope="col">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.tx_hash}>
                      <td className={styles.mono}>{tx.tx_hash.slice(0, 10)}…</td>
                      <td>
                        <span className="badge badge-info">{tx.action}</span>
                      </td>
                      <td>
                        <span className={`badge ${tx.status === "confirmed" ? "badge-success" : tx.status === "pending" ? "badge-warning" : "badge-danger"}`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className={styles.mono}>{tx.wallet_address.slice(0, 10)}…</td>
                      <td>{tx.block_height ?? "—"}</td>
                      <td className={styles.time}>
                        {tx.created_at ? new Date(tx.created_at).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
