# KMFX Edge Data Dictionary v1

Estado: diccionario de datos maestro  
Ultima revision: 2026-05-14  
Alcance: definir los campos clave que alimentan la migracion a Next.js y los modulos core de KMFX sin cambiar el runtime actual.

## Proposito

Este documento cierra la capa semantica minima que necesitabamos antes de empezar la migracion real:

- que dato existe;
- de donde sale;
- quien lo posee;
- si es editable o derivado;
- con que frecuencia cambia;
- que sensibilidad tiene;
- y como debe tratarlo la nueva app.

No es un contrato de transporte puro.

Tampoco es un schema de base de datos.

Es el mapa de verdad funcional para que UI, adaptadores, selectores y futuras rutas Next hablen del mismo dato con el mismo significado.

## Regla de interpretacion

Cada campo se clasifica por:

- `fuente`: origen primario del dato
- `ownership`: capa que debe considerarse dueña del valor
- `tipo`: primitivo o estructura
- `modo`: `live`, `persisted`, `derived`, `manual`, `preset`
- `editable`: si usuario o sistema lo pueden editar
- `refresh`: ritmo esperado de actualizacion
- `sensibilidad`: `baja`, `media`, `alta`, `secreta`

## Fuentes canonicas

Valores posibles en `fuente`:

- `mt5_ea`
- `backend_account_store`
- `backend_risk_engine`
- `backend_billing_or_entitlements`
- `frontend_adapter`
- `frontend_selector`
- `workspace_manual`
- `funding_preset_registry`
- `portfolio_policy_store`

## Ownership canonico

Valores posibles en `ownership`:

- `account`
- `transport`
- `risk`
- `funding`
- `portfolio`
- `preferences`
- `journal`
- `strategy`
- `billing`
- `ui_derived`

## Notas de seguridad

- Ningun secreto de conexion o auth debe formar parte de los contratos UI migrados.
- Ninguna key completa debe aparecer en snapshots persistidos o payloads de frontend.
- Los datos de balances, equity y PnL son `alta` sensibilidad.
- Reglas y configuraciones de riesgo/funding son `media` o `alta` sensibilidad.

## 1. TradingAccount

Entidad canonica:

- identidad live de una cuenta conectada o registrada

| Campo | Tipo | Fuente | Ownership | Modo | Editable | Refresh | Sensibilidad | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `accountId` | string | `backend_account_store` | `account` | persisted | no | bajo demanda | alta | Identificador canonico de KMFX para la cuenta. |
| `userId` | string | `backend_account_store` | `account` | persisted | no | bajo demanda | alta | Nunca inferir ownership en frontend. |
| `externalAccountId` | string \| null | `backend_account_store` | `account` | persisted | no | bajo demanda | media | Puede mapear a identidad externa. |
| `login` | string | `mt5_ea` | `account` | live | no | sync | alta | Identidad MT5 principal. |
| `displayName` | string | `backend_account_store` | `account` | persisted | si limitado | bajo demanda | media | Etiqueta visible de la cuenta. |
| `accountName` | string \| null | `mt5_ea` | `account` | live | no | sync | media | Nombre expuesto por broker si existe. |
| `broker` | string | `mt5_ea` | `account` | live | no | sync | media | Broker/compania. |
| `server` | string | `mt5_ea` | `account` | live | no | sync | media | Servidor MT5. |
| `platform` | string | `mt5_ea` | `account` | live | no | sync | baja | Esperado `mt5`. |
| `accountType` | string \| null | `mt5_ea` | `account` | live | no | sync | baja | Demo/live/real si viene informado. |
| `sourceType` | string | `backend_account_store` | `account` | persisted | no | bajo demanda | baja | `mt5`, `mock`, etc. |
| `baseCurrency` | string | `mt5_ea` | `account` | live | no | sync | media | Divisa base de cuenta. |
| `connectionMode` | string \| null | `backend_account_store` | `account` | persisted | no | bajo demanda | media | Contexto de conexion. |
| `status` | string | `backend_account_store` | `account` | persisted | no | bajo demanda | media | `active`, `pending`, `stale`, etc. |
| `connectionState` | string | `frontend_adapter` | `ui_derived` | derived | no | client poll | baja | Estado normalizado para UI. |
| `lastSyncAt` | string \| null | `backend_account_store` | `account` | persisted | no | sync | media | Timestamp de ultima sync valida. |
| `isDefault` | boolean | `backend_account_store` | `account` | persisted | si | bajo demanda | baja | Preferencia de cuenta por defecto. |
| `isArchived` | boolean | `backend_account_store` | `account` | persisted | si | bajo demanda | baja | Oculta la cuenta de flujos principales. |

## 2. AccountSnapshot

Entidad canonica:

- estado economico actual de la cuenta

| Campo | Tipo | Fuente | Ownership | Modo | Editable | Refresh | Sensibilidad | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `balance` | number | `mt5_ea` | `account` | live | no | sync | alta | Balance cerrado actual. |
| `equity` | number | `mt5_ea` | `account` | live | no | sync | alta | Equity actual. |
| `floatingPnl` | number | `mt5_ea` | `account` | live | no | sync | alta | PnL flotante. |
| `closedPnl` | number \| null | `frontend_selector` | `ui_derived` | derived | no | recompute | alta | Derivable desde trades si falta dato bruto. |
| `totalPnl` | number \| null | `frontend_selector` | `ui_derived` | derived | no | recompute | alta | Normalmente `closed + floating`. |
| `margin` | number | `mt5_ea` | `account` | live | no | sync | media | Margen usado. |
| `freeMargin` | number | `mt5_ea` | `account` | live | no | sync | media | Margen libre. |
| `marginLevel` | number | `mt5_ea` | `account` | live | no | sync | media | Salud de margen. |
| `openPositionsCount` | number | `frontend_adapter` | `ui_derived` | derived | no | recompute | baja | Derivado de posiciones abiertas. |
| `dailyStartEquity` | number \| null | `mt5_ea` | `risk` | live | no | sync | alta | Base intradia si existe. |
| `dailyPeakEquity` | number \| null | `mt5_ea` | `risk` | live | no | sync | alta | Pico intradia si existe. |
| `equityPeak` | number \| null | `mt5_ea` | `risk` | live | no | sync | alta | Pico historico para DD total. |

