# Guardrails de Coste de Plataforma

Objetivo: evitar facturas sorpresa mientras KMFX Edge entra en beta y mantener
el dashboard rapido.

## Render

Riesgo actual:

- Render ha avisado de uso superior al 70% de los 500 minutos gratuitos de
  build pipeline.
- Al agotar los minutos gratuitos, Render puede cobrar minutos adicionales de
  build.
- El cargo visto de `kmfx-edge-api` en Starter no es un coste de API puntual:
  es runtime del servicio vivo. En la captura actual, `317.86h * $0.0094/h`
  explica aproximadamente `$2.99`.
- El bandwidth saliente de Render se vigila aparte. En la captura actual hay
  `20.45 GB`; si el workspace tiene 25 GB incluidos, todavia no deberia generar
  overage, pero hay que seguirlo antes de abrir beta.

Medidas operativas:

- Agrupar cambios antes de hacer `git push` a `main`.
- Si el cambio es solo documentacion, runbooks o checklist y no necesita
  deploy, usar `[skip render]` en el mensaje de commit.
- Ejecutar validacion local antes de cada push:

```bash
python3 scripts/production_gate.py
```

- Evitar ciclos de prueba basados en muchos commits pequeños si el cambio no
  toca produccion.
- Usar commits de documentacion en bloque cuando no requieran deploy urgente.
- Configurar un limite mensual personalizado de minutos de build en Render si
  se quiere cortar gasto automatico.
- Confirmar en Render que solo existe un servicio pago activo para KMFX
  (`kmfx-edge-api`) y que no hay workers, cron jobs, workflows o servicios
  duplicados consumiendo compute.
- Mantener claro el coste minimo operativo: si `kmfx-edge-api` sigue encendido
  24/7 en Starter, habra coste mensual de servicio. Suspenderlo elimina ese
  coste, pero rompe backend, billing, MT5 sync y dashboard live.
- Mantener el monitor recurrente de costes para revisar Supabase y Render cada
  6 horas durante la preparacion de beta.

Decision manual recomendada:

- En Render Dashboard, abrir `Workspace Settings > Build Pipeline` y usar
  `Set spend limit` / `Edit` para configurar un limite mensual de gasto en
  minutos de pipeline.
- Para cero facturas sorpresa por build pipeline, configurar el limite en el
  minimo que no permita comprar minutos adicionales fuera de los incluidos.
- Si se acepta margen operativo controlado durante beta cerrada, usar un limite
  bajo que permita emergencias, por ejemplo 600-800 minutos/mes.
- Si el limite se alcanza, los deploys quedan pausados hasta el siguiente ciclo;
  el servicio ya desplegado deberia seguir funcionando.
- El limite cubre pipeline/build minutes. El outbound bandwidth de Render se
  vigila aparte en la pagina de Billing/usage.

Referencia operativa:

- Render permite saltar un auto-deploy con `[skip render]` o `[render skip]` en
  el mensaje de commit.
- `[skip render]` solo ahorra pipeline/build minutes; no apaga el servicio ni
  evita el coste horario del runtime ya desplegado.
- Render compra minutos suplementarios automaticamente al agotar los incluidos
  salvo que se alcance el limite mensual de gasto o no haya metodo de pago.
- El plan Starter de web services aparece como `$7/month`; el dashboard puede
  mostrarlo prorrateado por horas durante el ciclo.

## Supabase

Riesgo actual:

- La organizacion ha superado la cuota gratuita de salida/egress.
- El dashboard ya tiene mitigacion inicial: menos polling pesado, cache corta
  del summary y pausa agresiva cuando la pestana esta oculta.
- La captura actual muestra alrededor de `60 GB` de salida frente a `5.5 GB`
  de cuota gratuita. En ese estado no conviene invitar alumnos: Supabase puede
  devolver restricciones/402 y romper Auth, API, smokes o sincronizacion.

Decision recomendada antes de beta privada:

- Comprar/activar Supabase Pro ahora, antes de meter los ~15 alumnos, porque
  la organizacion ya esta restringida por egress en Free.
- Activarlo como margen operativo controlado, no como barra libre:
  - mantener `Spend Cap` activado;
  - no comprar add-ons, dominios, PITR, read replicas, IPv4 dedicado ni compute
    extra sin aprobacion explicita;
  - revisar `Usage` a 1h, 6h y 24h tras abrir la beta.
- Con Pro, la cuota de egress sube a `250 GB` y el overage de egress queda
  cubierto por `Spend Cap`; si se vuelve a superar, Supabase restringira en vez
  de generar sobrecoste automatico para los items cubiertos.

Medidas operativas:

- Mantener el monitor recurrente de uso Supabase cada 6 horas.
- Revisar especialmente:
  - salida/egress;
  - database size;
  - edge functions;
  - auth active users;
  - realtime si se activa en el futuro.
- Si el egress vuelve a subir:
  1. Confirmar si el consumo viene de `accounts.snapshot`.
  2. Confirmar si el consumo viene de Auth, Storage, Edge Functions, Realtime
     o Database Egress.
  3. Revisar endpoints mas solicitados y consultas que devuelven demasiadas
     filas/campos.
  4. Bajar frecuencia de polling antes de cambiar arquitectura.
  5. Separar historial/trades a tabla dedicada si el snapshot completo sigue
     transportando demasiado dato.
  6. Evitar descargar payloads MT5 historicos en vistas que solo necesitan
     summary.
  7. Si Storage genera egress, mover descargas pesadas a Vercel/GitHub Releases
     o CDN cacheado, no a Supabase.

Umbrales operativos durante beta:

- Verde: egress diario estable y proyectado por debajo de `250 GB/mes`.
- Amarillo: egress diario proyecta `>150 GB/mes`; auditar endpoints y payloads.
- Rojo: egress diario proyecta `>220 GB/mes` o sube de golpe tras abrir alumnos;
  congelar invitaciones, bajar polling y limitar payloads historicos.

## Regla de despliegue

- Push a `main` solo tras validar localmente.
- Si un cambio no requiere deploy inmediato, acumularlo con el siguiente lote o
  usar `[skip render]`.
- No activar planes/add-ons ni cambiar limites de facturacion sin aprobacion
  explicita del owner.
