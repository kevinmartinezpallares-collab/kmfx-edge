import fs from "node:fs";
import path from "node:path";

const OUT_PATH = path.join(
  process.cwd(),
  "src/lib/data/fixtures/marketing-accounts-snapshot.fixture.json",
);
const OWNER_EMAIL = "kevinmartinezpallares@gmail.com";
const USER_ID = "owner-marketing-kevin";
const ANCHOR_ISO = "2026-06-13T09:00:00Z";
const START_ISO = "2026-01-05T09:00:00Z";

const symbols = ["EURUSD", "GBPUSD", "XAUUSD", "NAS100", "USDCAD", "USDJPY"];
const setups = [
  "London continuation",
  "NY liquidity sweep",
  "Breakout pullback",
  "Mean reversion",
  "Gold session scalp",
  "Index momentum",
];

const accountPlans = [
  {
    id: "marketing-darwinex-zero-100k",
    displayName: "Darwinex Zero 100K",
    broker: "Tradeslide Trading Tech Limited",
    server: "Darwinex-Live",
    login: "40009126",
    mode: "Darwinex",
    balance: 106420,
    start: 100000,
    target: 6420,
    trades: 176,
    winRate: 53,
    profitFactor: 1.42,
    drawdownPct: 4.1,
    seed: 11,
    fundingProfile: {
      firm: "Darwinex Zero",
      account_type: "funded",
      phase_label: "Cuenta Darwinex",
      objective_pct: 10,
      current_progress_pct: 64.2,
      consistency_pct: 22,
      payout_cadence_label: "Mensual",
      next_payout_label: "15 jul",
      playbook_label: "Capital preservation",
      recommended_risk_pct: 0.45,
    },
  },
  {
    id: "marketing-icmarkets-real-25k",
    displayName: "IC Markets Real",
    broker: "Raw Trading Ltd",
    server: "ICMarketsSC",
    login: "52917506",
    mode: "Real",
    balance: 23750,
    start: 25000,
    target: -1250,
    trades: 58,
    winRate: 43,
    profitFactor: 0.78,
    drawdownPct: 7.4,
    seed: 23,
  },
  {
    id: "marketing-ftmo-fase1-100k",
    displayName: "FTMO Fase 1 100K",
    broker: "FTMO",
    server: "FTMO-Server",
    login: "73018491",
    mode: "Fondeo",
    balance: 104320,
    start: 100000,
    target: 4320,
    trades: 64,
    winRate: 55,
    profitFactor: 1.64,
    drawdownPct: 3.2,
    seed: 37,
    fundingProfile: {
      firm: "FTMO",
      account_type: "challenge",
      phase_label: "Fase 1",
      objective_pct: 10,
      current_progress_pct: 43.2,
      consistency_pct: 18,
      payout_cadence_label: "Tras verificacion",
      next_payout_label: "Pendiente fase 2",
      playbook_label: "2-Step Challenge",
      recommended_risk_pct: 0.35,
      reset_cost_usd: 540,
    },
  },
  {
    id: "marketing-the5ers-fase2-100k",
    displayName: "The5ers Fase 2 100K",
    broker: "The5ers",
    server: "The5ers-Server",
    login: "61820433",
    mode: "Fondeo",
    balance: 97100,
    start: 100000,
    target: -2900,
    trades: 51,
    winRate: 45,
    profitFactor: 0.74,
    drawdownPct: 5.8,
    seed: 41,
    fundingProfile: {
      firm: "The5ers",
      account_type: "evaluation",
      phase_label: "Fase 2",
      objective_pct: 5,
      current_progress_pct: -58,
      consistency_pct: 31,
      payout_cadence_label: "Al pasar fase",
      next_payout_label: "Pendiente",
      playbook_label: "High Stakes",
      recommended_risk_pct: 0.25,
      reset_cost_usd: 495,
    },
  },
  {
    id: "marketing-orion-funded-50k",
    displayName: "Orion Funded 50K",
    broker: "OGM International Ltd",
    server: "OGMInternational-Server",
    login: "80571774",
    mode: "Fondeo",
    balance: 51850,
    start: 50000,
    target: 1850,
    trades: 92,
    winRate: 56,
    profitFactor: 1.31,
    drawdownPct: 4.6,
    seed: 53,
    fundingProfile: {
      firm: "Orion Funded",
      account_type: "funded",
      phase_label: "Cuenta fondeada",
      objective_pct: 8,
      current_progress_pct: 23.1,
      consistency_pct: 27,
      payout_cadence_label: "14 dias",
      next_payout_label: "20 jun",
      playbook_label: "Standard Swing",
      recommended_risk_pct: 0.4,
    },
  },
  {
    id: "marketing-pepperstone-demo-10k",
    displayName: "Pepperstone Demo 10K",
    broker: "Pepperstone",
    server: "Pepperstone-Demo",
    login: "98047125",
    mode: "Demo",
    balance: 10520,
    start: 10000,
    target: 520,
    trades: 34,
    winRate: 47,
    profitFactor: 1.18,
    drawdownPct: 2.9,
    seed: 67,
  },
  {
    id: "marketing-funding-pips-funded-200k",
    displayName: "Funding Pips Funded 200K",
    broker: "The Funding Pips",
    server: "FundingPips-Live",
    login: "94421867",
    mode: "Fondeo",
    balance: 209200,
    start: 200000,
    target: 9200,
    trades: 145,
    winRate: 50,
    profitFactor: 1.28,
    drawdownPct: 5.1,
    seed: 79,
    fundingProfile: {
      firm: "The Funding Pips",
      account_type: "funded",
      phase_label: "Cuenta fondeada",
      objective_pct: 10,
      current_progress_pct: 46,
      consistency_pct: 35,
      payout_cadence_label: "Semanal",
      next_payout_label: "18 jun",
      playbook_label: "2 Step Standard",
      recommended_risk_pct: 0.5,
    },
  },
];

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function dateAtRatio(ratio, hour = 9) {
  const start = new Date(START_ISO).getTime();
  const end = new Date(ANCHOR_ISO).getTime();
  const date = new Date(start + (end - start) * ratio);
  date.setUTCHours(hour, Math.round((ratio * 53) % 60), 0, 0);
  return date;
}