## 3. Position

Entidad canonica:

- posicion abierta normalizada

| Campo | Tipo | Fuente | Ownership | Modo | Editable | Refresh | Sensibilidad | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `positionId` | string | `mt5_ea` | `transport` | live | no | sync | media | Clave de agrupacion estable cuando existe. |
| `ticket` | string | `mt5_ea` | `transport` | live | no | sync | media | Ticket MT5. |
| `symbol` | string | `mt5_ea` | `account` | live | no | sync | media | Simbolo broker, incluyendo sufijos. |
| `side` | `"BUY"` \| `"SELL"` | `mt5_ea` | `account` | live | no | sync | baja | Lado normalizado. |
| `volume` | number | `mt5_ea` | `account` | live | no | sync | media | Volumen abierto actual. |
| `entryPrice` | number | `mt5_ea` | `account` | live | no | sync | media | Precio de entrada. |
| `currentPrice` | number | `mt5_ea` | `account` | live | no | sync | media | Precio actual. |
| `stopLossPrice` | number | `mt5_ea` | `account` | live | no | sync | media | `0` si no existe. |
| `takeProfitPrice` | number | `mt5_ea` | `account` | live | no | sync | media | `0` si no existe. |
| `openTime` | string | `mt5_ea` | `transport` | live | no | sync | media | ISO o normalizado a ISO. |
| `openTimeUnix` | number \| null | `mt5_ea` | `transport` | live | no | sync | baja | Preferido para UTC canonico. |
| `profit` | number | `mt5_ea` | `account` | live | no | sync | alta | Resultado flotante abierto. |
| `swap` | number \| null | `mt5_ea` | `account` | live | no | sync | media | Si broker lo expone. |
| `strategyTag` | string \| null | `mt5_ea` | `strategy` | live | no | sync | baja | Comentario o etiqueta. |
| `magic` | string \| null | `mt5_ea` | `transport` | live | no | sync | baja | Magic number si existe. |

## 4. Trade

Entidad canonica:

- trade agrupado a partir de uno o varios deals MT5

| Campo | Tipo | Fuente | Ownership | Modo | Editable | Refresh | Sensibilidad | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `tradeId` | string | `frontend_adapter` | `ui_derived` | derived | no | recompute | media | Id UI estable por agrupacion. |
| `parentId` | string | `frontend_adapter` | `ui_derived` | derived | no | recompute | media | Suele mapear a `position_id`. |
| `ticket` | string | `mt5_ea` | `transport` | live | no | sync | media | Ticket deal base. |
| `positionId` | string \| null | `mt5_ea` | `transport` | live | no | sync | media | Clave principal de agrupacion. |
| `symbol` | string | `mt5_ea` | `account` | live | no | sync | media | Simbolo cerrado. |
| `side` | `"BUY"` \| `"SELL"` | `frontend_adapter` | `ui_derived` | derived | no | recompute | baja | Lado original resuelto. |
| `technicalSide` | `"BUY"` \| `"SELL"` | `mt5_ea` | `transport` | live | no | sync | baja | Lado tecnico del deal. |
| `volume` | number | `frontend_adapter` | `ui_derived` | derived | no | recompute | media | Volumen total agrupado. |
| `entryPrice` | number \| null | `mt5_ea` | `transport` | live | no | sync | media | Precio de entrada. |
| `exitPrice` | number \| null | `mt5_ea` | `transport` | live | no | sync | media | Precio de salida. |
| `openTime` | string \| null | `mt5_ea` | `transport` | live | no | sync | media | Apertura normalizada. |
| `closeTime` | string | `mt5_ea` | `transport` | live | no | sync | media | Cierre normalizado. |
| `closeTimeUnix` | number \| null | `mt5_ea` | `transport` | live | no | sync | baja | Preferido para agrupacion temporal. |
| `profit` | number | `mt5_ea` | `account` | live | no | sync | alta | Profit bruto agregado. |
| `commission` | number | `mt5_ea` | `account` | live | no | sync | media | Comisiones agregadas. |
| `swap` | number | `mt5_ea` | `account` | live | no | sync | media | Swap agregado. |
| `fees` | number \| null | `mt5_ea` | `account` | live | no | sync | media | Fees extra si vienen. |
| `netPnl` | number | `frontend_adapter` | `ui_derived` | derived | no | recompute | alta | `profit + commission + swap + dividend + fees`. |
| `rMultiple` | number \| null | `mt5_ea` | `strategy` | live | no | sync | media | Si existe. |
| `setup` | string \| null | `mt5_ea` | `strategy` | live | no | sync | baja | Comentario o strategy tag. |
| `session` | string | `frontend_adapter` | `ui_derived` | derived | no | recompute | baja | Inferida o informada. |
| `durationMin` | number \| null | `frontend_adapter` | `ui_derived` | derived | no | recompute | baja | Derivada de open/close. |
| `tradingDayKey` | string | `frontend_adapter` | `ui_derived` | derived | no | recompute | baja | Clave de agrupacion calendario. |
| `monthKey` | string | `frontend_adapter` | `ui_derived` | derived | no | recompute | baja | Clave mensual. |
| `partials[]` | array | `frontend_adapter` | `ui_derived` | derived | no | recompute | media | Parciales visibles del trade. |
| `executions[]` | array | `frontend_adapter` | `ui_derived` | derived | no | recompute | media | Deals individuales. |

