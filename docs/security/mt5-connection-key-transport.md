# MT5 connection key transport

Production EA and launcher clients must send connection keys only through:

- `X-KMFX-Connection-Key`
- `X-KMFX-API-Key` for legacy header compatibility
- JSON body fields for POST sync/journal payloads when header transport is unavailable

Do not send `connection_key`, `KMFXApiKey`, or `api_key` in URL query strings. Platform access logs can record raw URLs before application redaction runs, so production endpoints reject query-string keys with `query_connection_key_not_allowed`.

Temporary query-string compatibility is limited to explicit non-production/dev runs with `KMFX_ALLOW_QUERY_CONNECTION_KEY=1`. Rotate development and legacy EA keys before production after the final EA build is verified to use header/body transport only.
