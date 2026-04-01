function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

const baseMockPayload = {
  profile: {
    trader: "Kevin C.",
    desk: "KMFX Master",
    mode: "Cuenta principal",
    broker: "Sandbox institucional",
    tagline: "Vista operativa principal con foco en disciplina, consistencia y lectura institucional."
  },
  account: {
    balance: 128450,
    equity: 129180,
    openPnl: 730,
    winRateTarget: 55,
    profitFactorTarget: 1.8,
    maxDrawdownLimit: 10
  },
  riskProfile: {
    currentRiskPct: 0.45,
    dailyLossLimitPct: 1.2,
    weeklyHeatLimitPct: 3.5,
    maxTradeRiskPct: 1.0,
    maxVolume: 1.5,
    allowedSessions: ["London", "New York"],
    allowedSymbols: ["EURUSD", "GBPUSD", "XAUUSD", "US30", "NAS100", "USDJPY"],
    autoBlock: true
  },
  positions: [
    { id: "pos-1", symbol: "EURUSD", side: "BUY", volume: 1.2, entry: 1.0842, current: 1.0861, pnl: 228 },
    { id: "pos-2", symbol: "XAUUSD", side: "SELL", volume: 0.5, entry: 3028.4, current: 3021.8, pnl: 330 },
    { id: "pos-3", symbol: "US30", side: "BUY", volume: 0.3, entry: 42880, current: 42754, pnl: 172 }
  ],
  riskRules: [
    { title: "Límite diario", description: "Protección de capital intradía", value: "1.20%" },
    { title: "Riesgo por trade", description: "Sizing operativo normal", value: "0.45%" },
    { title: "Exposición abierta", description: "Capacidad simultánea", value: "2.40%" },
    { title: "Máx. pérdidas seguidas", description: "Regla de stop semanal", value: "3" },
    { title: "Sesión principal", description: "Mayor edge observado", value: "London" },
    { title: "Cap sesión NY", description: "Riesgo táctico", value: "0.60%" }
  ],
  trades: [
    { id: 1, date: "2026-03-02T08:30:00", symbol: "EURUSD", side: "BUY", pnl: 320, rMultiple: 1.9, setup: "London continuation", session: "London", durationMin: 82 },
    { id: 2, date: "2026-03-03T09:10:00", symbol: "GBPUSD", side: "SELL", pnl: -180, rMultiple: -0.9, setup: "OB reclaim", session: "London", durationMin: 41 },
    { id: 3, date: "2026-03-03T14:20:00", symbol: "XAUUSD", side: "BUY", pnl: 410, rMultiple: 2.3, setup: "NY impulse", session: "New York", durationMin: 51 },
    { id: 4, date: "2026-03-04T07:55:00", symbol: "EURUSD", side: "BUY", pnl: 210, rMultiple: 1.2, setup: "Liquidity sweep", session: "London", durationMin: 69 },
    { id: 5, date: "2026-03-05T10:50:00", symbol: "USDJPY", side: "SELL", pnl: -125, rMultiple: -0.7, setup: "Session fade", session: "London", durationMin: 33 },
    { id: 6, date: "2026-03-05T15:10:00", symbol: "XAUUSD", side: "SELL", pnl: 520, rMultiple: 2.8, setup: "NY reversal", session: "New York", durationMin: 74 },
    { id: 7, date: "2026-03-06T09:25:00", symbol: "NAS100", side: "BUY", pnl: 605, rMultiple: 3.1, setup: "Open drive", session: "London", durationMin: 37 },
    { id: 8, date: "2026-03-09T08:40:00", symbol: "EURUSD", side: "SELL", pnl: -980, rMultiple: -2.1, setup: "Breakout fail", session: "London", durationMin: 45 },
    { id: 9, date: "2026-03-09T13:45:00", symbol: "US30", side: "BUY", pnl: -540, rMultiple: -1.5, setup: "NY continuation failed", session: "New York", durationMin: 88 },
    { id: 10, date: "2026-03-10T09:05:00", symbol: "GBPUSD", side: "BUY", pnl: -420, rMultiple: -1.2, setup: "Range expansion failure", session: "London", durationMin: 63 },
    { id: 11, date: "2026-03-11T08:15:00", symbol: "EURUSD", side: "BUY", pnl: -160, rMultiple: -0.6, setup: "VWAP reclaim fade", session: "London", durationMin: 58 },
    { id: 12, date: "2026-03-12T14:05:00", symbol: "XAUUSD", side: "SELL", pnl: -610, rMultiple: -1.9, setup: "Fade failed", session: "New York", durationMin: 29 },
    { id: 13, date: "2026-03-13T09:45:00", symbol: "EURUSD", side: "BUY", pnl: 920, rMultiple: 3.0, setup: "Macro drift recovery", session: "London", durationMin: 104 },
    { id: 14, date: "2026-03-16T08:55:00", symbol: "NAS100", side: "SELL", pnl: 740, rMultiple: 2.5, setup: "Open rejection recovery", session: "London", durationMin: 46 },
    { id: 15, date: "2026-03-16T15:35:00", symbol: "XAUUSD", side: "BUY", pnl: 680, rMultiple: 2.4, setup: "Momentum continuation", session: "New York", durationMin: 53 },
    { id: 16, date: "2026-03-17T09:20:00", symbol: "GBPUSD", side: "SELL", pnl: -145, rMultiple: -0.8, setup: "Countertrend", session: "London", durationMin: 34 },
    { id: 17, date: "2026-03-18T08:05:00", symbol: "EURUSD", side: "BUY", pnl: 860, rMultiple: 2.7, setup: "Asia range break", session: "London", durationMin: 62 },
    { id: 18, date: "2026-03-18T14:25:00", symbol: "US30", side: "SELL", pnl: 1120, rMultiple: 3.4, setup: "NY fade recovery", session: "New York", durationMin: 48 }
  ]
};