## 5. ReportMetrics

Entidad canonica:

- metrica agregada calculada preferentemente en backend

| Campo | Tipo | Fuente | Ownership | Modo | Editable | Refresh | Sensibilidad | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `balance` | number | `backend_risk_engine` | `risk` | derived | no | sync | alta | Puede reflejar snapshot reconciliado. |
| `equity` | number | `backend_risk_engine` | `risk` | derived | no | sync | alta | Igual. |
| `netProfit` | number | `backend_risk_engine` | `risk` | derived | no | sync | alta | Profit neto agregado. |
| `grossProfit` | number | `backend_risk_engine` | `risk` | derived | no | sync | alta | Profit bruto positivo. |
| `grossLoss` | number | `backend_risk_engine` | `risk` | derived | no | sync | alta | Perdida bruta. |
| `netGrossProfit` | number \| null | `backend_risk_engine` | `risk` | derived | no | sync | alta | Si existe contrato separado. |
| `netGrossLoss` | number \| null | `backend_risk_engine` | `risk` | derived | no | sync | alta | Igual. |
| `winRate` | number | `backend_risk_engine` | `risk` | derived | no | sync | media | Porcentaje ganador. |
| `totalTrades` | number | `backend_risk_engine` | `risk` | derived | no | sync | baja | Total de trades de muestra. |
| `profitFactor` | number | `backend_risk_engine` | `risk` | derived | no | sync | media | Debe quedar clara su base net/gross. |
| `profitFactorBasis` | string | `backend_risk_engine` | `risk` | derived | no | sync | baja | `net`, `gross`, `legacy`. |
| `drawdownPct` | number | `backend_risk_engine` | `risk` | derived | no | sync | media | Drawdown agregado. |
| `commissions` | number | `backend_risk_engine` | `risk` | derived | no | sync | media | Costes acumulados. |
| `swaps` | number | `backend_risk_engine` | `risk` | derived | no | sync | media | Swaps acumulados. |
| `dividends` | number \| null | `backend_risk_engine` | `risk` | derived | no | sync | media | Si aplica. |
| `winTrades` | number | `backend_risk_engine` | `risk` | derived | no | sync | baja | Conteo ganador. |
| `lossTrades` | number | `backend_risk_engine` | `risk` | derived | no | sync | baja | Conteo perdedor. |
| `bestTrade` | number | `backend_risk_engine` | `risk` | derived | no | sync | media | Mejor trade. |
| `worstTrade` | number | `backend_risk_engine` | `risk` | derived | no | sync | media | Peor trade. |
| `averageHoldMinutes` | number \| null | `backend_risk_engine` | `risk` | derived | no | sync | baja | Hold medio. |
| `tradesPerWeek` | number \| null | `backend_risk_engine` | `risk` | derived | no | sync | baja | Frecuencia. |
| `source` | string | `backend_risk_engine` | `risk` | derived | no | sync | baja | Trazabilidad de origen. |

## 6. RiskSnapshot

Entidad canonica:

- bloque live/read-only que resume riesgo, policy y evaluacion

### 6.1 RiskSnapshot.summary

| Campo | Tipo | Fuente | Ownership | Modo | Editable | Refresh | Sensibilidad | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `floatingDrawdownPct` | number | `backend_risk_engine` | `risk` | derived | no | sync | media | DD flotante actual. |
| `peakToEquityDrawdownPct` | number | `backend_risk_engine` | `risk` | derived | no | sync | media | Pico a equity. |
| `rollingMaxDrawdownPct` | number | `backend_risk_engine` | `risk` | derived | no | sync | media | Rolling DD. |
| `persistedMaxDrawdownPct` | number | `backend_risk_engine` | `risk` | derived | no | sync | media | DD persistido. |
| `maxDrawdownLimitPct` | number | `backend_risk_engine` | `risk` | derived | no | sync | media | Limite efectivo usado. |
| `distanceToMaxDdLimitPct` | number | `backend_risk_engine` | `risk` | derived | no | sync | media | Distancia a limite. |
| `dailyDrawdownPct` | number | `backend_risk_engine` | `risk` | derived | no | sync | media | DD diario. |
| `dailyPeakEquity` | number | `backend_risk_engine` | `risk` | derived | no | sync | alta | Pico intradia usado por motor. |
| `distanceToDailyDdLimitPct` | number | `backend_risk_engine` | `risk` | derived | no | sync | media | Distancia a DD diario. |
| `totalOpenRiskAmount` | number | `backend_risk_engine` | `risk` | derived | no | sync | alta | Riesgo monetario abierto. |
| `totalOpenRiskPct` | number | `backend_risk_engine` | `risk` | derived | no | sync | media | Heat abierto %. |
| `maxRiskPerTradePct` | number | `backend_risk_engine` | `risk` | derived | no | sync | media | Mayor riesgo por trade. |
| `maxOpenTradeRiskPct` | number | `backend_risk_engine` | `risk` | derived | no | sync | media | Mayor posicion abierta %. |
| `openPositionsCount` | number | `backend_risk_engine` | `risk` | derived | no | sync | baja | Numero de posiciones abiertas. |
| `portfolioHeatLimitPct` | number \| null | `backend_risk_engine` | `risk` | derived | no | sync | media | Limite de heat. |
| `distanceToHeatLimitPct` | number \| null | `backend_risk_engine` | `risk` | derived | no | sync | media | Distancia a heat. |
| `heatUsageRatioPct` | number \| null | `backend_risk_engine` | `risk` | derived | no | sync | media | Uso del heat permitido. |

