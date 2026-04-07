-- Guardian DB Schema
-- Users table (wallet addresses only — no personal data)
CREATE TABLE guardian_users (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address  TEXT UNIQUE NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  last_seen_at    TIMESTAMPTZ DEFAULT now()
);

-- Agents table (mirrors on-chain data for fast querying)
CREATE TABLE guardian_agents (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id_onchain TEXT UNIQUE NOT NULL,
  wallet_address   TEXT NOT NULL,
  agent_name       TEXT NOT NULL,
  category         INTEGER NOT NULL CHECK (category IN (1, 2, 3)),
  risk_tier        INTEGER NOT NULL CHECK (risk_tier IN (1, 2, 3)),
  aml_clear        BOOLEAN NOT NULL,
  active           BOOLEAN DEFAULT true,
  spending_limit   BIGINT NOT NULL,
  expires_at       BIGINT NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (wallet_address) REFERENCES guardian_users(wallet_address)
);

-- Transactions table
CREATE TABLE guardian_transactions (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tx_hash          TEXT UNIQUE NOT NULL,
  wallet_address   TEXT NOT NULL,
  agent_id_onchain TEXT,
  action           TEXT NOT NULL CHECK (action IN ('register', 'revoke', 'verify', 'update')),
  status           TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'failed')),
  block_height     BIGINT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Metrics view
CREATE VIEW guardian_metrics AS
SELECT
  (SELECT COUNT(*) FROM guardian_users)                                                          AS total_users,
  (SELECT COUNT(*) FROM guardian_agents WHERE active = true)                                     AS active_agents,
  (SELECT COUNT(*) FROM guardian_transactions WHERE status = 'confirmed')                        AS total_transactions,
  (SELECT COUNT(*) FROM guardian_agents WHERE aml_clear = true)                                  AS zk_credentials_issued,
  (SELECT COUNT(*) FROM guardian_transactions WHERE created_at > now() - INTERVAL '24 hours')    AS tx_last_24h;

-- Row Level Security
ALTER TABLE guardian_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_data" ON guardian_agents
  FOR ALL USING (wallet_address = current_setting('app.wallet_address', true));

CREATE POLICY "users_own_txns" ON guardian_transactions
  FOR ALL USING (wallet_address = current_setting('app.wallet_address', true));
