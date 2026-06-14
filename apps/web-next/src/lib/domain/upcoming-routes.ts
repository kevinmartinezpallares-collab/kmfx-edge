export type UpcomingRoute = {
  href: string;
  title: string;
  description: string;
  nextStep: string;
};

export const upcomingRoutes = {
  risk: {
    href: "/risk",
    title: "Mesa de Riesgo",
    description:
      "Mesa de Riesgo queda reservada para beta cerrada hasta completar reglas, límites, política MT5 y frontera técnica.",
    nextStep:
      "Cerrar el monitor de límites, estados de datos insuficientes y confirmación EA antes de activarlo como ruta pública.",
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
  estrategias: {
    href: "/estrategias",
    title: "Playbooks",
    description:
      "Los playbooks deben ayudar a corregir operativa sin depender de que el usuario etiquete todo manualmente desde el primer día.",
    nextStep:
      "Priorizar sesiones, símbolos y patrones repetibles antes de un laboratorio completo de estrategias.",
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
      "Los procesos de fondeo necesitan una vista propia para no convertir Cuentas o Mesa de Riesgo en listas confusas.",
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
  ejecucion: {
    href: "/ejecucion",
    title: "Ejecución",
    description:
      "Ejecución requiere métricas de timing, deslizamiento y disciplina suficientemente claras para no duplicar Insights.",
    nextStep:
      "Definir qué puede medirse desde trades cerrados y qué necesita datos MT5 adicionales.",
  },
} as const satisfies Record<string, UpcomingRoute>;

export const upcomingRouteList = Object.values(upcomingRoutes);