### 6.2 RiskSnapshot.status

| Campo | Tipo | Fuente | Ownership | Modo | Editable | Refresh | Sensibilidad | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `riskStatus` | string | `backend_risk_engine` | `risk` | derived | no | sync | media | `ok`, `caution`, `danger`, etc. |
| `severity` | string | `backend_risk_engine` | `risk` | derived | no | sync | baja | Jerarquia visual/operativa. |
| `reasonCode` | string | `backend_risk_engine` | `risk` | derived | no | sync | baja | Causa principal. |
| `blockingRule` | string \| null | `backend_risk_engine` | `risk` | derived | no | sync | media | Regla que bloquea. |
| `actionRequired` | string | `backend_risk_engine` | `risk` | derived | no | sync | baja | Mensaje accionable. |
| `allowNewTrades` | boolean | `backend_risk_engine` | `risk` | derived | no | sync | media | Parte de enforcement. |
| `blockNewTrades` | boolean | `backend_risk_engine` | `risk` | derived | no | sync | media | Parte de enforcement. |
| `reduceSize` | boolean | `backend_risk_engine` | `risk` | derived | no | sync | media | Parte de enforcement. |
| `closePositionsRequired` | boolean | `backend_risk_engine` | `risk` | derived | no | sync | media | Parte de enforcement. |

### 6.3 RiskSnapshot.policy

| Campo | Tipo | Fuente | Ownership | Modo | Editable | Refresh | Sensibilidad | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `riskPerTradePct` | number | `backend_risk_engine` | `risk` | persisted/derived | si segun plan | save/sync | media | Politica efectiva por cuenta. |
| `dailyDdLimitPct` | number | `backend_risk_engine` | `risk` | persisted/derived | si segun plan | save/sync | media | Limite diario. |
| `maxDdLimitPct` | number | `backend_risk_engine` | `risk` | persisted/derived | si segun plan | save/sync | media | Limite maximo. |
| `portfolioHeatLimitPct` | number \| null | `backend_risk_engine` | `risk` | persisted/derived | si segun plan | save/sync | media | Heat permitido. |
| `maxVolume` | number \| null | `backend_risk_engine` | `risk` | persisted/derived | si segun plan | save/sync | media | Tope de volumen. |
| `allowedSessions[]` | string[] | `backend_risk_engine` | `risk` | persisted | si segun plan | save/sync | baja | Sesiones autorizadas. |
| `allowedSymbols[]` | string[] | `backend_risk_engine` | `risk` | persisted | si segun plan | save/sync | baja | Whitelist simbolos. |
| `autoBlockEnabled` | boolean | `backend_risk_engine` | `risk` | persisted | si segun plan | save/sync | media | Enforce automatico. |
| `currentLevel` | string \| null | `backend_risk_engine` | `risk` | derived | no | sync | baja | Ladder actual. |
| `recommendedLevel` | string \| null | `backend_risk_engine` | `risk` | derived | no | sync | baja | Ladder recomendado. |
| `policySource` | string \| null | `backend_risk_engine` | `risk` | derived | no | sync | baja | Usuario, funding, default, etc. |

### 6.4 RiskSnapshot.policyEvaluation

