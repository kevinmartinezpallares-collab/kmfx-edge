# KMFX Edge Codex Agent Brief Playbook

Ultima revision: 2026-05-06

## Idea

Los posts analizados proponen dejar de usar Codex como chat corto y usarlo como agente de ejecucion: preparar un brief completo, dar contexto suficiente, definir criterios de salida y pedir que implemente, pruebe y reporte hasta terminar.

Para KMFX Edge esto encaja especialmente bien porque el proyecto ya tiene roadmaps, checklists, tests y superficies claras: billing, entitlements, launcher, MT5 sync, seguridad, QA visual y release.

## Cuando usar este metodo

Usarlo para tareas que pueden avanzar durante una sesion larga sin necesitar decisiones comerciales nuevas:

- cerrar un bloque del roadmap de produccion;
- implementar un endpoint o contrato ya definido;
- limpiar copy tecnico visible;
- ampliar tests/smokes sobre una superficie existente;
- auditar seguridad/UX con una lista de archivos y criterios;
- preparar release notes, checklist o validacion preproduccion.

No usarlo todavia para decisiones que dependen del negocio:

- precio final;
- politica de refunds;
- plan limits comerciales;
- decision de notarizar o no;
- cambios de posicionamiento de marca.

## Estructura del brief

Copiar esta plantilla a un archivo temporal o a un issue antes de lanzar una sesion larga.

```md
# Task Brief: <nombre>

## Goal
<resultado final en una frase>

## Product Context
- Proyecto: KMFX Edge
- Usuario objetivo:
- Superficie afectada:
- Por que importa ahora:

## Current State
- Archivos/documentos relevantes:
- Comportamiento actual:
- Tests existentes:
- Riesgos conocidos:

## Requirements
- [ ] Requisito funcional 1
- [ ] Requisito funcional 2
- [ ] Requisito de seguridad/privacidad
- [ ] Requisito de UX/copy

## Out of Scope
- No cambiar:
- No decidir:

## Acceptance Criteria
- [ ] Criterio observable 1
- [ ] Criterio observable 2
- [ ] Error/degraded state cubierto
- [ ] No regresion en:

## Verification
- Comandos de test:
- Smoke manual:
- URLs/rutas a revisar:
- Evidencia esperada:

## Reporting
Al terminar, reportar:
- archivos cambiados;
- pruebas ejecutadas y resultado;
- riesgos pendientes;
- siguiente paso recomendado.
```

## Comando de trabajo recomendado

Pedirlo asi:

```text
Lee docs/codex-agent-brief-playbook.md y el brief adjunto. Ejecuta la tarea end-to-end: implementa, prueba hasta donde permita el entorno, corrige fallos encontrados y deja un reporte corto con archivos cambiados, pruebas y riesgos pendientes.
```

## Briefs candidatos para KMFX Edge

### 1. Billing MVP test mode

Fuente principal: `docs/production-roadmap.md`, `docs/billing-implementation-checklist.md`, `docs/billing-env-vars.md`.

Objetivo: cerrar Stripe test mode sin tocar pricing live.

Acceptance criteria:

- checkout y portal usan entitlements existentes;
- webhook valida firma e idempotencia;
- status refleja plan/estado;
- tests de billing verdes;
- no se exponen secrets en frontend.

### 2. QA live data y copy final

Fuente principal: `docs/live-data-section-matrix.md`, `docs/production-readiness-audit.md`.

Objetivo: quitar textos internos visibles y certificar fuentes de datos por seccion.

Acceptance criteria:

- no quedan labels visibles como `workspace`, `local`, `bridge` fuera de modo admin;
- estados empty/stale/plan-limited son entendibles para usuario final;
- smoke render cubre rutas principales;
- desktop no cambia visualmente salvo correcciones de copy/layout.

### 3. Launcher clean-machine rehearsal

Fuente principal: `TESTING_GUIDE.md`, `LAUNCHER_README.md`, `docs/production-roadmap.md`.

Objetivo: convertir el QA launcher macOS/Windows en checklist ejecutable y evidencia de release.

Acceptance criteria:

- pasos macOS y Windows quedan separados;
- se documentan logs, state, checksum y version visible;
- se registran fallos reproducibles como tareas;
- no se altera el conector salvo que el fallo este confirmado.

### 4. Security closeout

Fuente principal: `docs/security/platform-env-checklist.md`, `docs/security/release-governance-checklist.md`, `docs/security/mt5-connection-key-transport.md`.

Objetivo: preparar una pasada de seguridad enfocada en MT5 ingestion, auth, CORS, keys y billing.

Acceptance criteria:

- findings priorizados P0/P1/P2;
- fixes pequenos aplicados cuando sean obvios;
- riesgos que requieran decision quedan separados;
- tests de seguridad relevantes ejecutados.

## Regla practica

Un buen brief debe permitir que el agente trabaje 60-180 minutos sin preguntar. Si una pregunta bloquea al agente en los primeros 10 minutos, faltaba contexto o habia una decision de producto sin cerrar.
