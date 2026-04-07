import type { AgentRow } from "../lib/supabase";
import styles from "./AgentCredential.module.css";

interface Props {
  agent: AgentRow | null;
}

const CATEGORY_LABELS: Record<number, string> = { 1: "DCA Trader", 2: "Yield Scout", 3: "Portfolio Rebalancer" };
const RISK_LABELS: Record<number, string> = { 1: "Low", 2: "Medium", 3: "High" };

export default function AgentCredential({ agent }: Props) {
  if (!agent) {
    return (
      <section className={`card ${styles.panel}`} aria-label="ZK Credential">
        <h2 className={styles.title}>ZK Credential</h2>
        <p className={styles.empty}>Select an agent to view its credential</p>
      </section>
    );
  }

  const expiryDate = new Date(agent.expires_at * 1000).toLocaleDateString();
  const isExpired = agent.expires_at < Date.now() / 1000;

  const rows = [
    { label: "Category", value: CATEGORY_LABELS[agent.category] ?? "Custom", public: true },
    { label: "Risk Tier", value: RISK_LABELS[agent.risk_tier] ?? "—", public: true },
    { label: "AML Status", value: agent.aml_clear ? "Clear" : "Flagged", public: true },
    { label: "Expires", value: expiryDate, public: true },
    { label: "Owner Address", value: "🔒 Private (ZK proof)", public: false },
    { label: "Spending Limit", value: "🔒 Private (ZK proof)", public: false },
    { label: "Wallet History", value: "🔒 Never stored", public: false },
  ];

  return (
    <section className={`card ${styles.panel}`} aria-label="ZK Credential details">
      <div className={styles.header}>
        <h2 className={styles.title}>ZK Credential</h2>
        <span className={`badge ${agent.active && !isExpired ? "badge-success" : "badge-danger"}`}>
          {agent.active && !isExpired ? "Active" : isExpired ? "Expired" : "Revoked"}
        </span>
      </div>

      <div className={styles.agentName}>{agent.agent_name}</div>

      <div className={styles.credId} title={agent.agent_id_onchain}>
        <span className={styles.credLabel}>On-chain ID</span>
        <span className={styles.credValue}>
          {agent.agent_id_onchain.slice(0, 12)}…{agent.agent_id_onchain.slice(-8)}
        </span>
      </div>

      <table className={styles.table} aria-label="Credential fields">
        <thead>
          <tr>
            <th>Field</th>
            <th>Value</th>
            <th>On-chain</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td className={row.public ? styles.publicVal : styles.privateVal}>{row.value}</td>
              <td>
                {row.public ? (
                  <span className="badge badge-success" aria-label="Public on-chain">Public</span>
                ) : (
                  <span className="badge badge-accent" aria-label="Private, ZK proof only">ZK only</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