| Campo | Tipo | Fuente | Ownership | Modo | Editable | Refresh | Sensibilidad | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ok` | boolean | `backend_risk_engine` | `risk` | derived | no | sync | baja | Resultado global. |
| `breaches[]` | string[] | `backend_risk_engine` | `risk` | derived | no | sync | media | Breaches activos. |
| `warnings[]` | string[] | `backend_risk_engine` | `risk` | derived | no | sync | media | Warnings activos. |
| `limitsStatus` | object | `backend_risk_engine` | `risk` | derived | no | sync | media | Estado por limite. |

## 7. SymbolExposure

Entidad canonica:

- concentracion por simbolo

| Campo | Tipo | Fuente | Ownership | Modo | Editable | Refresh | Sensibilidad | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `symbol` | string | `backend_risk_engine` | `risk` | derived | no | sync | baja | Simbolo evaluado. |
| `netExposureAmount` | number \| null | `backend_risk_engine` | `risk` | derived | no | sync | media | Exposicion neta. |
| `grossExposureAmount` | number \| null | `backend_risk_engine` | `risk` | derived | no | sync | media | Exposicion bruta. |
| `openRiskAmount` | number \| null | `backend_risk_engine` | `risk` | derived | no | sync | media | Riesgo monetario abierto. |
| `openRiskPct` | number \| null | `backend_risk_engine` | `risk` | derived | no | sync | media | Riesgo % abierto. |
| `positionCount` | number \| null | `backend_risk_engine` | `risk` | derived | no | sync | baja | Numero de posiciones. |
| `concentrationTone` | string \| null | `backend_risk_engine` | `risk` | derived | no | sync | baja | Tono UI sugerido. |
| `pressureLabel` | string \| null | `backend_risk_engine` | `risk` | derived | no | sync | baja | Label interpretativa. |

## 8. OpenTradeRisk

Entidad canonica:

- hoja de riesgo por posicion abierta

| Campo | Tipo | Fuente | Ownership | Modo | Editable | Refresh | Sensibilidad | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `positionId` | string | `backend_risk_engine` | `risk` | derived | no | sync | media | Relacion con posicion. |
| `symbol` | string | `backend_risk_engine` | `risk` | derived | no | sync | baja | Simbolo. |
| `riskAmount` | number \| null | `backend_risk_engine` | `risk` | derived | no | sync | media | Riesgo monetario. |
| `riskPct` | number \| null | `backend_risk_engine` | `risk` | derived | no | sync | media | Riesgo %. |
| `riskState` | string \| null | `backend_risk_engine` | `risk` | derived | no | sync | baja | `bounded`, `unbounded`, `missing_stop_loss`, etc. |
| `hasBoundedRisk` | boolean \| null | `backend_risk_engine` | `risk` | derived | no | sync | baja | Para UX de seguridad. |

## 9. FundingProfile

Entidad canonica:

- identidad de programa fondeado o challenge asociado a una cuenta

| Campo | Tipo | Fuente | Ownership | Modo | Editable | Refresh | Sensibilidad | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fundingProfileId` | string | `backend_account_store` | `funding` | persisted | si | bajo demanda | media | Id interno de perfil funding. |
| `accountId` | string | `backend_account_store` | `funding` | persisted | no | bajo demanda | media | Relacion con cuenta. |
| `firmId` | string | `funding_preset_registry` | `funding` | preset | si si editable | bajo demanda | baja | Identidad de firma. |
| `firmName` | string | `funding_preset_registry` | `funding` | preset | si si editable | bajo demanda | baja | Nombre firma. |
| `programId` | string | `funding_preset_registry` | `funding` | preset | si si editable | bajo demanda | baja | Programa. |
| `programName` | string | `funding_preset_registry` | `funding` | preset | si si editable | bajo demanda | baja | Nombre programa. |
| `phaseId` | string | `funding_preset_registry` | `funding` | preset/manual | si | bajo demanda | baja | `Challenge`, `Verification`, `Funded`. |
| `phaseName` | string | `funding_preset_registry` | `funding` | preset/manual | si | bajo demanda | baja | Etiqueta visible. |
| `accountSize` | number \| null | `funding_preset_registry` | `funding` | preset/manual | si | bajo demanda | media | Tamano asociado. |
| `drawdownType` | string | `funding_preset_registry` | `funding` | preset | si | bajo demanda | baja | `static`, `trailing`, etc. |
| `dailyResetMode` | string | `funding_preset_registry` | `funding` | preset | si | bajo demanda | baja | `server_time`, etc. |
| `sourceUrl` | string | `funding_preset_registry` | `funding` | preset | no | manual update | baja | Trazabilidad de reglas. |
| `verified` | boolean | `funding_preset_registry` | `funding` | preset | no | manual update | baja | Si reglas estan verificadas. |
| `requiresReview` | boolean | `funding_preset_registry` | `funding` | preset | no | manual update | baja | Si requiere revision humana. |

## 10. FundingRuleSet

Entidad canonica:

- reglas normalizadas para motor funding

| Campo | Tipo | Fuente | Ownership | Modo | Editable | Refresh | Sensibilidad | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `dailyLossLimitPct` | number \| null | `funding_preset_registry` | `funding` | preset/manual | si | bajo demanda | media | Limite diario %. |
| `dailyLossLimitAmount` | number \| null | `funding_preset_registry` | `funding` | preset/manual | si | bajo demanda | media | Limite diario absoluto. |
| `dailyLossBasis` | string \| null | `funding_preset_registry` | `funding` | preset/manual | si | bajo demanda | baja | Base del calculo. |
| `maxLossLimitPct` | number \| null | `funding_preset_registry` | `funding` | preset/manual | si | bajo demanda | media | Limite maximo %. |
| `maxLossLimitAmount` | number \| null | `funding_preset_registry` | `funding` | preset/manual | si | bajo demanda | media | Limite maximo absoluto. |
| `maxLossBasis` | string \| null | `funding_preset_registry` | `funding` | preset/manual | si | bajo demanda | baja | Base del max loss. |
| `trailingLossEnabled` | boolean | `funding_preset_registry` | `funding` | preset/manual | si | bajo demanda | baja | Trailing DD activo. |
| `floatingLossCounts` | boolean | `funding_preset_registry` | `funding` | preset/manual | si | bajo demanda | baja | Si cuenta floating. |
| `consistencyRuleEnabled` | boolean | `funding_preset_registry` | `funding` | preset/manual | si | bajo demanda | baja | Regla de consistencia. |
| `consistencyThresholdPct` | number \| null | `funding_preset_registry` | `funding` | preset/manual | si | bajo demanda | baja | Umbral. |
| `minimumTradingDays` | number \| null | `funding_preset_registry` | `funding` | preset/manual | si | bajo demanda | baja | Dias minimos. |
| `payoutCycleDays` | number \| null | `funding_preset_registry` | `funding` | preset/manual | si | bajo demanda | baja | Ciclo payout. |
| `profitTargetPct` | number \| null | `funding_preset_registry` | `funding` | preset/manual | si | bajo demanda | baja | Target challenge. |

## 10A. FundingJourney

Entidad canonica:

- ciclo completo que agrupa Fase 1, Fase 2 y Real/Funded aunque cambie el login MT5

