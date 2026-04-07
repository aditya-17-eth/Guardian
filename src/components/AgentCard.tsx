import type { AgentRow } from "../lib/supabase";
import styles from "./AgentCard.module.css";

interface Props {
  agent: AgentRow;
  selected?: boolean;
  onSelect: (agent: AgentRow) => void;
  onRevoke: (agentId: string) => void;
  onToggle: (agentId: string, active: boolean) => void;
  loading?: boolean;
}

const CATEGORY_LABELS: Record<number, string> = { 1: "DCA Trader", 2: "Yield Scout", 3: "Portfolio Rebalancer" };
const RISK_LABELS: Record<number, string> = { 1: "Low", 2: "Medium", 3: "High" };
const RISK_CLASSES: Record<number, string> = { 1: "badge-success", 2: "badge-warning", 3: "badge-danger" };

export default function AgentCard({ agent, selected, onSelect, onRevoke, onToggle, loading }: Props) {
  const riskClass = RISK_CLASSES[agent.risk_tier] ?? "badge-info";
  const isExpired = agent.expires_at < Date.now() / 1000;

  return (
    <article
      className={`card ${styles.card} ${selected ? styles.selected : ""} ${!agent.active ? styles.inactive : ""}`}
      onClick={() => onSelect(agent)}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Agent ${agent.agent_name}`}
      onKeyDown={(e) => e.key === "Enter" && onSelect(agent)}
    >
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.nameRow}>
          <span className={styles.name}>{agent.agent_name}</span>
          {!agent.active && <span className="badge badge-warning">Paused</span>}
          {isExpired && <span className="badge badge-danger">Expired</span>}
        </div>
        <span className={`badge ${riskClass}`}>Tier {RISK_LABELS[agent.risk_tier]}</span>
      </div>

      {/* Category + AML */}
      <div className={styles.meta}>
        <span className={styles.category}>{CATEGORY_LABELS[agent.category] ?? "Custom"}</span>
        <span className={`badge ${agent.aml_clear ? "badge-success" : "badge-danger"}`}>
          {agent.aml_clear ? "AML Clear" : "AML Flag"}
        </span>
      </div>

      {/* Spending */}
      <div className={styles.spending}>
        <span className={styles.spendLabel}>Spending limit</span>
        <span className={styles.spendValue}>
          ${(agent.spending_limit / 100).toLocaleString()}
        </span>
      </div>

      {/* ZK credential hash (truncated) */}
      <div className={styles.credHash} title={agent.agent_id_onchain}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <span>{agent.agent_id_onchain.slice(0, 8)}…{agent.agent_id_onchain.slice(-6)}</span>
      </div>

      {/* Actions */}
      <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
        <button
          className={`btn btn-secondary ${styles.actionBtn}`}
          onClick={() => onToggle(agent.agent_id_onchain, !agent.active)}
          disabled={loading}
          aria-label={agent.active ? "Pause agent" : "Resume agent"}
        >
          {agent.active ? "Pause" : "Resume"}
        </button>
        <button
          className={`btn btn-danger ${styles.actionBtn}`}
          onClick={() => onRevoke(agent.agent_id_onchain)}
          disabled={loading || !agent.active}
          aria-label="Revoke agent"
        >
          Revoke
        </button>
      </div>
    </article>
  );
}
