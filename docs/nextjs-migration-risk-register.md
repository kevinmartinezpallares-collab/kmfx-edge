# KMFX Next.js Migration Risk Register

Estado: registro de riesgos  
Ultima revision: 2026-05-14  
Alcance: riesgos tecnicos y de producto mas probables durante la migracion a Next.js y como mitigarlos.

## Proposito

No basta con tener roadmap.

Tambien necesitamos tener identificados los fallos mas probables antes de escribir codigo, para no repetir patrones tipicos de migraciones mal planteadas.

## Riesgos principales

## R1. Convertir demasiado codigo a Client Components

Probabilidad:

- alta

Impacto:

- alto

Por que:

- la SPA legacy nos empuja a pensar en todo como cliente

Mitigacion:

- server-first por defecto
- `use client` solo en hojas interactivas
- revisar imports transitivos

## R2. Arrastrar render legacy dentro de React

Probabilidad:

- alta

Impacto:

- muy alto

Mitigacion:

- no importar modulos que escriben DOM
- extraer adapters y selectores primero
- usar los modulos legacy solo como fuente semantica

## R3. Ambiguedad de ownership de datos

Probabilidad:

- alta

Impacto:

- muy alto

Mitigacion:

- data dictionary
- field source map
- fixture pack

## R4. Usar cache demasiado pronto en datos live

Probabilidad:

- media

Impacto:

- alto

Mitigacion:

- no introducir `use cache` en surfaces live de Wave 1 salvo necesidad muy justificada
- priorizar lectura fresca y degradacion correcta

## R5. Degradar mobile por pensar solo en desktop

Probabilidad:

- media

Impacto:

- alto

Mitigacion:

- shell mobile desde el principio
- topbar compacta
- prioridades de rutas claras

## R6. Degradar desktop por intentar cerrar mobile a la vez

Probabilidad:

- media

Impacto:

- alto

Mitigacion:

- desktop sigue siendo la superficie mas rica
- mobile recomponiendo, no comprimiendo

## R7. Repetir KPI o semanticas distintas entre rutas

Probabilidad:

- media

Impacto:

- alto

Mitigacion:

- route acceptance gates
- ownership y source of truth claros

## R8. Mezclar migracion con cambios de auth/billing

Probabilidad:

- media

Impacto:

- muy alto

Mitigacion:

- mantener fuera settings/auth sensible/billing en early migration

## R9. Introducir componentes premium que reducen legibilidad

Probabilidad:

- media

Impacto:

- medio/alto

Mitigacion:

- adopcion selectiva de TripleD/Efferd
- prioridad a lectura operativa

## R10. Mal scaffold base

Probabilidad:

- media

Impacto:

- alto

Mitigacion:

- seguir runbook
- no improvisar alias, fonts ni estructura

## R11. Fixtures poco realistas o poco anonimizados

Probabilidad:

- media

Impacto:

- alto

Mitigacion:

- fixture pack spec
- redaction policy

## R12. Cutover prematuro

Probabilidad:

- media

Impacto:

- muy alto

Mitigacion:

- rollout progresivo
- `R4` gates
- rollback simple

## R13. Dev server con memoria alta durante QA de muchas rutas

Probabilidad:

- media

Impacto:

- alto en entorno local

Observacion:

- 2026-05-16: un barrido seguido de rutas pesadas en `next dev --webpack` hizo que Next reiniciara el servidor por umbral de memoria. La app se recupero, pero no es un modo seguro de trabajar mientras la migracion convive con la SPA actual.

Mitigacion:

- no hacer QA visual de toda la app en rafaga dentro del dev server
- validar con `npm run test`, `npm run lint` y `tsc` como primera linea
- abrir preview solo para una ruta o grupo pequeno
- reiniciar/parar el dev server si `next-server` supera umbrales de memoria altos
- dejar los barridos completos para build/CI o una fase de performance dedicada

## Riesgos oficiales observados en docs

### Next 16 / Turbopack

- Turbopack es default
- proyectos con configuraciones heredadas pueden tropezar si esperan Webpack behavior

Mitigacion:

- mantener scaffold limpio
- evitar config custom innecesaria

### `use client` transitive boundary

- un archivo client arrastra dependencias

Mitigacion:

- segmentar por capas
- no meter helpers grandes dentro de client files

### Cache Components

- puede introducir un modelo incorrecto si se activa sin pensar

Mitigacion:

- no hacerlo requisito de Wave 1

## Riesgos que obligan a parar

- necesitamos importar render legacy para avanzar
- cambia el contrato live sin control de fixtures
- aparece acoplamiento fuerte con billing/auth
- se rompe la semantica de riesgo o funding
- el shell nuevo empeora velocidad de lectura
- el dev server local empieza a reiniciar por memoria durante QA amplio

## Relacion con documentos existentes

- `docs/nextjs-master-migration-roadmap.md`
- `docs/nextjs-official-guidance-notes.md`
- `docs/nextjs-bootstrap-execution-runbook.md`
