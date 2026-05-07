# KMFX Edge Pricing Competitor Research

Ultima revision: 2026-05-06

## Resumen

El mercado de journaling/analytics para traders se mueve en tres bandas:

- Budget: gratis limitado o 14-20 USD/EUR al mes anualizado.
- Mainstream: 29-50 USD al mes.
- Premium: 50-80 USD al mes o planes anuales cerrados.

KMFX Edge debe entrar con un plan basico a 15 EUR/mes para reducir friccion inicial, pero mantener Pro suficientemente alto para capturar valor de multi-cuenta, prop/funding, risk engine avanzado, exports y automatizacion MT5.

## Competencia revisada

| Producto | Entrada pagada | Plan avanzado | Notas |
| --- | ---: | ---: | --- |
| TradeZella | 29 USD/mes o 24 USD/mes anual | 49 USD/mes o 33 USD/mes anual | Journal/analytics fuerte, backtesting y replay. Basic limita a 1 cuenta. |
| TraderSync | 29.95 USD/mes lista, con promos desde ~19.46 USD/mes | 49.95-79.95 USD/mes lista, promos ~27.47-35.97 USD/mes | Analytics, replay, mobile, AI coaching. |
| Edgewonk | 197 USD/año, aprox. 16.40 USD/mes | 297 USD/24 meses, aprox. 12.40 USD/mes | Un plan con acceso completo, mas psicologia/journal que infraestructura MT5. |
| Trademetria | 19.95 USD/mes o 14.10 USD/mes anual | 29.95 USD/mes o 20.80 USD/mes anual | Budget-friendly, free plan, multi-asset, 1 cuenta en Basic, 50 en Pro. |
| Tradervue | 29.95 USD/mes | 49.95 USD/mes | Producto historico con free limitado; mas caro para paid tiers. |

## Posicionamiento KMFX

KMFX Edge no debe competir solo como journal. La propuesta es:

- MT5 + launcher + EA como flujo guiado;
- seguridad de prop/funding: no compartir IP, lectura local, connection keys;
- risk engine y control operativo;
- funding journeys y cumplimiento;
- dashboard comercial para traders que quieren disciplina, no solo logs.

Por eso el plan basico puede ser agresivo, pero Pro no debe quedar demasiado barato.

## Precios decididos para MVP

| Plan | Mensual | Anual | Ahorro anual | Usuario objetivo |
| --- | ---: | ---: | ---: | --- |
| Free / Demo | 0 EUR | 0 EUR | n/a | Explorar producto sin conectar MT5 live. |
| Edge Basic | 15 EUR/mes | 150 EUR/año | 2 meses gratis | Trader individual con 1 cuenta MT5. |
| Edge Pro | 39 EUR/mes | 390 EUR/año | 2 meses gratis | Trader activo, fondeo, hasta 3 cuentas MT5. |
| Edge Desk | Custom | Custom | Custom | Equipos, comunidades, cuentas custom y soporte prioritario. |

## Reglas comerciales MVP

- Moneda inicial: EUR.
- Trial inicial: 7 dias sin tarjeta para reducir friccion; requiere cuenta de usuario.
- Grace period para `past_due`: 7 dias con aviso visible.
- Desk: privado/contact-only, sin Stripe Price publico.
- Refunds: 14 dias para primera compra si no hay abuso, o si hay fallo tecnico no resuelto.
- Cancelacion: self-service via Stripe Customer Portal; acceso hasta fin del periodo ya pagado.
- Downgrade: no borrar datos. Si el usuario excede limites del plan nuevo, queda en read-only para las cuentas/features excedidas hasta archivar, borrar o volver a subir plan.

## Stripe catalog MVP

Lookup keys definitivas:

- `kmfx_basic_monthly`
- `kmfx_basic_yearly`
- `kmfx_pro_monthly`
- `kmfx_pro_yearly`

Compatibilidad interna:

- El plan interno `core` debe mapearse a nombre comercial `Edge Basic`.
- Si ya existen helpers con lookup keys `kmfx_core_*`, mantener alias temporal solo si hay datos/test objects previos. Para nuevos Stripe Prices usar `kmfx_basic_*`.

## Razonamiento

15 EUR/mes queda justo por debajo de Trademetria Basic mensual y muy por debajo de TradeZella/TraderSync/Tradervue paid tiers. Eso ayuda a captar traders de forex/prop que aun no quieren pagar 30-50 USD por un journal.

39 EUR/mes para Pro mantiene margen suficiente y queda por debajo o cerca de los planes premium mainstream, pero justificado por multi-cuenta, funding, risk engine avanzado, exports, journal/strategies y soporte de flujo MT5.

El anual con dos meses gratis es simple, facil de comunicar y evita descuentos agresivos que devaluen el producto antes del lanzamiento.
