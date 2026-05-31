# KMFX Next.js - Section Handoffs

Estos documentos son prompts de arranque para chats nuevos por seccion. La idea es cerrar cada pantalla con foco y evitar que un hilo enorme mezcle decisiones visuales, contenido, datos y bugs.

## Como usarlos

1. Abre un chat nuevo.
2. Pega el contenido del handoff correspondiente.
3. Indica que trabaje solo esa seccion.
4. Pide que revise la documentacion citada antes de implementar.
5. Pide validacion con `typecheck`, `lint` y preview/curl.

## Handoffs

- `panel-handoff.md`: Panel / Dashboard.
- `insights-handoff.md`: Insights resumen, diario, horario y riesgo.
- `calendar-handoff.md`: Calendario.
- `accounts-portfolio-handoff.md`: Cuentas y Portfolio.
- `trades-handoff.md`: Trades.
- `settings-subscription-handoff.md`: Ajustes y Suscripcion.
- `calculator-handoff.md`: Calculadora.
- `library-handoff.md`: Biblioteca.
- `riskguard-handoff.md`: RiskGuard, fuera de V1 activa hasta cerrar reglas y futura proteccion por EA.

## Perimetro V1

Secciones activas para cierre inicial:

- Panel.
- Cuentas.
- Portfolio.
- Insights.
- Trades.
- Calendario.
- Calculadora.
- Biblioteca.
- Ajustes y Suscripcion.

Secciones avanzadas que deben permanecer como `Proximamente` hasta trabajarlas en su chat propio:

- RiskGuard.
- Review.
- Playbooks.
- Prop Firms.
- Mercado.
- Ejecucion.

## Regla general

Cada chat debe respetar:

- no tocar produccion;
- no tocar auth, billing, launcher ni MT5 si no es la seccion correspondiente;
- no reabrir debates estrategicos ya cerrados;
- no introducir cards dentro de cards;
- no dejar huecos negros sin funcion;
- no prometer enforcement real sin EA confirmado;
- documentar lo que cambie.
