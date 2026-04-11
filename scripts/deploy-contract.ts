// scripts/deploy-contract.ts
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as fs from 'node:fs';
import * as Rx from 'rxjs';
import { Buffer } from 'buffer';
import { WebSocket } from 'ws';

import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { HDWallet, Roles, generateRandomSeed } from '@midnight-ntwrk/wallet-sdk-hd';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import {
  createKeystore,
  InMemoryTransactionHistoryStorage,
  PublicKey,
  UnshieldedWallet,
} from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';
import { unshieldedToken } from '@midnight-ntwrk/ledger-v8';

// Required for wallet sync in Node.js
// @ts-expect-error
globalThis.WebSocket = WebSocket;

setNetworkId('preprod');

const CONFIG = {
  indexer: 'https://indexer.preprod.midnight.network/api/v3/graphql',
  indexerWS: 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws',
  node: 'https://rpc.preprod.midnight.network',
  proofServer: 'http://127.0.0.1:6300',
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ← Point to YOUR contract, not hello-world
const zkConfigPath = path.resolve(
  __dirname, '..', 'contracts', 'managed', 'guardian'
);

const contractPath = path.join(zkConfigPath, 'contract', 'index.js');
const GuardianContract = await import(pathToFileURL(contractPath).href);

const compiledContract = CompiledContract.make('guardian', GuardianContract.Contract).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);

async function createWallet(seed: string) {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
  if (hdWallet.type !== 'seedOk') throw new Error('Invalid seed');

  const result = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);

  if (result.type !== 'keysDerived') throw new Error('Key derivation failed');
  hdWallet.hdWallet.clear();
  const keys = result.keys;

  const networkId = getNetworkId();
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], networkId);

  const walletConfig = {
    networkId,
    indexerClientConnection: {
      indexerHttpUrl: CONFIG.indexer,
      indexerWsUrl: CONFIG.indexerWS,
    },
    provingServerUrl: new URL(CONFIG.proofServer),
    relayURL: new URL(CONFIG.node.replace(/^http/, 'ws')),
  };

  const shieldedWallet = ShieldedWallet(walletConfig)
    .startWithSecretKeys(shieldedSecretKeys);

  const unshieldedWallet = UnshieldedWallet({
    networkId,
    indexerClientConnection: walletConfig.indexerClientConnection,
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
  }).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore));

  const dustWallet = DustWallet({
    ...walletConfig,
    costParameters: {
      additionalFeeOverhead: 300_000_000_000_000n,
      feeBlocksMargin: 5,
    },
  }).startWithSecretKey(
    dustSecretKey,
    ledger.LedgerParameters.initialParameters().dust,
  );

  const wallet = new WalletFacade(shieldedWallet, unshieldedWallet, dustWallet);
  await wallet.start(shieldedSecretKeys, dustSecretKey);

  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
}

async function main() {
  console.log('\n[Guardian] Starting deployment to Midnight Preprod...\n');

  if (!fs.existsSync(path.join(zkConfigPath, 'contract', 'index.js'))) {
    console.error('Contract not compiled! Run: compact compile contracts/guardian.compact');
    process.exit(1);
  }

  // Use seed from .env or generate new one
  const seed = process.env.DEPLOY_SEED ?? toHex(Buffer.from(generateRandomSeed()));

  if (!process.env.DEPLOY_SEED) {
    console.log('⚠️  NEW WALLET SEED — SAVE THIS:\n', seed, '\n');
    console.log('Add to .env: DEPLOY_SEED=' + seed + '\n');
  }

  console.log('[Guardian] Creating wallet...');
  const walletCtx = await createWallet(seed);

  console.log('[Guardian] Syncing with Preprod network...');
  const state = await Rx.firstValueFrom(
    walletCtx.wallet.state().pipe(
      Rx.throttleTime(5000),
      Rx.filter((s) => s.isSynced),
    ),
  );

  const address = walletCtx.unshieldedKeystore.getBech32Address();
  const balance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
  console.log('[Guardian] Wallet address:', address);
  console.log('[Guardian] Balance:', balance.toLocaleString(), 'tNight\n');

  if (balance === 0n) {
    console.log('❌ No tNight balance. Visit: https://faucet.preprod.midnight.network');
    console.log('   Paste address:', address);
    console.log('   Then run deploy again with DEPLOY_SEED=' + seed);
    await walletCtx.wallet.stop();
    process.exit(1);
  }

  // DUST registration
  if (state.dust.walletBalance(new Date()) === 0n) {
    console.log('[Guardian] Registering for DUST...');
    const nightUtxos = state.unshielded.availableCoins.filter(
      (c: any) => !c.meta?.registeredForDustGeneration,
    );

    if (nightUtxos.length > 0) {
      const recipe = await walletCtx.wallet.registerNightUtxosForDustGeneration(
        nightUtxos,
        walletCtx.unshieldedKeystore.getPublicKey(),
        (payload) => walletCtx.unshieldedKeystore.signData(payload),
      );
      await walletCtx.wallet.submitTransaction(
        await walletCtx.wallet.finalizeRecipe(recipe),
      );
    }

    console.log('[Guardian] Waiting for DUST...');
    await Rx.firstValueFrom(
      walletCtx.wallet.state().pipe(
        Rx.throttleTime(5000),
        Rx.filter((s) => s.isSynced),
        Rx.filter((s) => s.dust.walletBalance(new Date()) > 0n),
      ),
    );
    console.log('[Guardian] DUST ready\n');
  }

  // Build providers
  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);

  const walletStateSync = await Rx.firstValueFrom(
    walletCtx.wallet.state().pipe(Rx.filter((s) => s.isSynced)),
  );

  const walletProvider = {
    getCoinPublicKey: () =>
      walletStateSync.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: () =>
      walletStateSync.shielded.encryptionPublicKey.toHexString(),
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await walletCtx.wallet.balanceUnboundTransaction(
        tx,
        {
          shieldedSecretKeys: walletCtx.shieldedSecretKeys,
          dustSecretKey: walletCtx.dustSecretKey,
        },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      return walletCtx.wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx: any) => walletCtx.wallet.submitTransaction(tx) as any,
  };

  const providers = {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'guardian-deploy-state',
      walletProvider,
    }),
    publicDataProvider: indexerPublicDataProvider(CONFIG.indexer, CONFIG.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(CONFIG.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };

  // Deploy
  console.log('[Guardian] Deploying contract (30-60 seconds)...');
  const deployed = await deployContract(providers, {
    compiledContract,
    privateStateId: 'guardianState',
    initialPrivateState: {},
  });

  const contractAddress = deployed.deployTxData.public.contractAddress;
  console.log('\n✅ Guardian deployed successfully!');
  console.log('Contract address:', contractAddress);

  // Save to file
  const info = {
    contractAddress,
    seed,
    network: 'preprod',
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync('deployment.json', JSON.stringify(info, null, 2));
  console.log('\nSaved to deployment.json');
  console.log('\nAdd to .env:');
  console.log('VITE_CONTRACT_ADDRESS=' + contractAddress);

  await walletCtx.wallet.stop();
}

main().catch((e) => {
  console.error('Deployment failed:', e.message ?? e);
  process.exit(1);
});
```

---

### Step 3 — Also add DEPLOY_SEED to .env
```
DEPLOY_SEED=                    ← leave blank first run, it generates one