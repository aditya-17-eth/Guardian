import * as Sentry from "@sentry/react";

export function initSentry() {
  if (!import.meta.env.VITE_SENTRY_DSN) return;

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.2,
    integrations: [Sentry.browserTracingIntegration()],
  });
}

export function captureContractError(error: Error, context: Record<string, unknown>) {
  Sentry.captureException(error, { extra: context });
}

export function captureWalletError(error: Error) {
  Sentry.captureException(error, { tags: { layer: "wallet" } });
}
