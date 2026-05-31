# KMFX Edge - Macro Calendar / News Risk

Status: V1 read-only, no paid provider, no scraping.
Last updated: 2026-05-19

## What was added

KMFX Edge Next now has a macro/news risk section at:

- `/market/economic-calendar`

Visible navigation:

- `Mercado` -> `Noticias`

User-facing title:

- `Noticias de alto impacto`

The section contains:

- an embedded economic calendar widget;
- a news-risk rules card for funded accounts and discretionary trading;
- a short disclaimer;
- a local agenda summary used only as product guidance;
- a fallback if the external widget fails to load.

## Default provider

Default provider:

- `tradingview`

Reason:

- TradingView documents an official Economic Calendar widget.
- It does not require an API key.
- It avoids a recurring paid provider in V1.
- It avoids scraping FXStreet, Investing, TradingView, or any private endpoint.
- It keeps the external data inside the provider widget; KMFX does not parse or transform iframe data.

Primary references:

- https://www.tradingview.com/widget-docs/widgets/calendars/economic-calendar/
- https://www.tradingview.com/widget-docs/getting-started/

## Why FXStreet is not used

FXStreet is not used in this version because there is no confirmed authorized widget/key integration in the repo.

Do not use FXStreet unless there is:

- an official widget or API agreement;
- allowed domains documented;
- clear CSP requirements;
- explicit provenance.

## Configuration

Environment variables:

```bash
NEXT_PUBLIC_MACRO_CALENDAR_ENABLED=true
NEXT_PUBLIC_MACRO_CALENDAR_PROVIDER=tradingview
```

Supported provider values:

- `tradingview`
- `investing`
- `tradays`

Only `tradingview` is implemented in V1. The other provider names exist so the UI/config shape does not need to be redesigned later.

Contract test:

- `apps/web-next/src/lib/config/macro-calendar.test.ts` verifies the default provider, disable flag and unsupported-provider fallback.

To disable the section behavior:

```bash
NEXT_PUBLIC_MACRO_CALENDAR_ENABLED=false
```

When disabled, the route can still render a safe fallback instead of loading the external widget.

## CSP

The TradingView V1 widget needs:

- `script-src https://s3.tradingview.com`
- `frame-src https://www.tradingview.com`

No global CSP relaxation should be added.

## Limitations

V1 does not provide:

- owned economic-event data;
- actual/forecast/previous surprise calculations;
- proprietary alerts;
- MT5 enforcement;
- prop-firm-specific official rule matching;
- historical tagging of trades around news;
- guarantee of provider availability or accuracy.

## Next recommended step

When budget or a reliable free API is available, create a provider adapter that maps external events to:

- `apps/web-next/src/lib/contracts/economic-calendar.ts`

The UI should continue reading normalized events, not raw provider payloads.
