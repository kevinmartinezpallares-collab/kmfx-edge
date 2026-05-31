# KMFX Next.js Sidebar Information Architecture

Estado: contrato de navegacion para migracion Next.js
Ultima revision: 2026-05-16
Alcance: definir que va en la sidebar, por que existe cada seccion y que pregunta resuelve para un trader.

## Principio

La sidebar no es una lista de features.

Es el mapa mental del trader:

```text
Ahora -> Riesgo -> Capital -> Proceso -> Decisión -> Soporte
```

Una entrada visible solo debe existir si:

- responde una pregunta frecuente del trader;
- tiene contenido propio;
- no duplica tabs internas;
- lleva al usuario a una accion o diagnostico claro.

## Naming visible recomendado

Las rutas pueden quedarse tecnicas, pero los nombres visibles deben sonar a producto trader profesional.

Evitar:

- nombres demasiado genericos: `Dashboard`, `Analytics`, `Settings`;
- traducciones raras: `Journeys`;
- etiquetas que parecen backoffice SaaS;
- mezclar idiomas sin intencion.

Propuesta inicial:

| Ruta | Label actual | Label recomendado | Razon |
| --- | --- | --- | --- |
| `/dashboard` | Mesa | `Panel` | Claro para usuario final; mantiene la ruta tecnica `/dashboard` sin sonar a backoffice. |
| `/accounts` | Cuentas | `Cuentas` | Claro y necesario. |
| `/risk` | Riesgo | `RiskGuard` | Diferencia el modulo como proteccion activa, no solo reporte. |
| `/capital` | Capital | `Portfolio` | Mas natural para multi-cuenta, allocation y Darwinex/real/funding. |
| `/journal` | Diario | `Review` | Enfatiza mejora y revision, no solo notas. |
| `/analytics` | Análisis | `Insights` | Recupera la seccion clave de KMFX Edge y comunica lectura accionable, no solo graficas. |
| `/trades` | Operaciones | `Trades` | El trader ya usa este lenguaje; mas directo que Operaciones. |
| `/calendar` | Calendario | `Calendario` | Claro; mantiene lectura temporal. |
| `/strategies` | Estrategias | `Playbooks` | Une setup, bots/EAs, backtest vs real y reglas operativas. |
| `/funding` | Fondeo | `Prop Firms` | Mas especifico para challenges/funded/payouts. |
| `/market` | Mercado | `Mercado` | Claro; no intenta reemplazar TradingView. |
| `/execution` | Ejecución | `Ejecución` | Mantener; describe disciplina operativa. |
| `/tools/calculator` | Herramientas | `Calculadora` | La herramienta principal visible es sizing/riesgo. |
| `/study` | Estudio | `Biblioteca` | Mejor para formulas, glosario y metodologia. |
| `/settings` | Ajustes | `Ajustes` | Convencion conocida. |

Labels de grupo recomendados:

| Grupo visible | Mantener como | Razon |
| --- | --- | --- |
| `Operativa` | `Operativa` | Loop diario operativo en lenguaje claro para usuario final. |
| `Decisión` | `Decisión` | Rutas para entender resultado, ajustar proceso y decidir el siguiente paso. |
| `Sistema` | `Sistema` | Utilidades, biblioteca y configuracion. |

Subrutas recomendadas:

```text
Review
  Cola
  Entradas
  IA Review

Insights
  Resumen
  Dia
  Horario
  Riesgo

Playbooks
  Backtest vs Real
  Portfolios

Prop Firms
  Journeys -> Procesos
  Cuentas
  Reglas
  Payouts

Calculadora
  Lotaje
```

Nota:

- `Journeys` no debe quedar visible al usuario final. Usar `Procesos`, `Ciclos` o `Challenges`. Recomendado: `Procesos`.
- `Fondeo` puede mantenerse si se prefiere español completo, pero `Prop Firms` comunica mejor el caso de uso a traders de retos.
- `Panel`, `RiskGuard`, `Portfolio`, `Review`, `Insights` y `Playbooks` son labels de producto, no traducciones literales.

## Grupos Sidebar

## Operativa

Estas rutas son el loop diario del trader.

### Panel

Ruta:

- `/dashboard`

Pregunta:

- Que esta pasando ahora y que debo atender primero?

Debe resolver:

- estado de la cuenta activa;
- PnL/equity/balance;
- riesgo urgente;
- exposicion abierta;
- modo de cuenta: real, demo, funding, Darwinex, bot/EA cuando aplique;
- sync health;
- operaciones recientes;
- siguiente revision necesaria.

No debe ser:

- una pagina de analisis profundo;
- un portfolio completo;
- un journal completo.

### Cuentas

Ruta:

- `/accounts`

Pregunta:

- Que cuentas tengo conectadas y cual es su estado real?

Debe resolver:

- broker/server/login;
- conexion/sync;
- cuenta activa;
- permisos/plan;
- grouping real, demo, funding, challenge, Darwinex y cuentas con bots/EAs.

### RiskGuard

Ruta:

- `/risk`

Pregunta:

- Que me puede romper hoy?

Debe resolver:

- daily room;
- max drawdown room;
- heat abierto;
- exposicion por simbolo/factor;
- bloqueos;
- alertas explicables.

### Portfolio

Ruta:

- `/capital`

Pregunta:

- Donde esta asignado mi capital y que cuenta esta aportando o empeorando rendimiento?

Debe resolver:

