# KMFX Next.js RiskGuard Product/UI Contract

Estado: contrato de producto/UI para `RiskGuard`
Ultima revision: 2026-05-17
Alcance: definir como debe funcionar la seccion `/risk` en la migracion Next.js sin prometer enforcement real antes de tener EA/policy package confirmado.

Referencia visual activa:

- `docs/nextjs-shaban-efferd-dashboard-patterns.md`

Decision visual:

- RiskGuard debe evolucionar hacia un centro de decision tipo Shaban/Efferd: grafico principal claro, columna lateral de estado/accion, reglas compactas y detalle avanzado por debajo.
- No convertir la pagina en una coleccion de cards equivalentes.
- No usar color decorativo; solo estado, PnL, riesgo y accion.

## Tesis

RiskGuard no es una pantalla de metricas.

RiskGuard es la capa de proteccion operativa que responde:

```text
Puedo abrir otra operacion?
Cuanto puedo perder hoy antes de romper mi limite?
Que cuenta, simbolo, setup o bot concentra mas riesgo?
Estoy entrando en revenge trading?
Debo reducir, esperar, cerrar riesgo o bloquear nuevas entradas?
```

Debe ayudar al trader a sobrevivir primero y optimizar despues.

## Fases

## 1. Read-only Guard

Estado actual recomendado para Next V1.

KMFX diagnostica y recomienda:

- estado `Safe`, `Caution`, `Danger` o `Blocked`;
- accion recomendada;
- riesgo maximo recomendado para la siguiente operacion;
- cooldown sugerido;
- reglas incumplidas o pendientes;
- origen de cada limite: usuario, fondeo, cuenta, backend o supuesto.

No debe afirmar que bloquea MT5.

Copy permitido:

```text
Nuevas entradas no recomendadas
Riesgo maximo recomendado: 0%
Cooldown sugerido hasta 15:40
Monitorizado en modo lectura
Pendiente de confirmar en EA
```

## 2. Enforced Guard

Fase futura con EA/policy package.

Solo se puede mostrar como activo cuando exista:

- EA RiskGuard instalado y habilitado;
- consentimiento del usuario;
- policy hash recibido;
- policy hash aplicado;
- telemetry de ultimo estado;
- modo de enforcement claro: preventivo, reactivo o degradado.

No usar en V1:

```text
Bloqueado en MT5
Aplicado en terminal
Proteccion activa
```

salvo que exista confirmacion tecnica.

## Estados

| Estado | Significado | Accion UI |
| --- | --- | --- |
| `Safe` | Operativa permitida dentro de reglas | permitir, mostrar riesgo recomendado |
| `Caution` | Operativa permitida con reduccion | recomendar reducir size o esperar |
| `Danger` | No conviene anadir riesgo | permitir solo cerrar/reducir |
| `Blocked` | No abrir nuevas entradas | mostrar motivo y desbloqueo |

## Acciones

- `Allow`
- `Warn`
- `Reduce size`
- `Cooldown`
- `Block new trades`
- `Block symbol`
- `Block account`
- `Block bot/EA`
- `Block portfolio routing`
- `Require review`
- `Manual override`

En V1 estas acciones son recomendaciones o estados read-only, no enforcement real.

## Mapa de pantalla V1

## A. Guard header

Pregunta:

- Puedo operar ahora?

Debe mostrar:

- estado global;
- motivo principal;
- accion recomendada;
- permitido: abrir, reducir, cerrar;
- siguiente desbloqueo si hay cooldown;
- modo: monitorizado/read-only.

Patron visual:

- card superior compacta;
- estado y accion en una lectura de 5 segundos;
- evitar textos largos y badges repetidos.

## B. Decision strip

Pregunta:

- Cual es el riesgo maximo razonable ahora?

KPIs:

- riesgo abierto;
- room diario restante;
- drawdown maximo usado;
- heat usado;
- trades del dia;
- riesgo recomendado para siguiente trade.

## C. Rules editor

Pregunta:

- Que regla quiero aplicar antes de operar?

Reglas V1 visibles como configuracion editable:

- max risk per trade;
- daily loss lock;
- consecutive losses cooldown;
- no SL warning/block;
- max open heat;
- max trades per day;
- funding daily room guard;
- payout defense;
- bot/EA loss streak guard si hay identificador.

Debe incluir una nota visible:

```text
La politica se prepara aqui. Hasta confirmar EA, KMFX recomienda y documenta; no bloquea tecnicamente MT5.
```

Reglas configurables V1:

- riesgo por operacion;
- drawdown diario;
- drawdown maximo;
- riesgo abierto maximo;
- operaciones maximas por dia;
- posiciones simultaneas;
- lote maximo;
- pares permitidos con anadir/quitar/bloquear;
- horarios permitidos por sesion;
- entradas sin stop loss;
- pausa tras perdidas consecutivas;
- noticias de alto impacto.

UX:

- tabla compacta para reglas;
- controles separados para pares/horarios/volumen;
- switches visibles, pero copy claro `Solo aviso ahora` hasta confirmar EA.

## D. Account risk table

Pregunta:

- Como gestiono hoy cada cuenta conectada?

Debe cubrir real, demo, fondeo, Darwinex y cuentas con bots sin convertir la pagina en una lista de widgets.

Columnas:

```text
Cuenta | Modo | Margen | Riesgo sugerido | Perdidas antes de parar | Siguiente accion
```

Regla:

- si room diario es bajo, riesgo recomendado baja;
- si estado de cuenta es caution/blocked, priorizar defensa;
- si no hay reglas verificadas, mostrar `Revisar reglas`.

## E. Risk curve and sizing

Pregunta:

- Donde estoy dentro de las zonas de supervivencia?

Debe mostrar:

- curva de drawdown/equity legible;
- zona segura, modo reducido y pausa operativa;
- reduccion de lotaje preparada como politica;
- recuperacion requerida si aplica.

La curva puede usar una serie visual de tendencia cuando la muestra real sea demasiado plana, pero sin etiquetar usuario final como `mock` o `demo`.

## F. Behavioral guard

Pregunta:

- Estoy sobreoperando o reaccionando a perdidas?

V1 puede derivar:

- perdidas consecutivas;
- trades del dia;
- perdida neta diaria;
- operaciones sin setup.

Debe mostrar confianza baja si faltan datos.

## G. Automation readiness

Pregunta:

- Que falta para proteger bots/EAs?

V1:

- mostrar `Pendiente de identificador de EA` si no hay magic/expert id;
- no mostrar `Block bot` como activo.

V2:

- bot loss streak;
- magic number risk;
- block bot/EA via RiskGuard confirmado.

## H. Risk engine cockpit V1 aplicado en Next

La pantalla `/risk` debe evolucionar desde cards planas hacia un cockpit operacional, manteniendo el sistema visual KMFX:

- dark neutral, sin bordes de colores decorativos;
- color solo para estado, dots, heatmaps, numeros y alertas;
- barras solo donde explican una proporcion real y no compiten con la decision principal;
- cards densas pero alineadas, sin huecos negros innecesarios;
- copy usuario, sin `mock`, `demo`, `fixture` ni tecnicismos internos;
- read-only guard por defecto.

Bloques activos en la UI Next:

```text
Gestion de riesgo header
Risk KPI strip
Curva de equity y zonas de riesgo
Reduccion de lotaje
Decision de hoy
Gestion del dia por cuenta
Riesgo variable
Reglas de riesgo
Riesgo por sesion
Notificaciones y alertas
Consistencia diaria
Costes de operativa
Eventos de riesgo
```

Notas de producto:

- `Reduccion automatica` es preparacion de politica; no enforcement MT5.
- `Reglas de riesgo`, `Riesgo por sesion` y `Notificaciones y alertas` deben quedar visibles en la mitad alta de la pantalla, no enterradas al final.
- `Decision de hoy` debe limitarse a las 3 preguntas mas importantes para evitar ruido cognitivo.
- `Correlacion entre pares`, `Sesiones de mercado` y `Reglas avanzadas` quedan fuera de la superficie principal V1 salvo que haya datos suficientes y una razon clara de decision.
- `Politica editable` puede existir antes del EA para definir intencion, pero no debe decir `aplicado en terminal`.
- `Consistencia por dia` es importante para cuentas de fondeo, pero debe mostrarse como control prudente, no como promesa de pasar retos.
- `Eficiencia vs comisiones` ayuda a detectar sobreoperativa y mala ejecucion, sin convertirlo en score opaco.

## Fuentes de datos

Capas:

1. `measured`: datos reales desde MT5/EA/historial/posiciones.
2. `configured_policy`: reglas definidas por usuario, funding, cuenta o backend explicito.
3. `reference_assumption`: supuestos tecnicos para lectura cuando falta policy.

Regla critica:

Solo `configured_policy` puede generar lenguaje de politica real, limite real o bloqueo real.

## Gates

## R2

- header responde si se puede operar ahora;
- rule table visible;
- funding risk plan visible si hay cuentas funding;
- exposicion por simbolo visible;
- no hay toggles que parezcan enforcement real;
- no hay copy tecnico en modo usuario;
- defaults se etiquetan como referencia, no politica.

## R3

- consume `riskSnapshot.policy` y `policy_evaluation` cuando existan;
- muestra open trade risks y no-SL;
- muestra cooldown/loss streak si hay operaciones suficientes;
- distingue cuenta real, demo, fondeo, Darwinex y bots cuando el contrato lo permita;
- muestra source/provenance por regla;
- degrada bien si faltan datos.

## R4

- parity semantica con Risk legacy;
- validacion manual con snapshots live/stale;
- no promete enforcement si solo hay connector read-only;
- beta de RiskGuard EA solo con consentimiento, hash y acknowledgement.