function allocateValues(count, total, random) {
  if (count <= 0) return [];
  const weights = Array.from({ length: count }, (_, index) => {
    const wave = 0.75 + Math.sin(index / 3) * 0.18 + Math.cos(index / 5) * 0.12;
    return Math.max(0.15, wave + random() * 0.8);
  });
  const sum = weights.reduce((acc, item) => acc + item, 0);
  return weights.map((item) => round((item / sum) * total, 2));
}

function buildTradePnl(plan, random) {
  const wins = Math.max(1, Math.round((plan.trades * plan.winRate) / 100));
  const losses = Math.max(1, plan.trades - wins);
  let grossProfit;
  let grossLoss;

  if (plan.target >= 0) {
    grossLoss = Math.abs(plan.target / (plan.profitFactor - 1));
    grossProfit = grossLoss * plan.profitFactor;
  } else {
    grossLoss = Math.abs(plan.target / (1 - plan.profitFactor));
    grossProfit = grossLoss * plan.profitFactor;
  }

  const positive = allocateValues(wins, grossProfit, random);
  const negative = allocateValues(losses, grossLoss, random).map((value) => -value);
  const values = [...positive, ...negative];

  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }

  const diff = round(plan.target - values.reduce((sum, value) => sum + value, 0), 2);
  values[values.length - 1] = round(values[values.length - 1] + diff, 2);
  return values;
}

function priceFor(symbol, random) {
  const base = {
    EURUSD: 1.08,
    GBPUSD: 1.27,
    XAUUSD: 2320,
    NAS100: 19400,
    USDCAD: 1.36,
    USDJPY: 156,
  }[symbol] ?? 1;
  return round(base * (0.985 + random() * 0.03), symbol.includes("USD") && symbol !== "XAUUSD" ? 5 : 2);
}

