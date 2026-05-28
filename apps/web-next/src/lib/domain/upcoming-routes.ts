export type UpcomingRoute = {
  href: string;
  title: string;
  description: string;
  nextStep: string;
};

export const upcomingRoutes = {
  risk: {
    href: "/risk",
    title: "RiskGuard",
    description:
      "El motor de riesgo se trabajará como una pieza propia para no mezclar reglas, bloqueadores y política MT5 antes de tiempo.",
    nextStep:
      "Cerrar el contrato visual y funcional de reglas, horarios, pares permitidos, riesgo variable y futura protección por EA.",
  },
  journal: {
    href: "/journal",
    title: "Review",
    description:
      "La revisión operativa necesita una pasada dedicada para separar diario, cola de revisión y análisis sin duplicar Insights.",
    nextStep:
      "Definir qué entra en V1 de review y qué queda para automatizaciones o análisis avanzado.",
  },
  journalReviewQueue: {
    href: "/journal/review-queue",
    title: "Review / Cola",
    description:
      "La cola de revisión quedará bloqueada hasta cerrar criterios claros de prioridad y edición.",
    nextStep:
      "Conectar solo operaciones que requieran revisión real y evitar listas largas sin acción.",
  },
  journalEntries: {
    href: "/journal/entries",
    title: "Review / Entradas",
    description:
      "Las entradas del diario requieren un flujo simple para que el trader no pierda velocidad operativa.",
    nextStep:
      "Diseñar captura rápida, edición y relación con trades cerrados.",
  },
  journalAiReview: {
    href: "/journal/ai-review",
    title: "Review / IA",
    description:
      "La revisión asistida se activará cuando tengamos datos suficientes y reglas claras de confianza.",
    nextStep:
      "Definir límites, fuentes y qué recomendaciones puede mostrar sin inventar conclusiones.",
  },
  strategies: {
    href: "/strategies",
    title: "Playbooks",
    description:
      "Los playbooks deben ayudar a corregir operativa sin depender de que el usuario etiquete todo manualmente desde el primer día.",
    nextStep:
      "Priorizar sesiones, símbolos y patrones repetibles antes de un laboratorio completo de estrategias.",
  },
  strategiesBacktestVsReal: {
    href: "/strategies/backtest-vs-real",
    title: "Playbooks / Backtest vs real",
    description:
      "La comparación entre backtest y real necesita importación y datos consistentes para no crear lecturas falsas.",
    nextStep:
      "Definir formato de importación, métricas mínimas y estados de datos insuficientes.",
  },
  strategiesPortfolio: {
    href: "/strategies/portfolio",
    title: "Playbooks / Portfolios",
    description:
      "Los portfolios de estrategias se trabajarán después de cerrar Portfolio y Trades V1.",
    nextStep:
      "Evitar duplicar Portfolio y preparar solo la relación entre estrategia, cuenta y riesgo.",
  },
  funding: {
    href: "/funding",
    title: "Prop Firms",
    description:
      "La gestión de fondeo se introducirá cuando las reglas, fases y payouts estén documentados con provenance suficiente.",
    nextStep:
      "Cerrar Fase 1, Fase 2 y Real/Funded sin inventar reglas de firma.",
  },
  fundingJourneys: {
    href: "/funding/journeys",
    title: "Prop Firms / Procesos",
    description:
      "Los procesos de fondeo necesitan una vista propia para no convertir Cuentas o RiskGuard en listas confusas.",
    nextStep:
      "Agrupar challenge, verificación y funded bajo una lectura única de progreso.",
  },
  fundingAccounts: {
    href: "/funding/accounts",
    title: "Prop Firms / Cuentas",
    description:
      "Las cuentas de fondeo ya aparecen en Cuentas; esta subruta queda reservada para reglas específicas de prop firms.",
    nextStep:
      "Definir qué información aporta aquí que no esté ya en Cuentas.",
  },
  fundingRules: {
    href: "/funding/rules",
    title: "Prop Firms / Reglas",
    description:
      "Las reglas de firma deben mostrarse solo cuando tengamos fuente clara o configuración del trader.",
    nextStep:
      "Separar reglas oficiales, reglas manuales y recomendaciones de KMFX.",
  },
  fundingPayouts: {
    href: "/funding/payouts",
    title: "Prop Firms / Payouts",
    description:
      "Los payouts requieren datos guardados o importados para no parecer promesas de cobro.",
    nextStep:
      "Definir ledger, fechas, comisiones y estado de solicitud.",
  },
  market: {
    href: "/market",
    title: "Mercado",
    description:
      "Mercado queda reservado para contexto externo que ayude a operar, no para saturar el panel con señales.",
    nextStep:
      "Mantener calendario macro como bloque simple y revisar si hacen falta más piezas.",
  },
  marketEconomicCalendar: {
    href: "/market/economic-calendar",
    title: "Mercado / Noticias",
    description:
      "El calendario macro ya tiene estrategia documentada, pero la sección completa queda fuera del cierre V1.",
    nextStep:
      "Validar proveedor embebido, CSP y fallback antes de activarlo como ruta visible.",
  },
  execution: {
    href: "/execution",
    title: "Ejecución",
    description:
      "Ejecución requiere métricas de timing, deslizamiento y disciplina suficientemente claras para no duplicar Insights.",
    nextStep:
      "Definir qué puede medirse desde trades cerrados y qué necesita datos MT5 adicionales.",
  },
} as const satisfies Record<string, UpcomingRoute>;

export const upcomingRouteList = Object.values(upcomingRoutes);
