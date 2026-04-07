import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { useMidnightWallet } from "../hooks/useMidnightWallet";
import { useAgents, useTransactions } from "../hooks/useSupabase";
import { useAgentRegistry } from "../hooks/useAgentRegistry";
import type { AgentRow } from "../lib/supabase";
import Topbar from "../components/Topbar";
import AgentCard from "../components/AgentCard";
import SpendingLimits from "../components/SpendingLimits";
import AgentCredential from "../components/AgentCredential";
import ActivityFeed from "../components/ActivityFeed";
import TransactionStatus from "../components/TransactionStatus";
import styles from "./DashboardPage.module.css";

interface Props {
  wallet: ReturnType<typeof useMidnightWallet>;
}

export default function DashboardPage({ wallet }: Props) {
  const navigate = useNavigate();
  const registry = useAgentRegistry();
  const walletAddress = wallet.walletState?.address ?? "";
  const { agents, loading: agentsLoading, refresh: refreshAgents } = useAgents(walletAddress);
  const { transactions, loading: txLoading, refresh: refreshTx } = useTransactions(walletAddress);
  const [selectedAgent, setSelectedAgent] = useState<AgentRow | null>(null);

  // Auto-select first agent
  useEffect(() => {
    if (agents.length > 0 && !selectedAgent) setSelectedAgent(agents[0]);
  }, [agents, selectedAgent]);

  // Refresh after a successful action
  useEffect(() => {
    if (registry.txStep === "confirmed") {
      refreshAgents();
      refreshTx();
    }
  }, [registry.txStep, refreshAgents, refreshTx]);

  const activeCount = agents.filter((a) => a.active).length;
  const zkCount = agents.filter((a) => a.aml_clear).length;
  const alertCount = agents.filter((a) => !a.aml_clear || (!a.active && a.expires_at > Date.now() / 1000)).length;
  const totalSpent = agents.reduce((s, a) => s + a.spending_limit, 0);

  async function handleRevoke(agentId: string) {
    if (!confirm("Revoke this agent? This cannot be undone.")) return;
    await registry.revokeAgent(
      agentId,
      wallet.walletAPI,
      walletAddress,
      wallet.walletState?.coinPublicKey ?? "",
      wallet.walletState?.encryptionPublicKey
    );
  }

  async function handleToggle(agentId: string, active: boolean) {
    await registry.toggleAgentStatus(
      agentId,
      active,
      wallet.walletAPI,
      walletAddress,
      wallet.walletState?.coinPublicKey ?? "",
      wallet.walletState?.encryptionPublicKey
    );
  }

  const actionLoading = registry.txStep !== "idle" && registry.txStep !== "confirmed" && registry.txStep !== "failed";

  return (
    <div className={styles.page}>
      <Topbar wallet={wallet} />

      <main className={styles.main}>
        {/* Metrics row */}
        <section className={styles.metricsRow} aria-label="Summary metrics">
          {[
            { label: "Active Agents", value: activeCount, icon: "🤖", accent: true },
            { label: "Total Allocated", value: `$${(totalSpent / 100).toLocaleString()}`, icon: "💰" },
            { label: "ZK Credentials", value: zkCount, icon: "🔐", accent: true },
            { label: "Alerts", value: alertCount, icon: "⚠️", warn: alertCount > 0 },
          ].map((m) => (
            <div key={m.label} className={`card ${styles.metricCard}`}>
              <span className={styles.metricLabel}>{m.label}</span>
              <span className={`${styles.metricValue} ${m.accent ? styles.accentVal : ""} ${m.warn ? styles.warnVal : ""}`}>
                {m.value}
              </span>
            </div>
          ))}
        </section>

        {/* Agents grid */}
        <section className={styles.agentsSection} aria-label="My agents">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>My Agents</h2>
            <button
              className="btn btn-primary"
              onClick={() => navigate("/register")}
              aria-label="Add new agent"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Agent
            </button>
          </div>

          {agentsLoading ? (
            <div className={styles.loadingState} aria-live="polite" aria-busy="true">
              <span className="spinner" aria-hidden="true" />
              <span>Loading agents…</span>
            </div>
          ) : agents.length === 0 ? (
            <div className={`card ${styles.emptyState}`}>
              <p>No agents yet. Create your first AI agent to get started.</p>
              <button className="btn btn-primary" onClick={() => navigate("/register")}>
                Create Agent
              </button>
            </div>
          ) : (
            <div className={styles.agentsGrid}>
              {agents.map((agent) => (
                <AgentCard
                  key={agent.agent_id_onchain}
                  agent={agent}
                  selected={selectedAgent?.agent_id_onchain === agent.agent_id_onchain}
                  onSelect={setSelectedAgent}
                  onRevoke={handleRevoke}
                  onToggle={handleToggle}
                  loading={actionLoading}
                />
              ))}
            </div>
          )}
        </section>

        {/* Split row: spending + credential */}
        <section className={styles.splitRow} aria-label="Agent details">
          <SpendingLimits agents={agents} />
          <AgentCredential agent={selectedAgent} />
        </section>

        {/* Activity feed */}
        <ActivityFeed transactions={transactions} loading={txLoading} />

        {/* Action transaction status overlay */}
        {registry.txStep !== "idle" && (
          <div className={styles.txOverlay}>
            <TransactionStatus
              step={registry.txStep}
              txHash={registry.txHash}
              error={registry.txError}
            />
            {(registry.txStep === "confirmed" || registry.txStep === "failed") && (
              <button
                className="btn btn-secondary"
                onClick={registry.resetTx}
                style={{ marginTop: 12 }}
              >
                Dismiss
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
