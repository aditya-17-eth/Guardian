# Guardian — AI Agent Identity Dashboard on Midnight


## What is Guardian?

Guardian lets regular people hire, manage, and control autonomous AI agents that act on their behalf in DeFi — with full ZK-privacy guaranteeing the user's real identity is never exposed on-chain.

Built for the **Into the Midnight Hackathon · March 2026** on the Midnight Preprod testnet.


## Features

- ZK-backed agent credentials on Midnight Preprod testnet
- AI-powered AML validation (runs locally, never sent to server)
- 3-step agent registration wizard with live ZK proof generation
- Admin metrics dashboard with 30s auto-refresh

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contract | Compact 0.21 (Midnight ZK DSL) |
| Blockchain | Midnight Preprod Testnet |
| Frontend | React 19 + TypeScript + Vite 8 |
| Wallet | Lace Beta (Midnight) |
| AI Agent | Client-side TypeScript AML validator |
| Database | Supabase (PostgreSQL + RLS) |
| Monitoring | Sentry |
| CI/CD | GitHub Actions |

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Chrome browser with [Lace Beta wallet extension](https://docs.midnight.network/develop/how-to/lace-wallet)
- tDUST from [faucet.preprod.midnight.network](https://faucet.preprod.midnight.network)
- Docker Desktop (for the local proof server)

### Installation

```bash
git clone https://github.com/your-org/guardian
cd guardian
pnpm install
cp .env.example .env
# Fill in the Supabase and Midnight values in .env
```

### Start the proof server

The proof server generates ZK proofs locally. It must be running before any contract interaction.

```bash
docker run -p 6300:6300 midnightntwrk/proof-server:8.0.3 -- midnight-proof-server -v
```

### Run the dev server

```bash
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) and connect your Lace wallet.

## Contract Deployment

The Guardian contract is written with `pragma language_version 0.21;` and should be compiled in WSL with the current Compact compiler on your PATH.

### Compile

```bash
# In WSL Ubuntu with compact on PATH
compact compile contracts/guardian.compact contracts/managed/guardian
```

### Deploy to Preprod

```bash
pnpm deploy:contract
```

Required `.env` values for deployment:

```env
VITE_INDEXER_URI=https://indexer.preprod.midnight.network
VITE_INDEXER_WS_URI=wss://indexer.preprod.midnight.network
MIDNIGHT_NODE_URI=your_preprod_node_uri_here
MIDNIGHT_PROOF_SERVER_URI=http://localhost:6300
MIDNIGHT_WALLET_SEED=your_32_byte_hex_seed_here
MIDNIGHT_PRIVATE_STATE_PASSWORD=use_a_strong_secret_password_here
```

The deploy script writes `VITE_CONTRACT_ADDRESS` back into `.env` automatically after a successful deployment.

If the script reports a Compact runtime mismatch, re-run the compile step first. That means the generated contract artifacts in `contracts/managed/guardian` were built by an older toolchain and need to be refreshed before deployment.

**Contract address on Preprod:** `[DEPLOYED_ADDRESS]`

## Architecture

```
Browser (React + TypeScript)
  │
  ├── AI Validator (client-side, zero data egress)
  │     └── AML rules: RAPID_SEQUENCE, MIXER_INTERACTION, LARGE_TX_VOLUME,
  │                    HIGH_FREQUENCY, UNUSUAL_PATTERN
  │
  ├── Lace Wallet (Midnight extension)
  │     └── Signs transactions, manages keys
  │
  ├── Proof Server (localhost:6300, Docker)
  │     └── Generates ZK proofs for circuit calls
  │
  ├── Midnight Preprod Testnet
  │     └── guardian.compact — 4 circuits:
  │           registerAgent / verifyAgent / revokeAgent / updateAgentStatus
  │
  ├── Midnight Indexer (WebSocket)
  │     └── Transaction confirmation polling
  │
  └── Supabase (PostgreSQL)
        └── guardian_users / guardian_agents / guardian_transactions
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (public-safe) |
| `VITE_SENTRY_DSN` | Sentry DSN for error monitoring |
| `VITE_MIDNIGHT_NETWORK` | Network (`preprod`) |
| `VITE_INDEXER_URI` | Midnight Indexer HTTP URL |
| `VITE_INDEXER_WS_URI` | Midnight Indexer WebSocket URL |
| `MIDNIGHT_NODE_URI` | Midnight Preprod node RPC/WS endpoint used by the deploy script |
| `MIDNIGHT_PROOF_SERVER_URI` | Local proof server URL for deployment and proving |
| `MIDNIGHT_WALLET_SEED` | 32-byte hex seed for the deployment wallet |
| `MIDNIGHT_PRIVATE_STATE_PASSWORD` | Secret password for encrypting local Midnight private state |
| `VITE_CONTRACT_ADDRESS` | Deployed contract address |


## Security

See [docs/security.md](./docs/security.md) for the full security checklist.

## Contributing

1. Fork the repo
2. Create a feature branch
3. Run `pnpm test` and `pnpm type-check` before submitting
4. Open a pull request

