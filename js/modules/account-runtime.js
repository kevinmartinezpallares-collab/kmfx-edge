function withAccount(state, accountId, transform) {
  const account = state.accounts[accountId];
  if (!account) return state;
  return {
    ...state,
    accounts: {
      ...state.accounts,
      [accountId]: transform(account)
    }
  };
}

export function evaluateCompliance(account, fundedAccounts = []) {
  const messages = [];
  let riskStatus = "ok";
  let fundedStatus = "ok";

  const currentRisk = Number(account.model.riskProfile.currentRiskPct || 0);
  const maxTradeRisk = Number(account.model.riskProfile.maxTradeRiskPct || 1);
  const maxDrawdown = Number(account.model.account.maxDrawdownLimit || 0);
  const drawdown = Number(account.model.totals.drawdown.maxPct || 0);

  if (currentRisk > maxTradeRisk) {
    riskStatus = "violation";
    messages.push(`Riesgo por trade ${currentRisk.toFixed(2)}% supera límite ${maxTradeRisk.toFixed(2)}%.`);
  } else if (currentRisk > maxTradeRisk * 0.85) {
    riskStatus = "warning";
    messages.push(`Riesgo por trade cerca del límite (${currentRisk.toFixed(2)}%).`);
  }

  if (maxDrawdown && drawdown > maxDrawdown) {
    riskStatus = "violation";
    messages.push(`Drawdown ${drawdown.toFixed(1)}% supera máximo ${maxDrawdown.toFixed(1)}%.`);
  }

  const funded = fundedAccounts.find((item) => item.accountId === account.id);
  if (funded) {
    if (funded.dailyDdPct >= 4 || funded.maxDdPct >= 8) {
      fundedStatus = "violation";
      messages.push(`Cuenta ${funded.firm} fuera de tolerancia de DD.`);
    } else if (funded.dailyDdPct >= 2.5 || funded.maxDdPct >= 6) {
      fundedStatus = "warning";
      messages.push(`Cuenta ${funded.firm} cerca de sus límites de challenge.`);
    }
  }

  return {
    riskStatus,
    fundedStatus,
    messages
  };
}

function setConnectionState(store, accountId, patch = {}) {
  store.setState((state) => withAccount(state, accountId, (account) => ({
    ...(() => {
      const nextAccount = {
        ...account,
        connection: {
          ...account.connection,
          ...patch
        }
      };
      return {
        ...nextAccount,
        compliance: evaluateCompliance(nextAccount, state.workspace.fundedAccounts)
      };
    })()
  })));
}

export function connectAccount(store, accountId) {
  const account = store.getState().accounts[accountId];
  if (!account || account.connection.state === "connecting") return;

  setConnectionState(store, accountId, {
    state: "connecting",
    lastError: null,
    isSyncing: true,
    isAutoReconnectPending: false
  });

  window.setTimeout(() => {
    const current = store.getState().accounts[accountId];
    if (!current || current.connection.state !== "connecting") return;

    const shouldFail = accountId === "funded" && current.connection.reconnectCount === 0;
    if (shouldFail) {
      setConnectionState(store, accountId, {
        state: "error",
        lastError: "Simulated handshake timeout",
        isSyncing: false,
        reconnectCount: current.connection.reconnectCount + 1,
        isAutoReconnectPending: true
      });

      window.setTimeout(() => {
        const latest = store.getState().accounts[accountId];
        if (!latest || latest.connection.state !== "error") return;
        reconnectAccount(store, accountId, true);
      }, 1800);
      return;
    }

    setConnectionState(store, accountId, {
      state: "connected",
      lastSync: new Date().toISOString(),
      lastError: null,
      isSyncing: false,
      reconnectCount: current.connection.reconnectCount,
      isAutoReconnectPending: false
    });
  }, 1200);
}

export function disconnectAccount(store, accountId) {
  setConnectionState(store, accountId, {
    state: "disconnected",
    isSyncing: false,
    isAutoReconnectPending: false
  });
}

export function reconnectAccount(store, accountId, auto = false) {
  const current = store.getState().accounts[accountId];
  if (!current) return;
  setConnectionState(store, accountId, {
    reconnectCount: current.connection.reconnectCount + (auto ? 0 : 1),
    isAutoReconnectPending: auto
  });
  connectAccount(store, accountId);
}

export function initAccountRuntime(store) {
  window.setInterval(() => {
    const state = store.getState();
    let changed = false;
    const nextAccounts = { ...state.accounts };

    Object.values(state.accounts).forEach((account) => {
      if (account.connection.state !== "connected") return;
      changed = true;
      const jitter = ((account.connection.syncTick % 4) - 1.5) * 18;
      const nextEquity = Math.round(account.model.account.balance + account.model.totals.pnl + jitter);
      const nextOpenPnl = Math.round((account.model.account.openPnl || 0) + jitter);
      const nextAccount = {
        ...account,
        model: {
          ...account.model,
          account: {
            ...account.model.account,
            equity: nextEquity,
            openPnl: nextOpenPnl
          }
        },
        connection: {
          ...account.connection,
          isSyncing: true
        }
      };
      nextAccounts[account.id] = {
        ...nextAccount,
        compliance: evaluateCompliance(nextAccount, state.workspace.fundedAccounts)
      };
    });

    if (changed) {
      store.setState((prev) => ({
        ...prev,
        accounts: nextAccounts
      }));

      window.setTimeout(() => {
        store.setState((prev) => ({
          ...prev,
          accounts: Object.fromEntries(
            Object.entries(prev.accounts).map(([id, account]) => [
              id,
              account.connection.state === "connected"
                ? {
                    ...account,
                    connection: {
                      ...account.connection,
                      isSyncing: false,
                      syncTick: account.connection.syncTick + 1,
                      lastSync: new Date().toISOString()
                    },
                    compliance: evaluateCompliance(account, prev.workspace.fundedAccounts)
                  }
                : account
            ])
          )
        }));
      }, 550);
    }
  }, 9000);
}