- allocation;
- contribution by account;
- concentration;
- capital efficiency;
- funding vs own capital.

### Review

Ruta:

- `/journal`

Pregunta:

- Que debo revisar para mejorar mi proceso?

Debe resolver:

- trades sin revisar;
- notas;
- leaks;
- calidad de ejecucion;
- cola de revision.

Subrutas visibles permitidas solo si tienen contenido propio:

- `/journal/review-queue`
- `/journal/entries`
- `/journal/ai-review`

## Decisión

Estas rutas ayudan a decidir que ajustar.

### Insights

Ruta:

- `/analytics`

Pregunta:

- Donde estoy ganando o perdiendo, y bajo que condiciones?

Debe resolver:

- performance summary;
- day/time analysis;
- risk analytics;
- setup/symbol/session attribution;
- calidad de datos.

Subrutas:

- `/analytics/daily`
- `/analytics/hourly`
- `/analytics/risk`

### Trades

Ruta:

- `/trades`

Pregunta:

- Que trades hice y que datos concretos explican el resultado?

Debe resolver:

- tabla de trades;
- filtros;
- agrupacion de parciales;
- PnL neto;
- R/R si existe;
- link a review.

### Calendario

Ruta:

- `/calendar`

Pregunta:

- Que dias/sesiones explican mi rendimiento?

Debe resolver:

- PnL diario/mensual/anual;
- dias ganadores/perdedores;
- drill-down diario;
- presion de revision.

### Playbooks

Ruta:

- `/strategies`

Pregunta:

- Que setup tiene edge real y cual debo dejar de operar?

Debe resolver:

- setup attribution;
- bots/EAs por magic number o identificador cuando exista;
- backtest vs real;
- calidad de datos;
- dependencia de operaciones aisladas;
- contribution por estrategia/simbolo/sesion.

Subrutas:

- `/strategies/backtest-vs-real`
- `/strategies/portfolio`

### Prop Firms

Ruta:

- `/funding`

Pregunta:

- Estoy mas cerca de pasar, cobrar o romper la cuenta?

Debe resolver:

- journeys de Fase 1 -> Fase 2 -> Real;
- daily/max room;
- progreso de target;
- payout defense;
- payouts, fees, resets y neto real;
- reglas con provenance.

Subrutas:

- `/funding/journeys`
- `/funding/accounts`
- `/funding/payouts`
- `/funding/rules`

Referencia:

- `docs/nextjs-funding-journey-ui-contract.md`

### Mercado

Ruta:

- `/market`
- `/market/economic-calendar`

Pregunta:

- Que contexto de simbolos importa para mis trades actuales?
- Hay noticias de alto impacto que cambien mi riesgo antes de operar?

Debe resolver:

- simbolos activos;
- exposicion por simbolo;
- actividad reciente;
- simbolo caliente;
- contexto operativo basico.
- agenda economica accionable;
- ventanas de proteccion para cuentas reales, demo, fondeo y bots;
- avisos read-only antes de noticias si existe proveedor con provenance.

No debe reemplazar TradingView.
No debe depender de scraping ni prometer enforcement de MT5 en V1.

### Ejecución

Ruta:

- `/execution`

Pregunta:

- Estoy siguiendo mi plan o estoy degradando la ejecucion?

Debe resolver:

- discipline signals;
- post-trade review;
- mistakes;
- rule adherence;
- execution quality;
- manual vs automated split si los trades permiten distinguirlo;
- degradacion operativa de bots/EAs conectados.

## Sistema

Estas rutas soportan el trabajo, no son el centro diario.

### Calculadora

Ruta:

- `/tools/calculator`

Pregunta:

- Cuanto puedo arriesgar en el siguiente trade?

Debe resolver:

- lot size;
- riesgo por cuenta;
- stop distance;
- conversiones;
- funding cap cuando aplique.

### Biblioteca

Ruta:

- `/study`

Pregunta:

- Que significa esta metrica y como se calcula?

Debe resolver:

- formulas;
- glosario;
- metodologia;
- interpretacion de estados.

### Ajustes

Ruta:

- `/settings`

Pregunta:

- Como configuro mi cuenta, preferencias y seguridad?

Debe resolver:

- perfil;
- preferencias;
- cuenta activa;
- integraciones/config;
- wrappers seguros de auth/config.

## Orden recomendado en desktop

```text
Operativa
  Panel
  Cuentas
  RiskGuard
  Portfolio
  Review

Decisión
  Insights
  Trades
  Calendario
  Playbooks
  Prop Firms
  Mercado
  Ejecución

Sistema
  Calculadora
  Biblioteca
  Ajustes
```

## Mobile

Mobile no debe copiar todo el desktop.

Acceso primario recomendado:

```text
Panel
RiskGuard
Cuentas
Review o Insights
Mas
```

`Mas` contiene el resto con grupos claros.

## Regla anti-duplicacion

Si una subruta solo cambia un tab interno, no debe duplicarse visualmente en sidebar salvo que:

- el tab sea deep-link importante;
- tenga contenido suficientemente propio;
- no exista otro control visible duplicado dentro de la misma pantalla.

## Criterio de aceptacion

- Cada item de sidebar responde una pregunta concreta.
- Cada item visible tiene pantalla o contrato propio.
- La sidebar no muestra rutas que prometen vistas falsas.
- Panel puede derivar al usuario a cada seccion sin absorberlo todo.