function createPayloadVariant(overrides = {}) {
  return {
    ...cloneJson(baseMockPayload),
    ...overrides,
    profile: {
      ...cloneJson(baseMockPayload.profile),
      ...(overrides.profile || {})
    },
    account: {
      ...cloneJson(baseMockPayload.account),
      ...(overrides.account || {})
    },
    riskProfile: {
      ...cloneJson(baseMockPayload.riskProfile),
      ...(overrides.riskProfile || {})
    },
    positions: overrides.positions ? cloneJson(overrides.positions) : cloneJson(baseMockPayload.positions),
    riskRules: overrides.riskRules ? cloneJson(overrides.riskRules) : cloneJson(baseMockPayload.riskRules),
    trades: overrides.trades ? cloneJson(overrides.trades) : cloneJson(baseMockPayload.trades)
  };
}

const fundedTrades = baseMockPayload.trades.map((trade, index) => ({
  ...trade,
  pnl: Math.round(trade.pnl * 0.42 - (index % 2 === 0 ? 260 : 190)),
  rMultiple: Number((trade.rMultiple * 0.72).toFixed(1)),
  durationMin: trade.durationMin + (index % 2 === 0 ? 6 : -4),
  setup: index % 4 === 0 ? "Funded stress test" : trade.setup
}));

const swingTrades = baseMockPayload.trades.map((trade, index) => ({
  ...trade,
  pnl: Math.round(trade.pnl * 1.18 + (index % 5 === 0 ? 55 : 20)),
  rMultiple: Number((trade.rMultiple * 1.1).toFixed(1)),
  durationMin: trade.durationMin + 35,
  session: index % 3 === 0 ? "Asia" : trade.session,
  setup: index % 3 === 0 ? "Macro swing build" : trade.setup
}));

