import type { AgentRow } from "../lib/supabase";
import styles from "./SpendingLimits.module.css";

interface Props {
  agents: AgentRow[];
}

export default function SpendingLimits({ agents }: Props) {
  const activeAgents = agents.filter((a) => a.active);
  const totalLimit = activeAgents.reduce((sum, a) => sum + a.spending_limit, 0);

  return (
    <section className={`card ${styles.panel}`} aria-label="Spending limits">
      <h2 className={styles.title}>Spending Limits</h2>

      {activeAgents.length === 0 ? (
        <p className={styles.empty}>No active agents</p>
      ) : (
        <ul className={styles.list} role="list">
          {activeAgents.map((agent) => {
            const pct = totalLimit > 0 ? (agent.spending_limit / totalLimit) * 100 : 0;
            return (
              <li key={agent.agent_id_onchain} className={styles.item}>
                <div className={styles.itemHeader}>
                  <span className={styles.agentName}>{agent.agent_name}</span>
                  <span className={styles.amount}>
                    ${(agent.spending_limit / 100).toLocaleString()}
                  </span>
                </div>
                <div className={styles.barTrack} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${agent.agent_name} spending limit`}>
                  <div
                    className={styles.barFill}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={styles.pct}>{pct.toFixed(0)}% of total</span>
              </li>
            );
          })}
        </ul>
      )}

      <div className={styles.total}>
        <span>Total allocated</span>
        <span className={styles.totalAmount}>${(totalLimit / 100).toLocaleString()}</span>
      </div>
    </section>
  );
}