function buildTrades(plan) {
  const random = rng(plan.seed);
  const pnls = buildTradePnl(plan, random);

  return pnls.map((net, index) => {
    const ratio = (index + 1) / (pnls.length + 1);
    const symbol = symbols[Math.floor(random() * symbols.length)];
    const side = random() > 0.48 ? "BUY" : "SELL";
    const closeDate = dateAtRatio(ratio, [8, 10, 14, 16, 19][index % 5]);
    const openDate = new Date(closeDate.getTime() - (35 + Math.floor(random() * 380)) * 60000);
    const entry = priceFor(symbol, random);
    const distance = symbol === "XAUUSD" ? 7 + random() * 20 : symbol === "NAS100" ? 45 + random() * 130 : 0.001 + random() * 0.006;
    const exit =
      side === "BUY"
        ? entry + Math.sign(net || 1) * distance
        : entry - Math.sign(net || 1) * distance;
    const risk = Math.max(35, Math.abs(net) * (0.65 + random() * 0.7));
    const stop = side === "BUY" ? entry - distance * 0.7 : entry + distance * 0.7;
    const target = side === "BUY" ? entry + distance * 1.7 : entry - distance * 1.7;

    return {
      trade_id: `${plan.id}-t-${String(index + 1).padStart(3, "0")}`,
      ticket: `${plan.login}${String(index + 1).padStart(4, "0")}`,
      position_id: `${plan.id}-p-${String(index + 1).padStart(3, "0")}`,
      symbol,
      type: side,
      direction: side,
      volume: round(0.03 + random() * 0.72, 2),
      open_price: entry,
      entry_price: entry,
      price: round(exit, symbol.includes("USD") && symbol !== "XAUUSD" ? 5 : 2),
      exit_price: round(exit, symbol.includes("USD") && symbol !== "XAUUSD" ? 5 : 2),
      sl: round(stop, symbol.includes("USD") && symbol !== "XAUUSD" ? 5 : 2),
      stop_loss: round(stop, symbol.includes("USD") && symbol !== "XAUUSD" ? 5 : 2),
      tp: round(target, symbol.includes("USD") && symbol !== "XAUUSD" ? 5 : 2),
      take_profit: round(target, symbol.includes("USD") && symbol !== "XAUUSD" ? 5 : 2),
      open_time: openDate.toISOString(),
      close_time: closeDate.toISOString(),
      time: closeDate.toISOString(),
      profit: round(net + 1.8, 2),
      commission: -1.5,
      swap: -0.3,
      net,
      risk_amount: round(risk, 2),
      planned_risk_amount: round(risk, 2),
      planned_reward_amount: round(risk * (1.4 + random()), 2),
      planned_rr: round(1.2 + random() * 1.5, 2),
      captured_r: round(net / risk, 2),
      mfe: round(Math.max(net, Math.abs(net) * (1.05 + random() * 0.8)), 2),
      mae: round(-Math.abs(net) * (0.25 + random() * 0.75), 2),
      exit_efficiency_pct: round(45 + random() * 45, 1),
      strategy_tag: setups[index % setups.length],
      comment: setups[index % setups.length],
    };
  });
}

function buildHistory(plan, trades) {
  const byDate = new Map();
  trades.forEach((trade) => {
    const key = trade.close_time.slice(0, 10);
    byDate.set(key, round((byDate.get(key) || 0) + trade.net, 2));
  });

  const points = [];
  let value = plan.start;
  const start = new Date(START_ISO);
  const end = new Date(ANCHOR_ISO);
  const random = rng(plan.seed + 1000);

  for (let date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const key = date.toISOString().slice(0, 10);
    value = round(value + (byDate.get(key) || 0), 2);
    const equityNoise = round((random() - 0.5) * Math.max(12, plan.start * 0.00035), 2);
    points.push({
      timestamp: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 22, 0, 0)).toISOString(),
      value: round(value + equityNoise, 2),
      balance: value,
      equity: round(value + equityNoise, 2),
    });
  }

  const finalPoint = points.at(-1);
  if (finalPoint) {
    finalPoint.timestamp = ANCHOR_ISO;
    finalPoint.value = plan.balance;
    finalPoint.balance = plan.balance;
    finalPoint.equity = plan.balance;
  }

  return points;
}

function buildRiskSnapshot(plan) {
  const blocked = plan.drawdownPct >= 7;
  const warning = plan.drawdownPct >= 5;
  return {
    summary: {
      daily_drawdown_pct: round(Math.min(plan.drawdownPct * 0.35, 3.4), 2),
      distance_to_daily_dd_limit_pct: round(Math.max(0.4, 5 - Math.min(plan.drawdownPct * 0.35, 3.4)), 2),
      peak_to_equity_drawdown_pct: plan.drawdownPct,
      max_drawdown_limit_pct: 10,
      total_open_risk_pct: round(0.18 + (plan.seed % 7) * 0.11, 2),
      portfolio_heat_limit_pct: 2.5,
    },
    status: {
      risk_status: blocked ? "warning" : "ok",
      severity: warning ? "warning" : "info",
      blocking_rule: "Sin bloqueo duro activo.",
      action_required: warning ? "Reducir riesgo hasta recuperar margen operativo." : "Sin acción requerida.",
      enforcement: {
        allow_new_trades: true,
      },
    },
    policy: {
      daily_dd_limit_pct: 5,
      max_dd_limit_pct: 10,
      portfolio_heat_limit_pct: 2.5,
    },
    policy_evaluation: {
      warnings: warning ? ["Drawdown bajo vigilancia."] : [],
      breaches: [],
    },
    symbol_exposure: symbols.slice(0, 4).map((symbol, index) => ({
      symbol,
      risk_pct: round(0.12 + ((plan.seed + index) % 8) * 0.09, 2),
    })),
    professional_metrics: {
      risk_adjusted: {
        sortino_ratio: round(plan.profitFactor > 1 ? 1 + plan.profitFactor / 2 : 0.45 + plan.profitFactor / 2, 2),
      },
    },
  };
}

