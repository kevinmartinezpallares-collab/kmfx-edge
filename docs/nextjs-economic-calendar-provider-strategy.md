# KMFX Edge - Economic Calendar Provider Strategy

Status: planning contract, no provider connected.
Last updated: 2026-05-19

## Product goal

El calendario economico debe ayudar al trader a evitar operar durante ventanas de alto impacto, especialmente en cuentas de fondeo, sin convertir KMFX Edge en una web de noticias.

Debe responder:

- que noticia viene;
- a que hora ocurre;
- que moneda/simbolos puede afectar;
- cuanto tiempo antes/despues conviene protegerse;
- que accion recomienda RiskGuard;
- si el dato viene de una fuente con provenance.

## Regla de coste

No pagar un proveedor caro de entrada.

V1 debe funcionar con:

- API economica o plan bajo coste;
- cache diario o intradia controlado;
- normalizacion propia en `apps/web-next/src/lib/contracts/economic-calendar.ts`;
- avisos read-only dentro de KMFX;
- sin scraping fragil;
- sin prometer tiempo real si la fuente no lo garantiza.

## Contrato normalizado

La UI no debe depender del shape del proveedor externo.

Todo proveedor debe adaptarse a:

- `EconomicCalendarEvent`
- `EconomicImpact`
- `EconomicCalendarProviderStatus`

Campos minimos:

- `scheduledAt`
- `timeLabel`
- `currency`
- `title`
- `impact`
- `affectedSymbols`
- `protectionWindowLabel`
- `suggestedAction`
- `source.provider`
- `source.status`

Campos V2:

- `actual`
- `forecast`
- `previous`
- `country`
- `source.provenanceUrl`
- `source.fetchedAt`

## Arquitectura recomendada

V1:

- fetch server-side programado o bajo demanda;
- cache por dia y region;
- guardar ultima respuesta normalizada;
- renderizar agenda y avisos macro en `/market/economic-calendar`;
- derivar avisos a `RiskGuard` solo como recomendacion.

V2:

- avisos 30 / 15 / 5 min;
- preferencia por cuenta/simbolo;
- severidad por tipo de cuenta;
- resumen en Panel si hay evento critico cercano;
- historial de eventos alrededor de trades cerrados.

V3:

- enforcement via EA/policy package si existe contrato validado;
- auditoria de overrides;
- bloqueo tecnico solo si el EA confirma capacidad real.

## Anti-promesas

No afirmar:

- tiempo real;
- bloqueo tecnico en MT5;
- que una noticia siempre afecta a un simbolo;
- reglas oficiales de prop firms sin provenance;
- datos economicos exactos si el proveedor no ofrece `actual/forecast/previous`.

## Integraciones con producto

Panel:

- solo mostrar evento critico cercano si afecta a la cuenta activa.

RiskGuard:

- recomendar pausa, reduccion o solo cierre.

Prop Firms:

- avisar si una noticia puede poner en riesgo margen diario o payout defense.

Calendario:

- marcar trades hechos cerca de noticias cuando haya datos historicos.

Review:

- ayudar a revisar operaciones abiertas/cerradas dentro de ventana de noticia.
