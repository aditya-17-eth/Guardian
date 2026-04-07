import type { useMidnightWallet } from "../hooks/useMidnightWallet";
import { useNavigate } from "react-router-dom";
import styles from "./Topbar.module.css";

interface Props {
  wallet: ReturnType<typeof useMidnightWallet>;
}

function truncateAddress(addr: string): string {
  if (!addr) return "";
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-6)}`;
}

export default function Topbar({ wallet }: Props) {
  const navigate = useNavigate();

  return (
    <header className={styles.topbar} role="banner">
      <button
        className={styles.logo}
        onClick={() => navigate("/dashboard")}
        aria-label="Go to dashboard"
      >
        <svg width="26" height="26" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <circle cx="14" cy="14" r="13" stroke="#1d9e75" strokeWidth="2"/>
          <path d="M9 14l3.5 3.5L19 10" stroke="#1d9e75" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className={styles.logoText}>Guardian</span>
      </button>

      <div className={styles.right}>
        {wallet.walletState && (
          <div className={styles.walletInfo} aria-label="Connected wallet">
            <span className={styles.walletDot} aria-hidden="true" />
            <span className={styles.walletAddr}>
              {truncateAddress(wallet.walletState.address)}
            </span>
          </div>
        )}
        <button
          className="btn btn-secondary"
          onClick={wallet.disconnectWallet}
          aria-label="Disconnect wallet"
        >
          Disconnect
        </button>
      </div>
    </header>
  );
}
