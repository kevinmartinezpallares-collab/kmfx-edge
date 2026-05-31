# KMFX Edge Next.js Cutover and Rollout Strategy

Estado: estrategia de rollout  
Ultima revision: 2026-05-14  
Alcance: definir como convivir, probar, activar y revertir la nueva app Next.js sin poner en riesgo el producto actual.

## Proposito

La migracion no termina cuando una ruta nueva existe.

Termina cuando podemos:

- exponerla con seguridad;
- medirla;
- revertirla;
- y retirar lo legacy sin trauma.

## Principio central

No habrá `big bang`.

El rollout debe ser:

- progresivo
- reversible
- observable
- por cohortes o por rutas

## Modelos posibles de convivencia

### Modelo A. Subruta interna

Ejemplo:

- `/next/dashboard`
- `/next/risk`

Ventajas:

- muy simple para pruebas internas

Desventajas:

- no representa bien la experiencia final

### Modelo B. Subdominio beta

Ejemplo:

- `next.kmfxedge.com`

Ventajas:

- separacion limpia
- facil de restringir a beta

Desventajas:

- requiere mas coordinacion operacional

### Modelo C. Feature flag por usuario/rol

Ventajas:

- mejor para rollout controlado
- permite comparar cohortes

Desventajas:

- requiere gating mas fino

## Recomendacion

Secuencia recomendada:

1. subruta o entorno local para desarrollo
2. subdominio beta o acceso interno
3. feature flag para admin/beta users
4. ampliacion gradual
5. cutover por rutas o por shell

## Etapas de rollout

## Etapa 1. Internal only

Usuarios:

- solo admin/desarrollo

Objetivo:

- validar shell
- validar wave 1
- cazar divergencias semanticas

## Etapa 2. Beta cerrada

Usuarios:

- admin
- usuarios beta seleccionados

Objetivo:

- observar uso real
- medir gaps frente a legacy
- recoger feedback de traders reales

## Etapa 3. Ruta por ruta

Objetivo:

- activar primero rutas fuertes:
  - dashboard
  - accounts
  - risk
  - analytics

## Etapa 4. Shell principal

Objetivo:

- cuando la mayoria de rutas core esten listas, el shell nuevo puede convertirse en la entrada principal

## Reglas de activacion

Una ruta solo puede activarse si:

- ha pasado su gate `R4`
- existe rollback claro
- datos y permisos se comportan igual o mejor
- no degrada lectura ni control del trader

## Reglas de rollback

Debe ser posible:

- desactivar una ruta sin tocar otras
- volver al shell legacy si una cohorte detecta problemas
- mantener URLs o redirects claros

Rollback trigger examples:

- datos incorrectos o ambiguos
- gating roto
- problemas severos mobile
- performance o hydration issues criticos

## Observabilidad minima recomendada

Antes de activar cohortes reales:

- errores por ruta
- fallos de fetch/snapshot
- tiempos de carga de shell
- estados stale/no-risk/no-report
- feedback cualitativo por modulo

## Cutover candidates iniciales

Orden sugerido:

1. `/analytics`
2. `/dashboard`
3. `/risk`
4. `/accounts`

Razon:

- maximo valor visual y operativo
- sin write flows complejos al principio

## Rutas a retrasar en cutover

- `/settings`
- `/debug`
- flows delicados de funding con edicion
- cualquier superficie que dependa de wrappers de auth/config aun inmaduros

## Criterio para retirar legacy

No retirar una ruta legacy hasta que:

- la nueva ruta haya convivido un tiempo razonable
- no existan regresiones abiertas criticas
- los usuarios beta no reporten perdida de capacidad
- el equipo tenga confianza en rollback y soporte

## Entregables previos a rollout real

- gates por ruta completados
- fixture coverage suficiente
- screenshots desktop/mobile
- decision de cohortes
- decision de hosting/acceso beta
- plan de rollback documentado

## Relacion con documentos existentes

- `docs/nextjs-master-migration-roadmap.md`
- `docs/nextjs-route-acceptance-gates.md`
- `docs/nextjs-route-migration-matrix.md`
