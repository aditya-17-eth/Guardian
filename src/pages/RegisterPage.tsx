import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { useMidnightWallet } from "../hooks/useMidnightWallet";
import { validateAgent, generateMockTransactions, type ValidationResult } from "../agent/validator";
import { AgentInputSchema } from "../agent/validator";
import { useAgentRegistry } from "../hooks/useAgentRegistry";
import TransactionStatus from "../components/TransactionStatus";
import Topbar from "../components/Topbar";
import styles from "./RegisterPage.module.css";

interface Props {
  wallet: ReturnType<typeof useMidnightWallet>;
}

interface FormData {
  agentName: string;
  agentType: "trader" | "assistant" | "service";
  spendingLimit: string;
  expiryMonths: string;
}

const AGENT_TYPE_OPTIONS = [
  { value: "trader",    label: "DCA Trader" },
  { value: "assistant", label: "Yield Scout" },
  { value: "service",   label: "Portfolio Rebalancer" },
];

const EXPIRY_OPTIONS = [
  { value: "3",  label: "3 months" },
  { value: "6",  label: "6 months" },
  { value: "12", label: "1 year" },
];

export default function RegisterPage({ wallet }: Props) {
  const navigate = useNavigate();
  const registry = useAgentRegistry();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<FormData>({
    agentName: "",
    agentType: "trader",
    spendingLimit: "1000",
    expiryMonths: "6",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  function updateForm(field: keyof FormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setFormErrors((e) => ({ ...e, [field]: "" }));
  }

  function validateStep1(): boolean {
    const parsed = AgentInputSchema.safeParse({
      agentName: form.agentName,
      agentType: form.agentType,
      spendingLimit: Math.round(parseFloat(form.spendingLimit) * 100),
      expiryMonths: parseInt(form.expiryMonths),
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        const field = String(i.path[0]);
        errs[field] = i.message;
      });
      setFormErrors(errs);
      return false;
    }
    return true;
  }

  async function runAIValidation() {
    setValidating(true);
    setValidationResult(null);
    try {
      const mockTxns = generateMockTransactions(20);
      const result = await validateAgent({
        agentName: form.agentName,
        agentType: form.agentType,
        spendingLimit: Math.round(parseFloat(form.spendingLimit) * 100),
        walletHistory: mockTxns,
      });
      setValidationResult(result);
    } finally {
      setValidating(false);
    }
  }

  async function handleDeploy() {
    if (!wallet.walletAPI || !wallet.walletState) return;

    const agentIdHex = await registry.registerAgent(
      {
        agentName: form.agentName,
        category: (validationResult?.category ?? 1) as 1 | 2 | 3,
        riskTier: (validationResult?.risk_tier ?? 1) as 1 | 2 | 3,
        amlClear: validationResult?.aml_clear ?? false,
        spendingLimitCents: Math.round(parseFloat(form.spendingLimit) * 100),
        expiryMonths: parseInt(form.expiryMonths),
      },
      wallet.walletAPI,
      wallet.walletState.address,
      wallet.walletState.coinPublicKey,
      wallet.walletState.encryptionPublicKey
    );

    if (agentIdHex) {
      setTimeout(() => navigate("/dashboard"), 2500);
    }
  }

  return (
    <div className={styles.page}>
      <Topbar wallet={wallet} />

      <main className={styles.main}>
        {/* Progress indicator */}
        <nav className={styles.progress} aria-label="Registration steps">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`${styles.progressStep} ${step >= n ? styles.progressActive : ""} ${step > n ? styles.progressDone : ""}`}>
              <span className={styles.progressNum} aria-current={step === n ? "step" : undefined}>{n}</span>
              <span className={styles.progressLabel}>
                {n === 1 ? "Agent Details" : n === 2 ? "AI Validation" : "ZK Credential"}
              </span>
            </div>
          ))}
        </nav>

        <div className={`card ${styles.card}`}>
          {/* ── Step 1: Agent Details ── */}
          {step === 1 && (
            <section aria-label="Step 1: Agent details">
              <h1 className={styles.stepTitle}>Agent Details</h1>
              <p className={styles.stepDesc}>Configure your AI agent's identity and spending parameters.</p>

              <div className={styles.form}>
                <div className={styles.field}>
                  <label htmlFor="agentName" className={styles.label}>Agent Name</label>
                  <input
                    id="agentName"
                    type="text"
                    value={form.agentName}
                    onChange={(e) => updateForm("agentName", e.target.value)}
                    placeholder="e.g. DCA Bot Alpha"
                    maxLength={32}
                    aria-describedby={formErrors.agentName ? "agentName-err" : undefined}
                    aria-invalid={!!formErrors.agentName}
                  />
                  {formErrors.agentName && <span id="agentName-err" className={styles.fieldError} role="alert">{formErrors.agentName}</span>}
                </div>

                <div className={styles.field}>
                  <label htmlFor="agentType" className={styles.label}>Agent Type</label>
                  <select
                    id="agentType"
                    value={form.agentType}
                    onChange={(e) => updateForm("agentType", e.target.value as FormData["agentType"])}
                  >
                    {AGENT_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.field}>
                  <label htmlFor="spendingLimit" className={styles.label}>
                    Monthly Spending Limit (USD)
                  </label>
                  <input
                    id="spendingLimit"
                    type="number"
                    value={form.spendingLimit}
                    onChange={(e) => updateForm("spendingLimit", e.target.value)}
                    min="1"
                    max="100000"
                    step="1"
                    aria-describedby={formErrors.spendingLimit ? "spend-err" : "spend-hint"}
                    aria-invalid={!!formErrors.spendingLimit}
                  />
                  <span id="spend-hint" className={styles.fieldHint}>Min $1 · Max $100,000</span>
                  {formErrors.spendingLimit && <span id="spend-err" className={styles.fieldError} role="alert">{formErrors.spendingLimit}</span>}
                </div>

                <div className={styles.field}>
                  <label htmlFor="expiry" className={styles.label}>Credential Expiry</label>
                  <select
                    id="expiry"
                    value={form.expiryMonths}
                    onChange={(e) => updateForm("expiryMonths", e.target.value)}
                  >
                    {EXPIRY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.actions}>
                <button className="btn btn-secondary" onClick={() => navigate("/dashboard")}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => { if (validateStep1()) setStep(2); }}
                >
                  Next: AI Validation
                </button>
              </div>
            </section>
          )}

          {/* ── Step 2: AI Validation ── */}
          {step === 2 && (
            <section aria-label="Step 2: AI validation">
              <h1 className={styles.stepTitle}>AI Validation</h1>
              <p className={styles.stepDesc}>
                Our AI validator checks your transaction history locally.
                <strong> No data leaves your browser.</strong>
              </p>

              <div className={styles.validationBox}>
                <button
                  className="btn btn-primary"
                  onClick={runAIValidation}
                  disabled={validating}
                  aria-busy={validating}
                >
                  {validating ? <><span className="spinner" aria-hidden="true" /> Running AI Check…</> : "Run AI Check"}
                </button>

                {validationResult && (
                  <div className={`${styles.validationResult} fade-in`} aria-live="polite">
                    <div className={styles.resultRow}>
                      <span>AML Status</span>
                      <span className={`badge ${validationResult.aml_clear ? "badge-success" : "badge-danger"}`}>
                        {validationResult.aml_clear ? "Clear" : "Flagged"}
                      </span>
                    </div>
                    <div className={styles.resultRow}>
                      <span>Risk Tier</span>
                      <span className={`badge ${validationResult.risk_tier === 1 ? "badge-success" : validationResult.risk_tier === 2 ? "badge-warning" : "badge-danger"}`}>
                        Tier {validationResult.risk_tier}
                      </span>
                    </div>
                    <div className={styles.resultRow}>
                      <span>Score</span>
                      <div className={styles.scoreBar} role="progressbar" aria-valuenow={validationResult.score} aria-valuemin={0} aria-valuemax={100}>
                        <div className={styles.scoreFill} style={{ width: `${validationResult.score}%`, background: validationResult.score > 70 ? "var(--success)" : validationResult.score > 40 ? "var(--warning)" : "var(--danger)" }} />
                        <span className={styles.scoreLabel}>{validationResult.score}/100</span>
                      </div>
                    </div>
                    {validationResult.flags.length > 0 && (
                      <div className={styles.flags}>
                        <span className={styles.flagsLabel}>Flags:</span>
                        {validationResult.flags.map((f) => (
                          <span key={f} className="badge badge-danger">{f}</span>
                        ))}
                      </div>
                    )}
                    <p className={styles.reasoning}>{validationResult.reasoning}</p>

                    {validationResult.recommendation === "approve" && (
                      <div className={styles.approvedBanner} role="status">
                        Ready to issue ZK credential
                      </div>
                    )}
                    {validationResult.recommendation === "reject" && (
                      <div className={styles.rejectedBanner} role="alert">
                        Agent rejected. Please review the flags above and adjust your configuration.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className={styles.actions}>
                <button className="btn btn-secondary" onClick={() => setStep(1)}>Back</button>
                <button
                  className="btn btn-primary"
                  onClick={() => setStep(3)}
                  disabled={!validationResult || validationResult.recommendation === "reject"}
                >
                  Next: Generate ZK Credential
                </button>
              </div>
            </section>
          )}

          {/* ── Step 3: ZK Proof & Deploy ── */}
          {step === 3 && (
            <section aria-label="Step 3: ZK credential">
              <h1 className={styles.stepTitle}>Generate ZK Credential</h1>
              <p className={styles.stepDesc}>Review what will be proven on-chain vs. what stays private.</p>

              <div className={styles.zkSummary}>
                <div className={styles.zkCol}>
                  <h3 className={styles.zkColTitle}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                    Proven on-chain
                  </h3>
                  <ul className={styles.zkList}>
                    <li>Category: {AGENT_TYPE_OPTIONS.find((o) => o.value === form.agentType)?.label}</li>
                    <li>AML status: {validationResult?.aml_clear ? "Clear" : "—"}</li>
                    <li>Risk tier: {validationResult?.risk_tier ?? "—"}</li>
                    <li>Expiry: {form.expiryMonths} months</li>
                  </ul>
                </div>
                <div className={styles.zkCol}>
                  <h3 className={styles.zkColTitle}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    Stays private
                  </h3>
                  <ul className={styles.zkList}>
                    <li>Your wallet address</li>
                    <li>Exact spending limit (${parseFloat(form.spendingLimit).toLocaleString()})</li>
                    <li>Wallet transaction history</li>
                    <li>Agent secret key</li>
                  </ul>
                </div>
              </div>

              {registry.txStep !== "idle" && (
                <div className={styles.txStatus}>
                  <TransactionStatus step={registry.txStep} txHash={registry.txHash} error={registry.txError} />
                </div>
              )}

              {registry.proofServerOk === false && (
                <div className={styles.proofServerWarn} role="alert">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  Proof server not detected at localhost:6300. Start it with Docker before proceeding.
                </div>
              )}

              <div className={styles.actions}>
                <button className="btn btn-secondary" onClick={() => setStep(2)} disabled={registry.txStep !== "idle" && registry.txStep !== "failed"}>
                  Back
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleDeploy}
                  disabled={registry.txStep !== "idle" && registry.txStep !== "failed"}
                  aria-busy={registry.txStep !== "idle" && registry.txStep !== "confirmed" && registry.txStep !== "failed"}
                >
                  {registry.txStep === "idle" || registry.txStep === "failed" ? "Generate ZK Credential" : "Processing…"}
                </button>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
