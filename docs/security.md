# Guardian Security Checklist

## Smart Contract Layer

- [x] Private witness inputs (`ownerAddress`, `spendingLimit`, `agentSecret`) never stored on-chain
- [x] Owner identity verified via ZK commitment — `persistentCommit(ownerAddress, agentSecret)` — not raw address
- [x] AML check enforced at circuit level with `assert(aml_clear == true, ...)` — cannot be bypassed
- [x] Spending limits validated in circuit constraints: `assert(spending_limit > 0)` and `assert(spending_limit <= 10000000)`
- [x] Revocation requires ZK ownership proof — recomputes `agent_id` from private inputs and asserts equality
- [x] `disclose()` used explicitly for all values flowing into ledger operations — compiler enforces this
- [x] `persistentHash` / `persistentCommit` use SHA-256 — guaranteed stable across compiler upgrades

## Frontend

- [x] No private keys ever handled client-side — Lace wallet manages all key material
- [x] All user inputs validated with zod schemas (`AgentInputSchema`) before any contract call
- [x] No sensitive data sent to any server — AI validator runs entirely in the browser
- [x] Wallet history never leaves the device — `validateAgent()` is a pure client-side function
- [x] Sentry captures errors without PII — no wallet addresses or private data in error events
- [x] Environment variables validated at startup — app throws if `VITE_SUPABASE_URL` is missing
- [x] Client-side debounce (2s minimum) on all contract interactions prevents accidental double-submission
- [x] `crypto.getRandomValues()` used for agent secret generation — cryptographically secure

## API / Supabase

- [x] Row Level Security enabled on all tables (`guardian_users`, `guardian_agents`, `guardian_transactions`)
- [x] No wallet private keys stored in database — only pseudonymous wallet addresses
- [x] Wallet addresses stored as-is (Bech32m format) — no personal data linked
- [x] Supabase anon key is public-safe — read-only for authenticated users via RLS
- [x] Service role key never exposed to frontend — only used in server-side migrations
- [x] `guardian_metrics` view is read-only — no write access via the metrics endpoint

## Network

- [x] Proof server runs locally at `localhost:6300` — private data (ZK witnesses) never leaves the device
- [x] HTTPS only for all external requests (Supabase, Midnight Indexer, Sentry)
- [x] WebSocket connections use WSS (`wss://indexer.preprod.midnight.network`)
- [x] Proof server health check before any ZK operation — user warned if unreachable
- [x] Indexer WebSocket subscription has 2-minute timeout — prevents hanging connections

## Dependencies

- [x] pnpm lockfile committed — reproducible installs
- [x] `skipLibCheck: true` in tsconfig — avoids false positives from SDK type issues
- [x] No known high/critical CVEs in production dependencies (run `pnpm audit` to verify)

## Known Limitations (Testnet)

- tDUST has no real monetary value — do not use mainnet funds
- Local proof server required — document setup clearly for users
- `browserPrivateStateProvider` uses sessionStorage — private state is lost on browser close
  - For production: use `levelPrivateStateProvider` with encrypted persistence
- Lace Beta may have UX rough edges on some browsers
- Contract address must be set in `.env` after deployment — not auto-discovered

## Threat Model

| Threat | Mitigation |
|--------|-----------|
| On-chain identity exposure | ZK commitment — owner address never stored on-chain |
| AML bypass | Circuit-level `assert` — cannot be bypassed without valid ZK proof |
| Replay attacks | `agent_id` derived from unique `agentSecret` — each registration is unique |
| Unauthorized revocation | Ownership proof required — must know `ownerAddress` + `agentSecret` |
| Private key theft | Lace wallet manages keys — Guardian never touches private keys |
| Data exfiltration | AI validator is client-side only — no network calls during validation |
| XSS | React's JSX escaping + zod input validation on all user inputs |
| CSRF | Supabase anon key is public-safe — no server-side state mutations via API |