| Campo | Tipo | Fuente | Ownership | Modo | Editable | Refresh | Sensibilidad | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fundingJourneyId` | string | `funding_journey_store` | `funding` | persisted | no | bajo demanda | media | Id del proceso completo. |
| `userId` | string | `funding_journey_store` | `funding` | persisted | no | bajo demanda | alta | Owner. |
| `firmId` | string | `funding_preset_registry` | `funding` | preset/manual | si | bajo demanda | baja | Firma. |
| `programId` | string | `funding_preset_registry` | `funding` | preset/manual | si | bajo demanda | baja | Programa. |
| `accountSize` | number | `funding_journey_store` | `funding` | manual | si | bajo demanda | media | Tamano comprado/asignado. |
| `currentStage` | string | `funding_journey_store` | `funding` | derived/manual | si | sync/manual | baja | `phase_1`, `phase_2`, `funded`, `closed`. |
| `journeyStatus` | string | `funding_journey_store` | `funding` | derived/manual | si | sync/manual | baja | Estado global del journey. |
| `startedAt` | datetime \| null | `funding_journey_store` | `funding` | manual | si | bajo demanda | baja | Inicio del proceso. |
| `fundedAt` | datetime \| null | `funding_journey_store` | `funding` | manual | si | bajo demanda | baja | Fecha de cuenta real/funded. |
| `closedAt` | datetime \| null | `funding_journey_store` | `funding` | manual | si | bajo demanda | baja | Cierre/fallo/cancelacion. |

## 10B. FundingStageAccount

Entidad canonica:

- relacion entre una fase del journey y una cuenta/login MT5 concreto

| Campo | Tipo | Fuente | Ownership | Modo | Editable | Refresh | Sensibilidad | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fundingStageAccountId` | string | `funding_journey_store` | `funding` | persisted | no | bajo demanda | media | Id de relacion fase-cuenta. |
| `fundingJourneyId` | string | `funding_journey_store` | `funding` | persisted | no | bajo demanda | media | FK journey. |
| `accountId` | string | `backend_account_store` | `funding` | persisted | si | bajo demanda | media | Cuenta MT5 vinculada. |
| `stage` | string | `funding_journey_store` | `funding` | manual | si | bajo demanda | baja | `phase_1`, `phase_2`, `funded`. |
| `stageStatus` | string | `funding_journey_store` | `funding` | manual/derived | si | sync/manual | baja | `active`, `passed`, `failed`, `closed`. |
| `profitPct` | number \| null | `live_snapshot/funding_journey_store` | `funding` | derived/snapshot | no | sync/manual | media | Resultado por fase. |
| `maxDrawdownPct` | number \| null | `risk_snapshot/funding_journey_store` | `funding` | derived/snapshot | no | sync/manual | media | DD maximo por fase. |
| `tradeCount` | number \| null | `live_snapshot/funding_journey_store` | `funding` | derived/snapshot | no | sync/manual | baja | Trades de la fase. |

## 10C. FundingPayout y ManualFundingTransaction

Entidad canonica:

- ledger de payouts, fees, resets, refunds y ajustes manuales de fondeo

