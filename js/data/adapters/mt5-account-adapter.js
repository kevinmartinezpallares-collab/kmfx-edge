import { createAccountRecord } from "./internal-model-adapter.js";

function normalizeMt5Payload(rawPayload = {}) {
  return {
    profile: {
      trader: rawPayload.trader || "MT5 Trader",
      desk: rawPayload.accountName || rawPayload.server || "MT5 Account",
      mode: rawPayload.mode || "MT5 Live",
      broker: rawPayload.broker || rawPayload.server || "MT5",
      tagline: rawPayload.tagline || "Cuenta normalizada desde el adaptador MT5."
    },
    account: {
      balance: rawPayload.balance || 0,
      equity: rawPayload.equity || rawPayload.balance || 0,
      openPnl: rawPayload.openPnl || 0,
      winRateTarget: rawPayload.winRateTarget || 0,
      profitFactorTarget: rawPayload.profitFactorTarget || 0,
      maxDrawdownLimit: rawPayload.maxDrawdownLimit || 0
    },
    riskProfile: rawPayload.riskProfile || {},
    riskRules: rawPayload.riskRules || [],
    positions: rawPayload.positions || [],
    trades: rawPayload.trades || []
  };
}

export function adaptMt5Account(rawAccount = {}) {
  return createAccountRecord({
    id: rawAccount.id || rawAccount.login || "mt5-account",
    name: rawAccount.name || rawAccount.accountName || "MT5 Account",
    broker: rawAccount.broker || rawAccount.server || "MT5",
    sourceType: "mt5",
    payload: normalizeMt5Payload(rawAccount.payload || rawAccount),
    meta: {
      environment: rawAccount.environment || "live",
      server: rawAccount.server || null
    }
  });
}
