import type { TxRow } from "../lib/supabase";
import styles from "./ActivityFeed.module.css";

interface Props {
  transactions: TxRow[];
  loading?: boolean;
}

const ACTION_LABELS: Record<string, string> = {
  register: "Registered agent",
  revoke: "Revoked agent",
  verify: "Verified agent",
  update: "Updated status",
};

const STATUS_CLASS: Record<string, string> = {
  confirmed: "badge-success",
  pending: "badge-warning",
  failed: "badge-danger",
};

function timeAgo(dateStr?: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ActivityFeed({ transactions, loading }: Props) {
  return (
    <section className={`card ${styles.panel}`} aria-label="Activity feed">
      <h2 className={styles.title}>Recent Activity</h2>

      {loading && (
        <div className={styles.loadingRow} aria-live="polite" aria-busy="true">
          <span className="spinner" aria-hidden="true" />
          <span>Loading transactions…</span>
        </div>
      )}

      {!loading && transactions.length === 0 && (
        <p className={styles.empty}>No transactions yet</p>
      )}

      {!loading && transactions.length > 0 && (
        <ul className={styles.list} role="list">
          {transactions.map((tx) => (
            <li key={tx.tx_hash} className={styles.item}>
              <div className={styles.itemLeft}>
                <span className={styles.action}>
                  {ACTION_LABELS[tx.action] ?? tx.action}
                </span>
                <span className={styles.hash} title={tx.tx_hash}>
                  {tx.tx_hash.slice(0, 8)}…{tx.tx_hash.slice(-6)}
                </span>
              </div>
              <div className={styles.itemRight}>
                <span className={`badge ${STATUS_CLASS[tx.status]}`}>{tx.status}</span>
                <span className={styles.time}>{timeAgo(tx.created_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