| Campo | Tipo | Fuente | Ownership | Modo | Editable | Refresh | Sensibilidad | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ledgerEntryId` | string | `funding_ledger_store` | `funding` | persisted | no | bajo demanda | media | Id payout/transaccion. |
| `fundingJourneyId` | string | `funding_ledger_store` | `funding` | persisted | si | bajo demanda | media | FK journey. |
| `accountId` | string \| null | `funding_ledger_store` | `funding` | persisted | si | bajo demanda | media | Cuenta relacionada si aplica. |
| `type` | string | `funding_ledger_store` | `funding` | manual | si | bajo demanda | baja | `payout_received`, `challenge_fee`, `reset_fee`, etc. |
| `status` | string | `funding_ledger_store` | `funding` | manual | si | bajo demanda | baja | `draft`, `pending`, `paid`, `rejected`, `cancelled`. |
| `grossAmount` | number \| null | `funding_ledger_store` | `funding` | manual | si | bajo demanda | media | Bruto. |
| `feesAmount` | number \| null | `funding_ledger_store` | `funding` | manual | si | bajo demanda | media | Fees. |
| `netReceivedAmount` | number \| null | `funding_ledger_store` | `funding` | manual/derived | si | bajo demanda | media | Neto recibido o impacto neto. |
| `occurredAt` | datetime | `funding_ledger_store` | `funding` | manual | si | bajo demanda | baja | Fecha de evento. |

## 11. Portfolio

Entidad canonica:

- cluster de cuentas bajo una politica operativa compartida

| Campo | Tipo | Fuente | Ownership | Modo | Editable | Refresh | Sensibilidad | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `portfolioId` | string | `portfolio_policy_store` | `portfolio` | persisted | si | bajo demanda | media | Id portfolio. |
| `userId` | string | `portfolio_policy_store` | `portfolio` | persisted | no | bajo demanda | alta | Owner. |
| `name` | string | `portfolio_policy_store` | `portfolio` | manual | si | bajo demanda | baja | Nombre visible. |
| `description` | string \| null | `portfolio_policy_store` | `portfolio` | manual | si | bajo demanda | baja | Descripcion. |
| `objective` | string \| null | `portfolio_policy_store` | `portfolio` | manual | si | bajo demanda | baja | Mandato del portfolio. |
| `status` | string | `portfolio_policy_store` | `portfolio` | persisted | si | bajo demanda | baja | `active`, `paused`, etc. |
| `baseCurrency` | string \| null | `portfolio_policy_store` | `portfolio` | persisted/manual | si | bajo demanda | baja | Divisa marco. |

## 12. PortfolioAccount

Entidad canonica:

- relacion cuenta-portfolio

| Campo | Tipo | Fuente | Ownership | Modo | Editable | Refresh | Sensibilidad | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `portfolioAccountId` | string | `portfolio_policy_store` | `portfolio` | persisted | no | bajo demanda | media | Id de relacion. |
| `portfolioId` | string | `portfolio_policy_store` | `portfolio` | persisted | no | bajo demanda | media | FK portfolio. |
| `accountId` | string | `portfolio_policy_store` | `portfolio` | persisted | no | bajo demanda | media | FK cuenta. |
| `role` | string | `portfolio_policy_store` | `portfolio` | manual | si | bajo demanda | baja | `lead`, `follower`, `challenge`, etc. |
| `priority` | number \| null | `portfolio_policy_store` | `portfolio` | manual | si | bajo demanda | baja | Orden/jerarquia. |
| `riskBudgetPct` | number \| null | `portfolio_policy_store` | `portfolio` | manual | si | bajo demanda | media | Presupuesto de riesgo. |
| `maxHeatPct` | number \| null | `portfolio_policy_store` | `portfolio` | manual | si | bajo demanda | media | Heat maximo. |
| `enabled` | boolean | `portfolio_policy_store` | `portfolio` | persisted | si | bajo demanda | baja | Activa/inactiva cuenta en portfolio. |

## 13. RiskPolicy

Entidad canonica:

- politica configurable a nivel cuenta, portfolio o estrategia

| Campo | Tipo | Fuente | Ownership | Modo | Editable | Refresh | Sensibilidad | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `riskPolicyId` | string | `backend_risk_engine` | `risk` | persisted | si | save/sync | media | Id policy. |
| `scopeType` | string | `backend_risk_engine` | `risk` | persisted | si | save/sync | baja | `account`, `portfolio`, `strategy`. |
| `scopeId` | string | `backend_risk_engine` | `risk` | persisted | si | save/sync | media | Scope target. |
| `defaultRiskPerTradePct` | number \| null | `backend_risk_engine` | `risk` | persisted | si | save/sync | media | Riesgo base por trade. |
| `dailyDrawdownLimitPct` | number \| null | `backend_risk_engine` | `risk` | persisted | si | save/sync | media | Tope diario. |
| `maxDrawdownLimitPct` | number \| null | `backend_risk_engine` | `risk` | persisted | si | save/sync | media | Tope maximo. |
| `portfolioHeatLimitPct` | number \| null | `backend_risk_engine` | `risk` | persisted | si | save/sync | media | Heat maximo. |
| `maxVolume` | number \| null | `backend_risk_engine` | `risk` | persisted | si | save/sync | media | Lote maximo. |
| `maxConcurrentPositions` | number \| null | `backend_risk_engine` | `risk` | persisted | si | save/sync | baja | Numero maximo de posiciones. |
| `maxSymbolExposurePct` | number \| null | `backend_risk_engine` | `risk` | persisted | si | save/sync | media | Concentracion simbolo. |
| `maxFactorExposurePct` | number \| null | `backend_risk_engine` | `risk` | persisted | si | save/sync | media | Concentracion factor/divisa. |
| `allowedSessions[]` | string[] | `backend_risk_engine` | `risk` | persisted | si | save/sync | baja | Horarios permitidos. |
| `allowedSymbols[]` | string[] | `backend_risk_engine` | `risk` | persisted | si | save/sync | baja | Simbolos permitidos. |
| `autoBlockEnabled` | boolean | `backend_risk_engine` | `risk` | persisted | si | save/sync | media | Bloqueo automatico. |
| `playbookId` | string \| null | `backend_risk_engine` | `risk` | persisted | si | save/sync | baja | Vínculo a playbook. |
| `policySource` | string | `backend_risk_engine` | `risk` | derived | no | sync | baja | Fuente efectiva. |

## 14. RiskEvaluation

Entidad canonica:

- resultado calculado del motor

| Campo | Tipo | Fuente | Ownership | Modo | Editable | Refresh | Sensibilidad | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `evaluationId` | string | `backend_risk_engine` | `risk` | derived | no | sync | media | Version/evaluacion concreta. |
| `accountId` | string | `backend_risk_engine` | `risk` | derived | no | sync | media | Cuenta objetivo. |
| `asOf` | string | `backend_risk_engine` | `risk` | derived | no | sync | baja | Momento de evaluacion. |
| `riskStatus` | string | `backend_risk_engine` | `risk` | derived | no | sync | media | Estado global. |
| `severity` | string | `backend_risk_engine` | `risk` | derived | no | sync | baja | Severidad. |
| `reasonCode` | string | `backend_risk_engine` | `risk` | derived | no | sync | baja | Causa principal. |
| `blockingRule` | string \| null | `backend_risk_engine` | `risk` | derived | no | sync | media | Regla bloqueante. |
| `dailyRoomLeftAmount` | number \| null | `backend_risk_engine` | `risk` | derived | no | sync | alta | Room monetaria diaria. |
| `dailyRoomLeftPct` | number \| null | `backend_risk_engine` | `risk` | derived | no | sync | media | Room % diaria. |
| `overallRoomLeftAmount` | number \| null | `backend_risk_engine` | `risk` | derived | no | sync | alta | Room monetaria maxima. |
| `overallRoomLeftPct` | number \| null | `backend_risk_engine` | `risk` | derived | no | sync | media | Room % maxima. |
| `openHeatAmount` | number \| null | `backend_risk_engine` | `risk` | derived | no | sync | alta | Heat monetario. |
| `openHeatPct` | number \| null | `backend_risk_engine` | `risk` | derived | no | sync | media | Heat %. |
| `policyBreaches[]` | string[] | `backend_risk_engine` | `risk` | derived | no | sync | media | Breaches activas. |
| `policyWarnings[]` | string[] | `backend_risk_engine` | `risk` | derived | no | sync | media | Warnings activos. |
| `evaluationConfidence` | string | `backend_risk_engine` | `risk` | derived | no | sync | baja | Confianza. |

## 15. RiskRecommendation

Entidad canonica:

- capa trader-facing derivada de la evaluacion

| Campo | Tipo | Fuente | Ownership | Modo | Editable | Refresh | Sensibilidad | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `recommendationId` | string | `frontend_selector` | `ui_derived` | derived | no | recompute | baja | Id efimero. |
| `accountId` | string | `frontend_selector` | `ui_derived` | derived | no | recompute | media | Cuenta. |
| `asOf` | string | `frontend_selector` | `ui_derived` | derived | no | recompute | baja | Timestamp. |
| `mode` | string | `frontend_selector` | `ui_derived` | derived | no | recompute | baja | `aggressive`, `standard`, `defensive`, `blocked`. |
| `status` | string | `frontend_selector` | `ui_derived` | derived | no | recompute | baja | `safe`, `caution`, `blocked`. |
| `maxRiskAllowedNowPct` | number \| null | `frontend_selector` | `ui_derived` | derived | no | recompute | media | Techo duro. |
| `recommendedRiskNowPct` | number \| null | `frontend_selector` | `ui_derived` | derived | no | recompute | media | Recomendacion operativa. |
| `maxAdditionalHeatPct` | number \| null | `frontend_selector` | `ui_derived` | derived | no | recompute | media | Calor adicional permitido. |
| `maxConcurrentPositionsNow` | number \| null | `frontend_selector` | `ui_derived` | derived | no | recompute | baja | Tope concurrente actual. |
| `safeSizeBand` | object \| null | `frontend_selector` | `ui_derived` | derived | no | recompute | baja | Banda minima/maxima. |
| `nextTradeAdvisory` | string | `frontend_selector` | `ui_derived` | derived | no | recompute | baja | Copy accionable. |
| `blockedReasons[]` | string[] | `frontend_selector` | `ui_derived` | derived | no | recompute | media | Razones de bloqueo. |

## 16. EAPolicyPackage

Entidad canonica:

- paquete exportable para enforcement/routing futuro

| Campo | Tipo | Fuente | Ownership | Modo | Editable | Refresh | Sensibilidad | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `packageId` | string | `portfolio_policy_store` | `portfolio` | derived/persisted | no | export | media | Version de paquete. |
| `portfolioId` | string | `portfolio_policy_store` | `portfolio` | persisted | no | export | media | Portfolio origen. |
| `version` | string | `portfolio_policy_store` | `portfolio` | derived | no | export | baja | Versionado. |
| `generatedAt` | string | `portfolio_policy_store` | `portfolio` | derived | no | export | baja | Momento export. |
| `exportMode` | string | `portfolio_policy_store` | `portfolio` | manual | si | export | baja | `risk_guardian`, `portfolio_router`, etc. |
| `accounts[]` | array | `portfolio_policy_store` | `portfolio` | derived | no | export | media | Cuentas incluidas. |
| `strategyPermissions[]` | array | `portfolio_policy_store` | `portfolio` | derived | no | export | media | Permisos estrategia. |
| `riskCaps` | object | `portfolio_policy_store` | `portfolio` | derived | no | export | media | Caps consolidados. |
| `routingRules` | object | `portfolio_policy_store` | `portfolio` | derived | no | export | media | Reglas de routing. |
| `freezeRules` | object | `portfolio_policy_store` | `portfolio` | derived | no | export | media | Reglas de freeze. |
| `checksum` | string \| null | `portfolio_policy_store` | `portfolio` | derived | no | export | baja | Integridad de paquete. |

## 17. Estado de migracion recomendado por bloque

| Bloque | Listo para Wave 1 | Requiere extraccion previa | Requiere gating especial |
| --- | --- | --- | --- |
| TradingAccount | si | media | no |
| AccountSnapshot | si | media | no |
| Position | si | media | no |
| Trade | si | alta | no |
| ReportMetrics | si | media | no |
| RiskSnapshot | si | alta | no |
| FundingProfile | no | media | si |
| FundingRuleSet | no | media | si |
| Portfolio | no | media | si |
| RiskPolicy | parcial | alta | si |
| RiskEvaluation | parcial | alta | si |
| RiskRecommendation | no | alta | si |
| EAPolicyPackage | no | alta | si |

## Reglas de migracion derivadas

1. `TradingAccount`, `AccountSnapshot`, `ReportMetrics` y `RiskSnapshot` son la base de Wave 1.
2. `Trade` y `Position` necesitan adaptadores tipados antes de entrar bien en rutas nuevas.
3. `FundingProfile`, `FundingRuleSet`, `Portfolio`, `RiskPolicy` y `EAPolicyPackage` no deben nacer como markup primero; deben entrar por dominio.
4. Ningun campo `derived` debe pisar silenciosamente el campo `persisted` si ambos existen.
5. Si una policy o regla viene de default o supuesto, debe quedar etiquetado.

## Relacion con documentos existentes

- `docs/mt5-data-contract-v1.md`
- `docs/live-data-section-matrix.md`
- `docs/nextjs-types-and-fixtures-inventory.md`
- `docs/domain-model-funding-portfolio-v1.md`
- `docs/policy-evaluation-contract-spec.md`
- `docs/nextjs-master-migration-roadmap.md`
