# KMFX Edge Next.js Cross-Route Dependency Map

Estado: contrato operativo de dependencias  
Ultima revision: 2026-05-16  
Alcance: evitar que las rutas Next dupliquen decisiones, inventen datos o conviertan el Panel en una pagina gigante de widgets.

## Principio

Cada ruta debe tener una pregunta principal.

Si un bloque no ayuda a responder esa pregunta, debe moverse a la ruta dueña o aparecer solo como enlace/contexto breve.

## Ownership por ruta

| Ruta | Pregunta que responde | Es dueña de | Puede consumir | No debe absorber |
| --- | --- | --- | --- | --- |
| `/dashboard` (`Panel`) | Que pasa ahora, que riesgo tengo y que debo revisar | decision center, cuenta activa, attention stack | RiskGuard, Trades, Review, Calendar, Portfolio, Prop Firms | tablas profundas, reglas completas, status tecnico global |
| `/risk` (`RiskGuard`) | Puedo abrir mas riesgo y bajo que limite | riskSnapshot, policy evaluation, exposure, next-risk cap | Funding rules, Portfolio policy, open positions | diario, calendario completo, accounting de payouts |
| `/accounts` (`Cuentas`) | Que cuentas existen y cual esta viva/stale | identidad de cuenta, sync health, account switching | snapshots MT5, plan/access display | reglas funding, portfolio policy profunda |
| `/capital` (`Portfolio`) | Como se distribuye capital/riesgo entre cuentas | allocation, contribution, concentration, policy readiness | accounts, risk exposure, trades attribution | journey de fondeo completo, review journal |
| `/trades` | Que operaciones cerradas existen y como se atribuyen | ledger, costs, executions, tags, setup attribution base | accounts, Review, Calendar | analisis de edge avanzado o reglas funding |
| `/calendar` | Que paso por dia/mes/ano y que dia revisar | day/month/year aggregation, PnL calendar, day drill-down | trades, Review queue, account context | risk policy editor, funding journey detail |
| `/journal` (`Review`) | Que debo revisar para mejorar | review queue, entries, AI review surfaces | trades, calendar, setups | portfolio allocation, funding economics |
| `/analytics` (`Insights`) | Donde esta o no esta la ventaja | performance attribution, daily/hourly/risk insights | trades, riskSnapshot, journal tags | market watchlist, account settings |
| `/strategies` (`Playbooks`) | Que setups/playbooks son operables | setup library, backtest vs real, strategy portfolio | trades, risk, portfolio policy | trade ledger completo |
| `/funding` (`Prop Firms`) | Estoy mas cerca de pasar, cobrar o romper esta cuenta | FundingJourney, stages, rules, payouts, payout defense | accounts, trades, riskSnapshot | portfolio routing general, live execution controls |
| `/tools/calculator` (`Calculadora`) | Que lotaje/riesgo puedo usar ahora | sizing calculator, Myfxbook-style risk math | active account, risk caps, FX conversions | symbol specs as sole truth, policy editing |
| `/settings` (`Ajustes`) | Que configuracion segura puede cambiar el usuario | safe config wrapper, preferences | auth/billing status as read-only | sensitive auth migration, billing mutation |
| `/debug` | Que diagnostico interno necesita admin/dev | admin-only diagnostics | adapters, snapshots, route health | public trader UX |

## Datos compartidos canonicos

| Dato canonico | Owner semantico | Rutas consumidoras | Regla |
| --- | --- | --- | --- |
| `TradingAccount` | `account` | Panel, Accounts, RiskGuard, Portfolio, Prop Firms, Calculator | No inferir cuenta real/demo/funding si la fuente no lo soporta; mostrar contexto solo si cambia decision. |
| `AccountSnapshot` | `account` | Panel, Accounts, Portfolio, RiskGuard | Balance/equity/PnL son sensibles; nunca exponer como demo si falta live provenance. |
| `ClosedTrade` | `transport/ui_derived` | Trades, Calendar, Review, Insights, Playbooks | Trades es el ledger principal; las demas rutas agregan, no reescriben. |
| `RiskSnapshot` | `risk` | Panel, RiskGuard, Portfolio, Funding, Calculator | RiskGuard decide; Panel resume; Calculator consume caps. |
| `FundingJourney` | `funding` | Prop Firms, Panel context, RiskGuard funding caps | Prop Firms es owner; Panel no debe convertirse en dashboard de fondeo. |
| `FundingPayout` | `funding` | Prop Firms overview/payouts | Payouts no son trading PnL. |
| `PortfolioPolicy` | `portfolio` | Portfolio, RiskGuard, future EA export | Mientras no exista policy versionada, mostrar readiness, no aplicar reglas. |
| `JournalReviewItem` | `journal` | Review, Panel attention, Calendar drill-down | Review es owner; Calendar/Panel enlazan. |

## Reglas anti-drift

- `Panel` no debe tener subrutas V1 ni absorber contenido profundo de otras secciones.
- `Prop Firms` no debe ser una lista plana de cuentas; debe agrupar por `FundingJourney`.
- `Portfolio` no debe prometer routing/EA export hasta tener policy versionada.
- `Calculator` puede consumir caps, pero no debe guardar ni editar policies en V1.
- `Debug` no puede aparecer como experiencia normal del trader.
- Ninguna ruta debe convertir `requires_review` en un valor inventado para que la UI se vea completa.

## Estado de cierre

- `Panel`, `Trades`, `Calendar`, `Review`, `RiskGuard`, `Portfolio` y `Prop Firms` tienen ownership definido.
- La validacion visual final sigue pendiente por ruta.
- Los microajustes de Calendar quedan pospuestos para una pasada dedicada.
