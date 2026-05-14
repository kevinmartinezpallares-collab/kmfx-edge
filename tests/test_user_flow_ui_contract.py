import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_text(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


class UserFlowUiContractTests(unittest.TestCase):
    def test_turnstile_site_key_is_configured_for_public_auth(self) -> None:
        source = read_text("index.html")
        marker = '<meta name="kmfx-turnstile-site-key" content="'
        start = source.index(marker) + len(marker)
        end = source.index('"', start)
        site_key = source[start:end].strip()

        self.assertTrue(site_key.startswith("0x4"), "Turnstile site key must be a configured public site key")
        self.assertGreater(len(site_key), 20)
        self.assertNotIn("SECRET", site_key.upper())

    def test_email_signin_does_not_require_turnstile_but_sensitive_auth_flows_do(self) -> None:
        source = read_text("js/modules/auth-ui.js")

        self.assertIn('["signup", "forgot", "reset"].includes(mode)', source)
        self.assertNotIn('ensureTurnstileCompleted("signin")', source)
        self.assertNotIn('getTurnstileToken("signin")', source)
        self.assertNotIn('resetTurnstileWidget("signin")', source)
        self.assertIn("signInWithPassword?.({ email, password })", source)
        self.assertIn('ensureTurnstileCompleted("signup")', source)
        self.assertIn('ensureTurnstileCompleted("forgot")', source)
        self.assertIn('ensureTurnstileCompleted("reset")', source)

    def test_turnstile_mount_retries_until_cloudflare_script_is_ready(self) -> None:
        source = read_text("js/modules/auth-ui.js")
        html = read_text("index.html")
        css = read_text("styles.css")

        self.assertIn("scheduleTurnstileRender", source)
        self.assertIn("script_not_ready", source)
        self.assertIn("Cargando verificación anti-bots", source)
        self.assertIn('window.addEventListener("kmfx:turnstile-ready"', source)
        self.assertIn('window.dispatchEvent(new Event("kmfx:turnstile-ready"))', html)
        self.assertIn(".auth-turnstile-loading", css)

    def test_email_signin_does_not_send_captcha_token_to_supabase_options(self) -> None:
        source = read_text("js/modules/auth-session.js")

        signin_start = source.index("signInWithPassword: async")
        signup_start = source.index("signUpWithPassword: async", signin_start)
        signin_source = source[signin_start:signup_start]
        self.assertNotIn("captchaToken", signin_source)
        self.assertNotIn("signInPayload.options", signin_source)
        self.assertIn("signUpOptions.captchaToken = normalizedCaptchaToken", source)
        self.assertNotIn("signInPayload.captchaToken = normalizedCaptchaToken", source)

    def test_auth_captcha_token_is_kept_stable_during_pending_request(self) -> None:
        source = read_text("js/modules/auth-ui.js")

        self.assertIn("const setAuthRequestPending", source)
        self.assertIn("{ rerender: false }", source)

        for mode, pending_marker in [
            ("signup", 'setAuthRequestPending("signup", "Creando cuenta...")'),
            ("forgot", 'setAuthRequestPending("reset-request", "Enviando...")'),
            ("reset", 'setAuthRequestPending("reset-password", "Actualizando...")'),
        ]:
            token_index = source.index(f'const captchaToken = getTurnstileToken("{mode}")')
            loading_index = source.index(pending_marker, token_index)
            self.assertLess(
                token_index,
                loading_index,
                f"{mode} must capture the Turnstile token before setting pending auth state",
            )

    def test_account_detail_warnings_are_user_safe(self) -> None:
        source = read_text("js/modules/connections.js")

        self.assertIn("function normalizeAccountWarningText", source)
        self.assertIn("function accountDataSourceLabel", source)
        self.assertIn("const readable = (value) =>", source)
        self.assertIn('normalized.includes("[object object]")', source)
        self.assertIn("KMFX está usando un límite de riesgo por defecto", source)
        self.assertIn("Último dato recibido", source)
        self.assertNotIn("Trazabilidad técnica", source)
        self.assertNotIn("Último payload", source)

    def test_account_detail_modal_is_scrollable_and_wide_enough(self) -> None:
        css = read_text("styles-v2.css")

        self.assertIn("width: min(96vw, 1080px) !important", css)
        self.assertIn("max-height: min(90dvh, 920px) !important", css)
        self.assertIn("max-height: calc(90dvh - 128px)", css)
        self.assertIn("overflow-y: auto", css)

    def test_mt5_account_key_flow_copy_keeps_stable_key_language(self) -> None:
        source = read_text("js/modules/connections.js")
        wizard = read_text("js/modules/connection-wizard.js")
        connector = read_text("KMFXConnector.mq5")

        self.assertIn("Copia la KMFXKey actual desde Detalles y reinstala el conector", source)
        self.assertIn("usa Ver detalles para copiar la misma KMFXKey", source)
        self.assertIn("Obtén la KMFXKey", wizard)
        self.assertIn("Crear KMFXKey para esta cuenta", wizard)
        self.assertIn("Si reinstalas, usa esta misma key desde Cuentas > Ver detalles", wizard)
        self.assertIn("Usa esta misma key si reinstalas el EA en esta cuenta", wizard)
        self.assertIn("Copia la KMFXKey actual desde Cuentas > Ver detalles", connector)
        self.assertIn("Copiar key", source)
        self.assertIn("Usa esta misma KMFXKey y reinstala el conector en el mismo MT5", source)
        self.assertNotIn("Regenerar key", source)
        self.assertNotIn("Regenerar y copiar key", source)
        self.assertNotIn("Regenerar key", wizard)
        self.assertNotIn("Regenerar y copiar key", wizard)
        self.assertNotIn("Crea una nueva conexión para volver a sincronizar", source)
        self.assertNotIn("tendrá que conectarse con una key nueva", source)
        self.assertNotIn("Genera una nueva key desde Cuentas", connector)

    def test_metric_study_cards_use_consistent_grid_and_explain_trader_use(self) -> None:
        source = read_text("js/modules/glossary.js")
        css = read_text("styles-v2.css")

        self.assertIn("study-metric-grid", source)
        self.assertNotIn("data-study-slider", source)
        self.assertNotIn("__metricStudyScrollLeft", source)
        self.assertIn("Para el trader", source)
        self.assertIn("Fórmula", source)
        self.assertIn("Confianza", source)
        self.assertIn("resolveTermConfidence", source)
        self.assertIn("Actualización 1-10s", source)
        self.assertIn("Porcentaje", source)
        self.assertIn("Medidor", source)
        self.assertNotIn("Refresh ", source)
        self.assertNotIn('card.unit || "metric"', source)
        self.assertNotIn('visualLabel || "card"', source)
        self.assertIn("glossary-grid", css)
        self.assertIn("grid-template-columns: repeat(auto-fit, minmax(min(100%, 430px), 1fr))", css)
        self.assertIn("grid-template-columns: minmax(0, 1fr)", css)
        self.assertIn("word-break: normal", css)
        self.assertIn("overflow: hidden", css)
        self.assertIn("study-metric-card--term", source)

    def test_metric_study_copy_avoids_internal_source_terms(self) -> None:
        source = read_text("js/modules/dashboard-professional-kpis.js")

        self.assertIn("Módulo de riesgo KMFX", source)
        self.assertIn("Score de calidad KMFX calculado con la muestra disponible", source)
        self.assertIn("cálculo de respaldo", source)
        self.assertNotIn("Backend Risk Metrics", source)
        self.assertNotIn("cálculo local", source)
        self.assertNotIn("dashboard payload", source)
        self.assertNotIn("snapshot MT5", source)

    def test_connection_wizard_avoids_internal_sync_copy(self) -> None:
        source = read_text("js/modules/connection-wizard.js")

        self.assertIn("esperando primera sincronización", source)
        self.assertIn("primer dato de MT5", source)
        self.assertIn("Todavía no hay sincronización de MT5", source)
        self.assertIn("KMFX no reconoce esta key", source)
        self.assertIn("Por seguridad, KMFX ya no acepta keys dentro de la URL", source)
        self.assertIn("servidor de KMFX no aceptó temporalmente la sincronización", source)
        self.assertNotIn("falta sync live", source)
        self.assertNotIn("snapshot directo", source)
        self.assertNotIn("datos live", source)
        self.assertNotIn("Todavía no hay sync de MT5", source)
        self.assertNotIn("Account Number", source)
        self.assertNotIn("Provider directo", source)
        self.assertNotIn("motor de conexión directa", source)

    def test_connection_wizard_hides_release_checksums_by_default(self) -> None:
        source = read_text("js/modules/connection-wizard.js")

        self.assertIn("kmfx:showReleaseChecksums", source)
        self.assertIn("!isAdminMode(liveState) || !showReleaseChecksums", source)
        self.assertNotIn('if (state.isAdmin !== true) return "";', source)

    def test_connections_guide_hides_release_checksums_by_default(self) -> None:
        source = read_text("js/modules/connections.js")

        self.assertIn("function shouldShowReleaseChecksums", source)
        self.assertIn("kmfx:showReleaseChecksums", source)
        self.assertIn("if (!shouldShowReleaseChecksums(state)) return \"\";", source)
        self.assertNotIn("if (!isAdminUser(state)) return \"\";", source)

    def test_live_snapshot_admin_access_requires_verified_admin_identity(self) -> None:
        source = read_text("js/modules/accounts-live-snapshot.js")

        self.assertIn('import { isAdminMode } from "./admin-mode.js', source)
        self.assertIn("isAdmin: isAdminMode(state)", source)
        self.assertNotIn("const billingIsAdmin = state?.billing?.isAdmin === true", source)
        self.assertNotIn("auth.user?.email),", source)

    def test_admin_identity_is_limited_to_owner_gmail(self) -> None:
        auth_source = read_text("js/modules/auth-session.js")
        billing_source = read_text("js/modules/billing-status.js")
        connections_source = read_text("js/modules/connections.js")
        debug_source = read_text("js/modules/debug.js")

        self.assertIn('"kevinmartinezpallares@gmail.com"', auth_source)
        self.assertNotIn("kevinmartinezpallares@hotmail.com", auth_source)
        self.assertIn("isAdminIdentity(currentUser.id, currentUser.email)", billing_source)
        self.assertIn("export function isEffectiveBillingAdmin", billing_source)
        self.assertIn("if (isEffectiveBillingAdmin(state)) return true;", billing_source)
        self.assertNotIn("if (billingState.isAdmin === true) return true;", billing_source)
        self.assertIn("isAdminMode(state)", connections_source)
        self.assertIn("isAdminMode(state)", debug_source)

    def test_dynamic_admin_navigation_is_hidden_from_billing_state(self) -> None:
        source = read_text("app.js")

        self.assertIn("const syncAdminUI = (state = store.getState()) =>", source)
        self.assertIn('document.querySelectorAll("[data-admin-only]")', source)
        self.assertIn("isEffectiveBillingAdmin(state)", source)
        self.assertNotIn("if (billingState.isAdmin === true) return false;", source)
        self.assertNotIn("const adminOnlyNodes = [...document.querySelectorAll", source)

    def test_debug_page_route_is_hard_blocked_for_non_admin_users(self) -> None:
        source = read_text("app.js")

        self.assertIn("function canUseDebugPage(state)", source)
        self.assertIn("return isAdminMode(state);", source)
        self.assertNotIn('hasBillingEntitlement(state, "rawBridgeDebug"', source)

    def test_feature_modules_do_not_trust_raw_billing_admin_flag(self) -> None:
        funded = read_text("js/modules/funded.js")
        risk = read_text("js/modules/risk.js")

        self.assertIn('import { isAdminMode } from "./admin-mode.js', funded)
        self.assertIn("return isAdminMode(state);", funded)
        self.assertIn("isAdminMode(state) ? `<div class=\"risk-lock-meta\"", risk)
        self.assertNotIn("state.billing?.isAdmin === true", funded)
        self.assertNotIn("state.billing?.isAdmin === true", risk)

    def test_add_account_entrypoints_use_billing_entitlement_gate(self) -> None:
        dashboard = read_text("js/modules/dashboard.js")
        sidebar = read_text("js/modules/sidebar-ui.js")
        connections = read_text("js/modules/connections.js")
        wizard = read_text("js/modules/connection-wizard.js")

        self.assertIn("billingEntitlementState", dashboard)
        self.assertIn("function renderDashboardConnectionAction", dashboard)
        self.assertIn("allowPending: false", dashboard)
        self.assertIn('data-open-subscription-prompt="true"', dashboard)
        self.assertIn("billingEntitlementState", sidebar)
        self.assertIn("function sidebarConnectionAccess", sidebar)
        self.assertIn('data-open-subscription-prompt="true"', sidebar)
        self.assertIn('kmfx:open-subscription-prompt', sidebar)
        self.assertIn("billingEntitlementState", connections)
        self.assertIn("const connectionAccess = billingEntitlementState(state, \"launcherConnection\"", connections)
        self.assertIn("renderConnectionAccessState(connectionAccess)", connections)
        self.assertIn("connectAttrs", connections)
        self.assertIn('data-open-subscription-prompt="true"', connections)
        self.assertIn('data-open-connection-wizard="true"', connections)
        self.assertIn("billingEntitlementState(initialStoreState, \"launcherConnection\"", wizard)
        self.assertIn("allowPending: false", wizard)
        self.assertIn("if (!connectionAccess.allowed)", wizard)

    def test_billing_status_fetch_bypasses_browser_and_cdn_cache(self) -> None:
        source = read_text("js/modules/billing-status.js")

        self.assertIn("_=${Date.now()}", source)
        self.assertIn('cache: "no-store"', source)
        self.assertIn('"Cache-Control": "no-store"', source)
        self.assertIn('Pragma: "no-cache"', source)

    def test_critical_auth_admin_and_billing_modules_share_fresh_cache_key(self) -> None:
        files = [
            "index.html",
            "app.js",
            "js/modules/admin-mode.js",
            "js/modules/billing-status.js",
            "js/modules/connection-wizard.js",
            "js/modules/connections.js",
            "js/modules/funded.js",
            "js/modules/risk.js",
            "js/modules/sidebar-ui.js",
        ]
        for relative_path in files:
            source = read_text(relative_path)
            for module in ("auth-session", "admin-mode", "billing-status", "connection-wizard", "connections", "download-artifacts"):
                marker = f"{module}.js?v=build-"
                if marker in source:
                    self.assertIn(
                        f"{module}.js?v=build-20260514-013000",
                        source,
                        f"{relative_path} must import {module} with the current production cache key",
                    )

    def test_dashboard_shell_uses_current_production_cache_key(self) -> None:
        html = read_text("index.html")
        app = read_text("app.js")

        self.assertIn('src="./app.js?v=build-20260514-013000"', html)
        self.assertIn('const BUILD_TAG = "build-20260514-013000";', app)
        for module in ("dashboard", "connections", "sidebar-ui", "auth-ui"):
            self.assertIn(
                f"./js/modules/{module}.js?v=build-20260514-013000",
                app,
                f"app.js must load {module} with the current production cache key",
            )

    def test_calendar_day_report_avoids_technical_copy(self) -> None:
        source = read_text("js/modules/calendar.js")

        self.assertIn("Detalle de aportes, impacto y ejecución", source)
        self.assertNotIn("Detalle técnico conservado", source)
        self.assertIn("Historial real desde", source)
        self.assertNotIn("Ledger real desde", source)

    def test_calendar_view_escapes_mt5_dynamic_values(self) -> None:
        source = read_text("js/modules/calendar.js")

        self.assertIn("function safeCalendarToken", source)
        self.assertIn("function formatCalendarCellText", source)
        self.assertIn('return value == null || value === "" ? "—" : escapeCalendarStatText(value);', source)
        self.assertIn("<strong>${formatCalendarCellText(trade.symbol)}</strong>", source)
        self.assertIn("focus-panel-trade-side--${sideToken}", source)
        self.assertIn("${formatCalendarCellText(trade.side)}</span>", source)
        self.assertIn("${formatCalendarCellText(trade.entry)}</span>", source)
        self.assertIn("${formatCalendarCellText(displayCalendarSetup(trade.setup))}", source)
        self.assertIn("${formatCalendarCellText(trade.session)}</span>", source)
        self.assertIn("${escapeCalendarStatText(executiveRead.summary)}</p>", source)
        self.assertIn('data-calendar-day="${escapeCalendarStatText(cell.key)}"', source)
        self.assertIn("calendar-inline-note--${safeCalendarToken(note.tone)}", source)
        self.assertIn("Total general", source)

    def test_visible_user_copy_avoids_internal_runtime_terms(self) -> None:
        utils = read_text("js/modules/utils.js")
        analytics = read_text("js/modules/analytics.js")
        risk_live = read_text("js/modules/risk-live-snapshot.js")
        topbar = read_text("js/modules/topbar-status.js")
        dashboard = read_text("js/modules/dashboard.js")

        self.assertIn("historial real de MT5", utils)
        self.assertIn("Dato de cuenta en tiempo real", utils)
        self.assertNotIn("ledger MT5", utils)
        self.assertNotIn("ledger real", utils)
        self.assertIn("Activar protección automática", analytics)
        self.assertNotIn("protección automática local", analytics)
        self.assertNotIn("motor local", analytics)
        self.assertNotIn("entorno local", analytics)
        self.assertIn("No se pudo abrir la conexión MT5.", risk_live)
        self.assertNotIn("bridge MT5", risk_live)
        self.assertIn("data-topbar-user-name>Usuario</div>", topbar)
        self.assertNotIn("Usuario local", topbar)
        self.assertIn("Trazabilidad del panel", dashboard)
        self.assertNotIn("Panel source trace", dashboard)
        self.assertIn("ejecución real por estrategia", read_text("js/modules/backtest-real.js"))
        self.assertNotIn("ledger real", read_text("js/modules/backtest-real.js"))
        self.assertIn("Seguimiento, régimen y catalizadores", read_text("js/modules/navigation.js"))
        self.assertNotIn("Watchlist, régimen", read_text("js/modules/navigation.js"))

    def test_visible_metric_and_execution_copy_is_spanish_first(self) -> None:
        files = {
            "index": read_text("index.html"),
            "dashboard": read_text("js/modules/dashboard.js"),
            "calendar": read_text("js/modules/calendar.js"),
            "trades": read_text("js/modules/trades.js"),
            "analytics": read_text("js/modules/analytics.js"),
            "accounts": read_text("js/modules/accounts-ui.js"),
            "journal": read_text("js/modules/journal.js"),
            "discipline": read_text("js/modules/discipline.js"),
            "talent": read_text("js/modules/talent.js"),
            "risk": read_text("js/modules/risk.js"),
        }

        combined = "\n".join(files.values())
        for expected in [
            "PnL abierto",
            "Última sincronización",
            "Tasa de acierto",
            "Factor de beneficio",
            "Expectativa",
            "1 operación",
            "operaciones en rango",
            "Revisión posterior priorizada",
            "Revisión rápida posterior",
            "Seguimiento EA pendiente",
            "Progreso del trader",
        ]:
            self.assertIn(expected, combined)

        forbidden_by_file = {
            "dashboard": ["Open PnL", "Profit factor", "Win rate"],
            "calendar": ['"Win Rate"', '"1 trade"', "`1 trade", "} trades`", "} trades<"],
            "trades": ["Win Rate", "Profit factor", "Top Símbolos"],
            "analytics": ["Expectancy", " trade en", " trades en", "} / trade"],
            "accounts": ['"Win Rate"', "} trades"],
            "journal": ["Expectancy", "Ledger neto de pagos", "Entrada rápida post-trade"],
            "discipline": ["REVISIÓN POST-TRADE", "¿Este trade", "Contexto breve del trade", "Sin trade", "trades fallaron"],
            "talent": ["Talent / Progress Tracker", "Win Rate", "Profit Factor"],
            "risk": ["Riesgo/trade", "Heat por encima del trade"],
        }
        for file_key, phrases in forbidden_by_file.items():
            for phrase in phrases:
                self.assertNotIn(phrase, files[file_key])

    def test_modal_and_settings_select_escape_dynamic_values(self) -> None:
        modal = read_text("js/modules/modal-system.js")
        app = read_text("app.js")
        funded = read_text("js/modules/funded.js")

        self.assertIn("function escapeHtml", modal)
        self.assertIn("const safeTitle = escapeHtml(title || \"KMFX Edge\")", modal)
        self.assertIn("const safeSubtitle = escapeHtml(subtitle)", modal)
        self.assertIn("const safeTitle = escapeHtml(title || \"Detalle\")", modal)
        self.assertIn("const safeStatus = escapeHtml(status)", modal)
        self.assertIn("escapeHtml(metric.label)", modal)

        self.assertIn("function escapeHtml", app)
        self.assertIn('value="${escapeHtml(value)}"', app)
        self.assertIn("${escapeHtml(label)}</option>", app)

        self.assertIn('data-funded-id="${escapeHtml(account.id)}"', funded)
        self.assertIn('${escapeHtml(linked?.name || "Sin vincular")}', funded)
        self.assertIn("${escapeHtml(enriched.propFirm)}", funded)

    def test_trades_view_escapes_mt5_dynamic_values(self) -> None:
        source = read_text("js/modules/trades.js")

        self.assertIn('return value == null || value === "" ? "—" : escapeHtml(value);', source)
        self.assertIn('data-position-id="${escapeHtml(positionDomId(position))}"', source)
        self.assertIn("${escapeHtml(position.symbol)}", source)
        self.assertIn("${escapeHtml(position.side)}", source)
        self.assertIn('value="${escapeHtml(symbol)}"', source)
        self.assertIn('value="${escapeHtml(session)}"', source)
        self.assertIn('value="${escapeHtml(setup)}"', source)
        self.assertIn('data-trade-id="${escapeHtml(trade.id)}"', source)
        self.assertIn("<td>${escapeHtml(trade.symbol)}</td>", source)
        self.assertIn("<td>${escapeHtml(normalizeTradeSetup(trade.setup))}</td>", source)
        self.assertIn("<td>${escapeHtml(trade.session)}</td>", source)

    def test_market_view_uses_spanish_copy_and_escapes_dynamic_values(self) -> None:
        source = read_text("js/modules/market.js")

        self.assertIn('title: "Mercado"', source)
        self.assertIn("Símbolo foco", source)
        self.assertIn("Seguimiento activo", source)
        self.assertIn("Catalizadores", source)
        self.assertIn("escapeHtml(item.symbol)", source)
        self.assertIn("escapeHtml(event.title)", source)
        self.assertNotIn("Focus symbol", source)
        self.assertNotIn("Active watchlist", source)
        self.assertNotIn("Watchlist", source)
        self.assertNotIn("Catalysts", source)


if __name__ == "__main__":
    unittest.main()
