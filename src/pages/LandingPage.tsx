import type { useMidnightWallet } from "../hooks/useMidnightWallet";
import styles from "./LandingPage.module.css";

interface Props {
  wallet: ReturnType<typeof useMidnightWallet>;
}

const features = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    ),
    title: "Zero-Knowledge Privacy",
    desc: "Your wallet address never touches the blockchain. Only cryptographic proofs do.",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
    title: "Full Control",
    desc: "Pause, revoke, or adjust any AI agent instantly. You're always in charge.",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
    title: "On-Chain Transparency",
    desc: "Every credential is verifiable on Midnight Preprod. DeFi protocols trust your agents.",
  },
];

export default function LandingPage({ wallet }: Props) {
  return (
    <div className={styles.page}>
      {/* Nav */}
      <nav className={styles.nav}>
        <div className={styles.logo}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <circle cx="14" cy="14" r="13" stroke="#1d9e75" strokeWidth="2"/>
            <path d="M9 14l3.5 3.5L19 10" stroke="#1d9e75" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Guardian</span>
        </div>
        <a href="https://docs.midnight.network" target="_blank" rel="noopener noreferrer" className={styles.navLink}>
          Docs
        </a>
      </nav>

      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.heroBadge}>
          <span className="badge badge-accent">Midnight Preprod Testnet</span>
        </div>
        <h1 className={styles.heroTitle}>
          Your AI agents.<br />
          Fully authorized.<br />
          <span className={styles.heroAccent}>Completely private.</span>
        </h1>
        <p className={styles.heroSub}>
          Guardian lets you hire AI agents to manage your DeFi.
          Your identity never touches the blockchain.
        </p>

        {wallet.error && (
          <p className={styles.errorMsg} role="alert">{wallet.error}</p>
        )}

        <button
          className={`btn btn-primary ${styles.heroBtn}`}
          onClick={wallet.connectWallet}
          disabled={wallet.isConnecting}
          aria-busy={wallet.isConnecting}
        >
          {wallet.isConnecting ? (
            <><span className="spinner" aria-hidden="true" /> Connecting…</>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
              </svg>
              Connect Lace Wallet
            </>
          )}
        </button>
        <p className={styles.heroHint}>Requires Lace Beta extension · Midnight Preprod</p>
      </section>

      {/* Feature cards */}
      <section className={styles.features} aria-label="Key features">
        {features.map((f) => (
          <div key={f.title} className={`card ${styles.featureCard}`}>
            <div className={styles.featureIcon} aria-hidden="true">{f.icon}</div>
            <h3 className={styles.featureTitle}>{f.title}</h3>
            <p className={styles.featureDesc}>{f.desc}</p>
          </div>
        ))}
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <p>Built for the Into the Midnight Hackathon · March 2026</p>
        <a href="https://github.com/midnightntwrk" target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
      </footer>
    </div>
  );
}
