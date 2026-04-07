/**
 * indexer.ts
 * WebSocket subscription to the Midnight Indexer GraphQL API.
 * Used to poll for transaction confirmation after submission.
 */

import { INDEXER_WS_URI } from "../lib/constants";

const WS_ENDPOINT = `${INDEXER_WS_URI}/api/v3/graphql/ws`;

const WATCH_TX_QUERY = `
  subscription WatchTransaction($txHash: String!) {
    transactionByHash(hash: $txHash) {
      hash
      blockHeight
      status
    }
  }
`;

export interface TxConfirmation {
  hash: string;
  blockHeight: number;
  status: string;
}

/**
 * Subscribe to a transaction by hash via the Midnight Indexer WebSocket.
 * Calls onConfirmed when the tx is included in a block.
 * Returns a cleanup function to close the subscription.
 */
export function watchTransaction(
  txHash: string,
  onConfirmed: (data: TxConfirmation) => void,
  onError: (err: Error) => void,
  timeoutMs = 120_000
): () => void {
  let ws: WebSocket | null = null;
  let closed = false;

  const timeoutId = setTimeout(() => {
    onError(new Error("Transaction confirmation timed out after 2 minutes"));
    cleanup();
  }, timeoutMs);

  function cleanup() {
    closed = true;
    clearTimeout(timeoutId);
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      ws.close();
    }
  }

  try {
    ws = new WebSocket(WS_ENDPOINT, "graphql-ws");

    ws.onopen = () => {
      if (closed) return;
      // GraphQL-WS protocol: init then subscribe
      ws!.send(JSON.stringify({ type: "connection_init" }));
    };

    ws.onmessage = (event) => {
      if (closed) return;
      try {
        const msg = JSON.parse(event.data as string);

        if (msg.type === "connection_ack") {
          // Send subscription
          ws!.send(
            JSON.stringify({
              id: "1",
              type: "subscribe",
              payload: {
                query: WATCH_TX_QUERY,
                variables: { txHash },
              },
            })
          );
        }

        if (msg.type === "next" && msg.payload?.data?.transactionByHash) {
          const tx = msg.payload.data.transactionByHash as TxConfirmation;
          if (tx.blockHeight) {
            onConfirmed(tx);
            cleanup();
          }
        }

        if (msg.type === "error") {
          onError(new Error(JSON.stringify(msg.payload)));
          cleanup();
        }
      } catch (e) {
        onError(e instanceof Error ? e : new Error("WebSocket parse error"));
        cleanup();
      }
    };

    ws.onerror = () => {
      if (!closed) {
        onError(new Error("Indexer WebSocket connection failed"));
        cleanup();
      }
    };

    ws.onclose = () => {
      if (!closed) {
        onError(new Error("Indexer WebSocket closed unexpectedly"));
      }
    };
  } catch (e) {
    onError(e instanceof Error ? e : new Error("Failed to open WebSocket"));
    cleanup();
  }

  return cleanup;
}

/**
 * Promise-based wrapper around watchTransaction.
 */
export function waitForConfirmation(
  txHash: string,
  timeoutMs = 120_000
): Promise<TxConfirmation> {
  return new Promise((resolve, reject) => {
    watchTransaction(txHash, resolve, reject, timeoutMs);
  });
}
