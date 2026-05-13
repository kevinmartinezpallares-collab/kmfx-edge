# Guardrails de Coste de Plataforma

Objetivo: evitar facturas sorpresa mientras KMFX Edge entra en beta y mantener
el dashboard rapido.

## Render

Riesgo actual:

- Render ha avisado de uso superior al 70% de los 500 minutos gratuitos de
  build pipeline.
- Al agotar los minutos gratuitos, Render puede cobrar minutos adicionales de
  build.

Medidas operativas:

- Agrupar cambios antes de hacer `git push` a `main`.
- Ejecutar validacion local antes de cada push:

```bash
python3 scripts/production_gate.py
```

- Evitar ciclos de prueba basados en muchos commits pequeños si el cambio no
  toca produccion.
- Usar commits de documentacion en bloque cuando no requieran deploy urgente.
- Configurar un limite mensual personalizado de minutos de build en Render si
  se quiere cortar gasto automatico.

Decision manual recomendada:

- En Render Dashboard, abrir `Workspace Settings > Build Pipeline` y usar
  `Set spend limit` / `Edit` para configurar un limite mensual de gasto en
  minutos de pipeline.
- Valor sugerido durante beta cerrada: un limite bajo que permita emergencias,
  por ejemplo 600-800 minutos/mes.
- Si el limite se alcanza, los deploys quedan pausados hasta el siguiente ciclo;
  el servicio ya desplegado deberia seguir funcionando.
- El limite cubre pipeline/build minutes. El outbound bandwidth de Render se
  vigila aparte en la pagina de Billing/usage.

## Supabase

Riesgo actual:

- La organizacion ha superado la cuota gratuita de salida/egress.
- El dashboard ya tiene mitigacion inicial: menos polling pesado, cache corta
  del summary y pausa agresiva cuando la pestana esta oculta.

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
  2. Bajar frecuencia de polling antes de cambiar arquitectura.
  3. Separar historial/trades a tabla dedicada si el snapshot completo sigue
     transportando demasiado dato.
  4. Evitar descargar payloads MT5 historicos en vistas que solo necesitan
     summary.

## Regla de despliegue

- Push a `main` solo tras validar localmente.
- Si un cambio no requiere deploy inmediato, acumularlo con el siguiente lote.
- No activar planes/add-ons ni cambiar limites de facturacion sin aprobacion
  explicita del owner.