function buildAccount(plan, index) {
  const trades = buildTrades(plan);
  const history = buildHistory(plan, trades);
  const wins = trades.filter((trade) => trade.net >= 0);
  const losses = trades.filter((trade) => trade.net < 0);
  const grossProfit = round(wins.reduce((sum, trade) => sum + trade.net, 0), 2);
  const grossLoss = round(losses.reduce((sum, trade) => sum + trade.net, 0), 2);
  const netProfit = round(trades.reduce((sum, trade) => sum + trade.net, 0), 2);
  const openPositionsCount = index % 3 === 0 ? 1 : 0;
  const openPnl = openPositionsCount ? round((index % 2 === 0 ? 1 : -1) * (45 + index * 18), 2) : 0;

  return {
    account_id: plan.id,
    user_id: USER_ID,
    display_name: plan.displayName,
    broker: plan.broker,
    platform: "mt5",
    login: plan.login,
    server: plan.server,
    connection_mode: "marketing_snapshot",
    status: "active",
    last_sync_at: ANCHOR_ISO,
    is_default: index === 0,
    dashboard_payload: {
      payloadSource: "marketing_snapshot",
      accountName: plan.displayName,
      name: plan.displayName,
      broker: plan.broker,
      server: plan.server,
      platform: "mt5",
      mode: plan.mode,
      balance: plan.balance,
      equity: round(plan.balance + openPnl, 2),
      floatingPnl: openPnl,
      openPnl,
      closedPnl: netProfit,
      totalPnl: round(netProfit + openPnl, 2),
      openPositionsCount,
      totalTrades: plan.trades,
      winRate: round((wins.length / trades.length) * 100, 1),
      timestamp: ANCHOR_ISO,
      history,
      trades,
      reportMetrics: {
        source: "marketing_snapshot",
        balance: plan.balance,
        equity: round(plan.balance + openPnl, 2),
        netProfit,
        grossProfit,
        grossLoss,
        profitFactor: round(grossProfit / Math.max(1, Math.abs(grossLoss)), 2),
        winRate: round((wins.length / trades.length) * 100, 1),
        totalTrades: trades.length,
        drawdownPct: plan.drawdownPct,
        commissions: round(trades.reduce((sum, trade) => sum + trade.commission, 0), 2),
        swaps: round(trades.reduce((sum, trade) => sum + trade.swap, 0), 2),
        bestTrade: Math.max(...trades.map((trade) => trade.net)),
        worstTrade: Math.min(...trades.map((trade) => trade.net)),
        bestWinningStreak: 6 + (plan.seed % 5),
        bestLosingStreak: 3 + (plan.seed % 4),
      },
      fundingProfile: plan.fundingProfile,
      riskSnapshot: buildRiskSnapshot(plan),
    },
  };
}

const snapshot = {
  accounts: accountPlans.map(buildAccount),
  active_account_id: accountPlans[0].id,
  auth_email: OWNER_EMAIL,
  user_id: USER_ID,
  scope_user_id: USER_ID,
  is_admin: true,
  summary_only: false,
  redaction: {
    redactionLevel: "synthetic-marketing",
    redactionMethod: "generated",
    redactionNotes: "Synthetic marketing accounts for screenshots. No real MT5 account, login, ticket or financial result is represented.",
    containsShiftedTimestamps: false,
    containsScaledFinancialValues: false,
  },
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(`${OUT_PATH}.tmp`, `${JSON.stringify(snapshot, null, 2)}\n`);
fs.renameSync(`${OUT_PATH}.tmp`, OUT_PATH);
console.log(`Wrote ${OUT_PATH}`);