const sandboxTrades = [
  { id: "sbx-jan-1", date: "2026-01-06T08:35:00", symbol: "EURUSD", side: "BUY", pnl: 280, rMultiple: 1.4, setup: "London continuation", session: "London", durationMin: 54 },
  { id: "sbx-jan-2", date: "2026-01-08T14:10:00", symbol: "XAUUSD", side: "SELL", pnl: -160, rMultiple: -0.8, setup: "Fade fail", session: "New York", durationMin: 36 },
  { id: "sbx-jan-3", date: "2026-01-10T09:05:00", symbol: "GBPUSD", side: "BUY", pnl: 340, rMultiple: 1.7, setup: "Range reclaim", session: "London", durationMin: 47 },
  { id: "sbx-jan-4", date: "2026-01-14T15:15:00", symbol: "NAS100", side: "SELL", pnl: -420, rMultiple: -1.3, setup: "Open fade", session: "New York", durationMin: 29 },
  { id: "sbx-jan-5", date: "2026-01-16T08:20:00", symbol: "EURUSD", side: "BUY", pnl: 610, rMultiple: 2.6, setup: "Macro drift", session: "London", durationMin: 71 },
  { id: "sbx-jan-6", date: "2026-01-21T10:25:00", symbol: "USDJPY", side: "SELL", pnl: 150, rMultiple: 0.9, setup: "Session fade", session: "London", durationMin: 33 },
  { id: "sbx-jan-7", date: "2026-01-23T14:45:00", symbol: "US30", side: "BUY", pnl: -240, rMultiple: -0.7, setup: "NY breakout fail", session: "New York", durationMin: 58 },
  { id: "sbx-feb-1", date: "2026-02-03T08:10:00", symbol: "EURUSD", side: "SELL", pnl: 390, rMultiple: 1.8, setup: "Asia range break", session: "London", durationMin: 49 },
  { id: "sbx-feb-2", date: "2026-02-05T09:55:00", symbol: "GBPUSD", side: "BUY", pnl: -210, rMultiple: -0.9, setup: "Liquidity sweep fail", session: "London", durationMin: 41 },
  { id: "sbx-feb-3", date: "2026-02-07T15:05:00", symbol: "XAUUSD", side: "BUY", pnl: 520, rMultiple: 2.4, setup: "NY continuation", session: "New York", durationMin: 64 },
  { id: "sbx-feb-4", date: "2026-02-11T08:45:00", symbol: "NAS100", side: "BUY", pnl: 440, rMultiple: 2.1, setup: "Open drive", session: "London", durationMin: 27 },
  { id: "sbx-feb-5", date: "2026-02-13T14:35:00", symbol: "US30", side: "SELL", pnl: -610, rMultiple: -1.7, setup: "NY reversal fail", session: "New York", durationMin: 52 },
  { id: "sbx-feb-6", date: "2026-02-18T08:55:00", symbol: "EURUSD", side: "BUY", pnl: 760, rMultiple: 2.9, setup: "London continuation", session: "London", durationMin: 86 },
  { id: "sbx-feb-7", date: "2026-02-20T10:40:00", symbol: "USDJPY", side: "SELL", pnl: -130, rMultiple: -0.6, setup: "Session fade", session: "London", durationMin: 31 },
  { id: "sbx-feb-8", date: "2026-02-24T14:20:00", symbol: "XAUUSD", side: "SELL", pnl: 310, rMultiple: 1.5, setup: "NY rejection", session: "New York", durationMin: 44 },
  ...baseMockPayload.trades
];

