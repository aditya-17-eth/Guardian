import { useEffect, useRef } from "react";
import styles from "./TransactionStatus.module.css";

export type TxStep =
  | "idle"
  | "validating"
  | "generating"
  | "signing"
  | "submitting"
  | "confirming"
  | "confirmed"
  | "failed";

interface Props {
  step: TxStep;
  txHash?: string;
  error?: string;
}

const STEPS: { key: TxStep; label: string }[] = [
  { key: "validating",  label: "Validating inputs" },
  { key: "generating",  label: "Generating ZK proof" },
  { key: "signing",     label: "Wallet signing" },
  { key: "submitting",  label: "Submitting to Midnight" },
  { key: "confirming",  label: "Awaiting confirmation" },
  { key: "confirmed",   label: "Confirmed" },
];

const STEP_ORDER = STEPS.map((s) => s.key);

function getStepStatus(stepKey: TxStep, currentStep: TxStep): "done" | "active" | "pending" | "failed" {
  if (currentStep === "failed") return stepKey === currentStep ? "failed" : "pending";
  const currentIdx = STEP_ORDER.indexOf(currentStep);
  const stepIdx = STEP_ORDER.indexOf(stepKey);
  if (stepIdx < currentIdx) return "done";
  if (stepIdx === currentIdx) return "active";
  return "pending";
}

export default function TransactionStatus({ step, txHash, error }: Props) {
  const liveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (liveRef.current) {
      liveRef.current.textContent = step === "confirmed"
        ? "Transaction confirmed!"
        : step === "failed"
        ? `Transaction failed: ${error ?? "Unknown error"}`
        : `Step: ${STEPS.find((s) => s.key === step)?.label ?? step}`;
    }
  }, [step, error]);

  if (step === "idle") return null;

  return (
    <div className={styles.container} role="status" aria-label="Transaction progress">
      {/* Screen-reader live region */}
      <div ref={liveRef} className={styles.srOnly} aria-live="polite" aria-atomic="true" />

      <h3 className={styles.heading}>
        {step === "confirmed" ? "Transaction Complete" : step === "failed" ? "Transaction Failed" : "Processing…"}
      </h3>

      <ol className={styles.steps} aria-label="Transaction steps">
        {STEPS.map(({ key, label }) => {
          const status = getStepStatus(key, step);
          return (
            <li key={key} className={`${styles.step} ${styles[status]}`} aria-current={status === "active" ? "step" : undefined}>
              <span className={styles.icon} aria-hidden="true">
                {status === "done" && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
                {status === "active" && <span className="spinner" style={{ width: 16, height: 16 }} />}
                {status === "failed" && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                )}
                {status === "pending" && <span className={styles.dot} />}
              </span>
              <span className={styles.label}>{label}</span>
            </li>
          );
        })}
      </ol>

      {txHash && (
        <div className={styles.txHash}>
          <span className={styles.txLabel}>Tx hash</span>
          <span className={styles.txValue}>{txHash.slice(0, 12)}…{txHash.slice(-8)}</span>
        </div>
      )}

      {error && step === "failed" && (
        <p className={styles.error} role="alert">{error}</p>
      )}
    </div>
  );
}
