function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

const workspaceTemplate = {
  connections: [
    {
      id: "conn-bridge",
      name: "MT5 Bridge",
      provider: "MetaTrader Adapter",
      status: "ready",
      endpoint: "wss://ws.kmfxedge.com",
      lastEvent: "Bridge profile listo para futuros enlaces",
      accountId: "sandbox",
      syncMode: "Realtime-ready",
      health: 92
    },
    {
      id: "conn-manual",
      name: "Manual Import",
      provider: "CSV / JSON Intake",
      status: "standby",
      endpoint: "Local workspace",
      lastEvent: "Pendiente de activar importador",
      accountId: "funded",
      syncMode: "Batch",
      health: 78
    },
    {
      id: "conn-api",
      name: "Broker API",
      provider: "Future API Adapter",
      status: "planned",
      endpoint: "No endpoint yet",
      lastEvent: "Diseño de contrato pendiente",
      accountId: "swing",
      syncMode: "Event-driven",
      health: 64
    }
  ],
  calculator: {
    symbol: "EURUSD",
    accountSize: "",
    riskPct: 0.5,
    entry: 1.0842,
    stop: 1.0827,
    target: 1.0878,
    stopPips: 15,
    commissionPerLot: 7
  },
  journal: {
    entries: [
      {
        id: "jr-1",
        accountId: "sandbox",
        date: "2026-03-18",
        symbol: "EURUSD",
        setup: "Asia range break",
        pnl: 260,
        grade: "A",
        notes: "Entrada alineada con estructura y buen manejo del riesgo.",
        lesson: "Escalar parcialmente mejora el hold psicológico."
      },
      {
        id: "jr-2",
        accountId: "funded",
        date: "2026-03-17",
        symbol: "NAS100",
        setup: "Funded continuation",
        pnl: 188,
        grade: "B",
        notes: "Buen timing pero salida demasiado temprana.",
        lesson: "Revisar reglas de gestión en cuentas de challenge."
      }
    ],
    form: {
      date: "2026-03-20",
      symbol: "",
      setup: "",
      pnl: "",
      grade: "B",
      notes: "",
      lesson: ""
    },
    editingId: null
  },
  strategies: {
    items: [
      {
        id: "st-1",
        name: "London Continuation",
        market: "EURUSD",
        timeframe: "M15",
        session: "London",
        status: "active",
        winRate: 58,
        rr: 1.9,
        score: 8.4,
        notes: "Setup principal para continuidad tras sweep y reclaim."
      },
      {
        id: "st-2",
        name: "NY Reversal Gold",
        market: "XAUUSD",
        timeframe: "M5",
        session: "New York",
        status: "testing",
        winRate: 51,
        rr: 2.3,
        score: 7.1,
        notes: "Interesante en volatilidad alta, aún requiere filtro macro."
      }
    ],
    form: {
      name: "",
      market: "",
      timeframe: "M15",
      session: "London",
      status: "testing",
      winRate: "",
      rr: "",
      score: "",
      notes: ""
    },
    editingId: null
  },
  fundedAccounts: [
    {
      id: "fd-1",
      accountId: "funded",
      firm: "Orion Funded",
      propFirm: "Orion Funded",
      programModel: "Editable",
      label: "Orion Challenge 100k",
      phase: "Challenge",
      size: 100000,
      balance: 104380,
      targetPct: 8,
      progressPct: 4.38,
      dailyDdPct: 2.8,
      maxDdPct: 6.4,
      daysRemaining: 18,
      status: "on-track"
    },
    {
      id: "fd-2",
      accountId: "sandbox",
      firm: "Apex",
      label: "Evaluation 50k",
      phase: "Funded",
      size: 50000,
      balance: 52340,
      targetPct: 0,
      progressPct: 4.68,
      dailyDdPct: 0.8,
      maxDdPct: 3.4,
      daysRemaining: 0,
      status: "funded"
    }
  ],
  market: {
    watchlist: [
      { symbol: "EURUSD", bias: "Bullish", regime: "Trend", changePct: 0.42, volatility: "Normal", session: "London" },
      { symbol: "XAUUSD", bias: "Reactive", regime: "Expansion", changePct: 1.14, volatility: "High", session: "New York" },
      { symbol: "NAS100", bias: "Bullish", regime: "Momentum", changePct: 0.88, volatility: "High", session: "New York" },
      { symbol: "USDJPY", bias: "Mean Revert", regime: "Range", changePct: -0.22, volatility: "Low", session: "Asia" }
    ],
    events: [
      { time: "08:30", title: "EU CPI", impact: "High", narrative: "Puede activar EUR crosses y reshuffle de FX beta." },
      { time: "14:00", title: "Fed Speaker", impact: "Medium", narrative: "Catalizador para índices y metales." },
      { time: "15:30", title: "US Cash Open", impact: "High", narrative: "Momento clave para NAS100 y US30." }
    ]
  },
  talent: {
    scorecards: [
      { trader: "Execution", score: 84, note: "Entradas limpias y consistentes en sesiones principales." },
      { trader: "Risk", score: 78, note: "Buena disciplina, aún con margen para bajar heat en rachas." },
      { trader: "Review", score: 72, note: "Journaling sólido pero todavía no diario en todas las cuentas." }
    ],
    focusAreas: [
      { title: "Recortar pérdidas rápido", status: "active", detail: "Reducir exposición cuando el trade invalida en los primeros 15 min." },
      { title: "Bloques de review", status: "planned", detail: "Cerrar cada semana con análisis de setups y sesiones." },
      { title: "Escalado parcial", status: "active", detail: "Protocolizar parciales en setups A+ y funded accounts." }
    ]
  },
  portfolio: {
    allocations: [
      { sleeve: "FX Intraday", weight: 42, pnl: 2680, risk: "Core" },
      { sleeve: "Indices Momentum", weight: 28, pnl: 1940, risk: "Opportunistic" },
      { sleeve: "Gold Tactical", weight: 18, pnl: 1325, risk: "Satellite" },
      { sleeve: "JPY Mean Revert", weight: 12, pnl: 420, risk: "Experimental" }
    ],
    mandates: [
      { name: "Capital preservation", status: "Healthy", detail: "Drawdown actual dentro del rango operativo esperado." },
      { name: "Cross-account diversification", status: "Watch", detail: "FX sigue concentrando buena parte del edge actual." },
      { name: "Session balance", status: "Healthy", detail: "London y NY ya aportan edge real al portfolio." }
    ]
  },
  glossary: {
    terms: [
      {
        term: "Win Rate",
        category: "Rendimiento",
        what: "Porcentaje de operaciones ganadoras sobre el total de operaciones cerradas.",
        why: "Ayuda a medir consistencia, pero solo tiene valor real si se interpreta junto al ratio beneficio/riesgo.",
        formula: "Operaciones ganadoras / Operaciones totales x 100"
      },
      {
        term: "P&L Total",
        category: "Rendimiento",
        what: "Resultado neto acumulado de las operaciones cerradas.",
        why: "Es la lectura más directa del rendimiento económico real del sistema o cuenta.",
        formula: "Suma de ganancias y pérdidas realizadas"
      },
      {
        term: "Operaciones Totales",
        category: "Rendimiento",
        what: "Número total de trades cerrados en el periodo analizado.",
        why: "Aporta contexto estadístico. Un buen resultado con muy pocas operaciones es menos fiable.",
        formula: "Conteo de operaciones cerradas"
      },
      {
        term: "Profit Factor",
        category: "Rendimiento",
        what: "Relación entre beneficio bruto y pérdida bruta.",
        why: "Mide si el sistema genera más dinero del que pierde. Suele ser una de las métricas más útiles para validar edge.",
        formula: "Beneficio bruto / Pérdida bruta"
      },
      {
        term: "Expectancy",
        category: "Rendimiento",
        what: "Ganancia media esperada por operación.",
        why: "Resume la calidad económica del sistema y sirve para comparar setups, sesiones o cuentas.",
        formula: "P&L neto / Número de operaciones"
      },
      {
        term: "Mejor Trade",
        category: "Rendimiento",
        what: "Operación individual con mayor ganancia monetaria.",
        why: "Ayuda a entender el techo reciente del edge y cuánto depende el resultado de outliers positivos.",
        formula: "Máximo P&L por trade"
      },
      {
        term: "Beneficio Bruto",
        category: "Rendimiento",
        what: "Suma de todas las operaciones ganadoras.",
        why: "Permite comparar capacidad de captura de ganancias frente a las pérdidas.",
        formula: "Suma de P&L positivos"
      },
      {
        term: "Pérdida Bruta",
        category: "Rendimiento",
        what: "Suma absoluta de todas las operaciones perdedoras.",
        why: "Ayuda a medir cuánto capital se sacrifica para producir el resultado final.",
        formula: "Valor absoluto de la suma de P&L negativos"
      },
      {
        term: "Ganancia Media",
        category: "Rendimiento",
        what: "Ganancia media de las operaciones positivas.",
        why: "Mide la calidad de las salidas ganadoras y el espacio que deja correr al precio.",
        formula: "Beneficio bruto / Número de trades ganadores"
      },
      {
        term: "Pérdida Media",
        category: "Rendimiento",
        what: "Pérdida media de las operaciones negativas.",
        why: "Sirve para validar disciplina y consistencia en el control del riesgo.",
        formula: "Pérdida bruta / Número de trades perdedores"
      },
      {
        term: "Comisiones Estimadas",
        category: "Rendimiento",
        what: "Coste operativo aproximado de ejecutar la muestra actual.",
        why: "Evita sobreestimar el edge cuando la frecuencia operativa es alta.",
        formula: "Número de operaciones x coste estimado por operación"
      },
      {
        term: "Mejor Mes",
        category: "Rendimiento",
        what: "Mes con mayor P&L neto dentro de la muestra.",
        why: "Ayuda a detectar dónde el sistema ha rendido mejor y cuánto pesa ese periodo en el histórico.",
        formula: "Máximo P&L mensual"
      },
      {
        term: "Peor Mes",
        category: "Rendimiento",
        what: "Mes con peor P&L neto dentro de la muestra.",
        why: "Sirve para estimar estrés operativo y tolerancia necesaria en ciclos desfavorables.",
        formula: "Mínimo P&L mensual"
      },
      {
        term: "Max Drawdown",
        category: "Riesgo",
        what: "Mayor caída desde un pico de equity hasta el valle posterior.",
        why: "Define la profundidad real del peor retroceso histórico y condiciona sizing, tolerancia y supervivencia.",
        formula: "(Pico de equity - Valle posterior) / Pico de equity"
      },
      {
        term: "Balance",
        category: "Riesgo",
        what: "Capital realizado de la cuenta sin incluir flotante abierto.",
        why: "Es la referencia base para evaluar crecimiento real y límites de riesgo.",
        formula: "Balance inicial + P&L realizado"
      },
      {
        term: "Equity",
        category: "Riesgo",
        what: "Valor actual de la cuenta incluyendo posiciones abiertas.",
        why: "Muestra la situación real del capital en este instante, no solo lo ya cerrado.",
        formula: "Balance + P&L flotante"
      },
      {
        term: "Open P&L",
        category: "Riesgo",
        what: "Ganancia o pérdida flotante de las posiciones todavía abiertas.",
        why: "Aporta visibilidad inmediata del riesgo y del impacto del mercado sobre la cuenta viva.",
        formula: "Suma del P&L no realizado de posiciones abiertas"
      },
      {
        term: "Heat",
        category: "Riesgo",
        what: "Riesgo agregado abierto en ese momento entre todas las posiciones.",
        why: "Evita subestimar exposición total cuando varias posiciones parecen pequeñas por separado.",
        formula: "Suma del riesgo abierto por posición"
      },
      {
        term: "Total Semana",
        category: "Seguimiento",
        what: "P&L neto acumulado de la semana mostrada en el panel.",
        why: "Da una lectura rápida del momentum operativo reciente sin necesidad de abrir analytics.",
        formula: "Suma del P&L diario de la semana visible"
      },
      {
        term: "Días Ganadores",
        category: "Seguimiento",
        what: "Número de días de la semana o del mes que cerraron en positivo.",
        why: "Ayuda a medir consistencia diaria más allá del resultado agregado.",
        formula: "Conteo de días con P&L > 0"
      },
      {
        term: "Días Activos",
        category: "Seguimiento",
        what: "Número de días con al menos una operación registrada.",
        why: "Aporta contexto de frecuencia operativa y densidad de muestra.",
        formula: "Conteo de días con trades > 0"
      },
      {
        term: "Retorno Semanal",
        category: "Seguimiento",
        what: "Variación porcentual generada por el P&L neto de la semana respecto al balance de referencia.",
        why: "Permite comparar semanas entre sí sin depender solo del importe nominal.",
        formula: "P&L semanal / Balance de referencia x 100"
      },
      {
        term: "Retorno Acumulado",
        category: "Seguimiento",
        what: "Crecimiento porcentual total desde el balance inicial hasta el estado actual del modelo.",
        why: "Resume el progreso real de la cuenta y conecta el resultado monetario con tamaño de capital.",
        formula: "P&L acumulado / Balance inicial x 100"
      },
      {
        term: "Trader Score",
        category: "Seguimiento",
        what: "Puntuación compuesta que resume disciplina y eficiencia operativa en una sola escala.",
        why: "Sirve para leer de un vistazo si el rendimiento reciente está alineado con calidad de ejecución y control del riesgo.",
        formula: "Score compuesto a partir de win rate, R:R y drawdown"
      },
      {
        term: "R-Multiple",
        category: "Ejecución",
        what: "Resultado del trade expresado en múltiplos del riesgo asumido.",
        why: "Normaliza resultados entre operaciones con distinto tamaño y hace más comparables los setups.",
        formula: "Resultado del trade / Riesgo inicial"
      },
      {
        term: "Liquidity Sweep",
        category: "Ejecución",
        what: "Barrido rápido de máximos o mínimos para capturar liquidez antes de revertir o continuar.",
        why: "Suele marcar zonas de entrada útiles cuando se combina con contexto, timing y confirmación estructural.",
        formula: "No aplica"
      },
      {
        term: "Posiciones Abiertas",
        category: "Ejecución",
        what: "Conjunto de trades todavía activos con volumen, entrada, precio actual y P&L flotante.",
        why: "Sirve para leer exposición viva, concentración y riesgo inmediato del libro.",
        formula: "No aplica"
      },
      {
        term: "Sesión con Mejor Edge",
        category: "Ejecución",
        what: "Franja operativa que concentra el mejor comportamiento estadístico reciente.",
        why: "Ayuda a enfocar capital y atención en las ventanas donde el sistema funciona mejor.",
        formula: "Comparación de P&L, win rate y muestra por sesión"
      },
      {
        term: "Sharpe Ratio",
        category: "Avanzadas",
        what: "Relación entre retorno medio y volatilidad de los retornos.",
        why: "Ayuda a medir si el rendimiento compensa la variabilidad del sistema.",
        formula: "Retorno medio / Desviación estándar de retornos"
      },
      {
        term: "Sortino Ratio",
        category: "Avanzadas",
        what: "Versión del Sharpe centrada solo en volatilidad negativa.",
        why: "Penaliza únicamente el downside y suele ser más útil para trading discrecional.",
        formula: "Retorno medio / Desviación estándar de retornos negativos"
      },
      {
        term: "Calmar Ratio",
        category: "Avanzadas",
        what: "Relación entre retorno y drawdown máximo.",
        why: "Mide cuánta rentabilidad produce el sistema por cada unidad de dolor histórico.",
        formula: "Retorno acumulado / Max drawdown"
      },
      {
        term: "Recovery Factor",
        category: "Avanzadas",
        what: "Capacidad del sistema para recuperar drawdowns con beneficio neto.",
        why: "Ayuda a distinguir un sistema rentable de otro realmente recuperable.",
        formula: "Beneficio neto / Drawdown máximo"
      },
      {
        term: "R:R Medio",
        category: "Avanzadas",
        what: "Relación entre ganancia media y pérdida media.",
        why: "Complementa al win rate y muestra si el sistema deja correr suficiente las ganancias.",
        formula: "Ganancia media / Pérdida media"
      },
      {
        term: "DD Diario",
        category: "Prop Firms",
        what: "Caída porcentual de la cuenta dentro del día frente al punto de referencia exigido por la firma.",
        why: "Es uno de los límites que más cuentas prop hacen incumplir.",
        formula: "Pérdida diaria / Balance o equity de referencia x 100"
      },
      {
        term: "DD Máximo",
        category: "Prop Firms",
        what: "Caída máxima permitida o alcanzada dentro del marco de la cuenta prop.",
        why: "Determina supervivencia del challenge o permanencia en cuenta fondeada.",
        formula: "Caída máxima desde pico o balance inicial según regla de la firma"
      },
      {
        term: "Fase de Fondeo",
        category: "Prop Firms",
        what: "Etapa concreta del ciclo de evaluación o cuenta financiada.",
        why: "Cambia los límites operativos y la presión de riesgo según el punto del challenge o cuenta prop.",
        formula: "No aplica"
      }
    ]
  },
  debug: {
    panels: [
      { name: "Salud del store", value: "Estable", detail: "Todas las páginas renderizan desde estado centralizado." },
      { name: "Capa de adapters", value: "Lista", detail: "Fuente local normalizada y punto de entrada MT5 preparado." },
      { name: "Bindings UI", value: "Activos", detail: "Navegación y módulos reactivos sin handlers inline legacy." }
    ],
    checkpoints: [
      { id: "dbg-1", label: "Página actual", value: "dashboard" },
      { id: "dbg-2", label: "Cuenta actual", value: "sandbox" },
      { id: "dbg-3", label: "Clave de persistencia", value: "kmfx_frontend_state" }
    ]
  }
};

export function createMockWorkspaceState() {
  return cloneJson(workspaceTemplate);
}