export const rawMockAccounts = {
  sandbox: {
    id: "sandbox",
    name: "KMFX Master",
    broker: "Sandbox institucional",
    sourceType: "mock",
    payload: createPayloadVariant({
      trades: sandboxTrades
    })
  },
  funded: {
    id: "funded",
    name: "Apex Evaluation",
    broker: "Entorno prop",
    sourceType: "mock",
    payload: createPayloadVariant({
      profile: {
        trader: "Kevin C.",
        desk: "Apex Evaluation",
        mode: "Cuenta de fondeo",
        broker: "Entorno prop",
        tagline: "Cuenta de evaluación con sizing más conservador, reglas estrictas y heat controlado."
      },
      account: {
        balance: 80250,
        equity: 79610,
        openPnl: -640,
        winRateTarget: 58,
        profitFactorTarget: 2,
        maxDrawdownLimit: 8
      },
      riskProfile: {
        currentRiskPct: 0.30,
        dailyLossLimitPct: 0.9,
        weeklyHeatLimitPct: 2.4,
        maxTradeRiskPct: 0.75,
        maxVolume: 1,
        allowedSessions: ["London", "New York"],
        allowedSymbols: ["EURUSD", "GBPUSD", "XAUUSD", "NAS100"],
        autoBlock: true
      },
      positions: [
        { id: "funded-pos-1", symbol: "EURUSD", side: "BUY", volume: 0.8, entry: 1.0836, current: 1.0852, pnl: 128 },
        { id: "funded-pos-2", symbol: "NAS100", side: "SELL", volume: 0.2, entry: 18288, current: 18215, pnl: 214 }
      ],
      riskRules: [
        { title: "Límite diario", description: "Protección estricta de challenge", value: "0.90%" },
        { title: "Riesgo por trade", description: "Sizing de evaluación", value: "0.30%" },
        { title: "Exposición abierta", description: "Capacidad simultánea", value: "1.30%" },
        { title: "Máx. pérdidas seguidas", description: "Bloqueo automático", value: "2" },
        { title: "Sesión principal", description: "Mayor consistencia", value: "London" },
        { title: "Cap sesión NY", description: "Control por volatilidad", value: "0.45%" }
      ],
      trades: fundedTrades
    })
  },
  swing: {
    id: "swing",
    name: "Macro Swing",
    broker: "Prime demo",
    sourceType: "mock",
    payload: createPayloadVariant({
      profile: {
        trader: "Kevin C.",
        desk: "Macro Swing",
        mode: "Cartera swing",
        broker: "Prime demo",
        tagline: "Libro multi-sesión con más carry, duración extendida y exposición táctica."
      },
      account: {
        balance: 214600,
        equity: 216980,
        openPnl: 2380,
        winRateTarget: 52,
        profitFactorTarget: 2.2,
        maxDrawdownLimit: 12
      },
      riskProfile: {
        currentRiskPct: 0.65,
        dailyLossLimitPct: 1.5,
        weeklyHeatLimitPct: 4.6,
        maxTradeRiskPct: 1.25,
        maxVolume: 2.4,
        allowedSessions: ["Asia", "London", "New York"],
        allowedSymbols: ["EURUSD", "GBPUSD", "XAUUSD", "US30", "NAS100", "USDJPY"],
        autoBlock: false
      },
      positions: [
        { id: "swing-pos-1", symbol: "XAUUSD", side: "BUY", volume: 1.2, entry: 3018.4, current: 3035.7, pnl: 1240 },
        { id: "swing-pos-2", symbol: "USDJPY", side: "SELL", volume: 1, entry: 150.1, current: 149.42, pnl: 680 },
        { id: "swing-pos-3", symbol: "US30", side: "BUY", volume: 0.5, entry: 42730, current: 43002, pnl: 460 }
      ],
      riskRules: [
        { title: "Límite diario", description: "Protección táctica", value: "1.50%" },
        { title: "Riesgo por trade", description: "Sizing de cartera", value: "0.65%" },
        { title: "Exposición abierta", description: "Capacidad multi-posición", value: "3.90%" },
        { title: "Máx. pérdidas seguidas", description: "Revisión discrecional", value: "4" },
        { title: "Sesión principal", description: "Flujo macro", value: "New York" },
        { title: "Cap sesión Asia", description: "Carry control", value: "0.80%" }
      ],
      trades: swingTrades
    })
  }
};

export const rawMockData = rawMockAccounts.sandbox.payload;
