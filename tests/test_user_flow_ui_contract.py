import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_text(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


class UserFlowUiContractTests(unittest.TestCase):
    def test_email_signin_does_not_require_turnstile_token(self) -> None:
        source = read_text("js/modules/auth-ui.js")

        self.assertIn('["signup", "forgot", "reset"].includes(mode)', source)
        self.assertNotIn('ensureTurnstileCompleted("signin")', source)
        self.assertNotIn('getTurnstileToken("signin")', source)
        self.assertIn("signInWithPassword?.({ email, password })", source)
        self.assertNotIn("signInWithPassword?.({ email, password, captchaToken })", source)

    def test_account_detail_warnings_are_user_safe(self) -> None:
        source = read_text("js/modules/connections.js")

        self.assertIn("function normalizeAccountWarningText", source)
        self.assertIn("function accountDataSourceLabel", source)
        self.assertIn("const readable = (value) =>", source)
        self.assertIn('normalized.includes("[object object]")', source)
        self.assertIn("KMFX esta usando un limite de riesgo por defecto", source)
        self.assertIn("Último dato recibido", source)
        self.assertNotIn("Trazabilidad técnica", source)
        self.assertNotIn("Último payload", source)

    def test_account_detail_modal_is_scrollable_and_wide_enough(self) -> None:
        css = read_text("styles-v2.css")

        self.assertIn("width: min(96vw, 1080px) !important", css)
        self.assertIn("max-height: min(90dvh, 920px) !important", css)
        self.assertIn("max-height: calc(90dvh - 128px)", css)
        self.assertIn("overflow-y: auto", css)

    def test_metric_study_cards_preserve_scroll_and_explain_trader_use(self) -> None:
        source = read_text("js/modules/glossary.js")
        css = read_text("styles-v2.css")

        self.assertIn("data-study-slider", source)
        self.assertIn("__metricStudyScrollLeft", source)
        self.assertIn("Para el trader", source)
        self.assertIn("overflow: hidden", css)
        self.assertIn("study-metric-card--term", source)

    def test_metric_study_copy_avoids_internal_source_terms(self) -> None:
        source = read_text("js/modules/dashboard-professional-kpis.js")

        self.assertIn("Módulo de riesgo KMFX", source)
        self.assertIn("Score de calidad KMFX calculado con la muestra disponible", source)
        self.assertNotIn("Backend Risk Metrics", source)
        self.assertNotIn("dashboard payload", source)
        self.assertNotIn("snapshot MT5", source)

    def test_connection_wizard_avoids_internal_sync_copy(self) -> None:
        source = read_text("js/modules/connection-wizard.js")

        self.assertIn("esperando primera sincronización", source)
        self.assertIn("primer dato de MT5", source)
        self.assertNotIn("falta sync live", source)
        self.assertNotIn("snapshot directo", source)
        self.assertNotIn("datos live", source)

    def test_calendar_day_report_avoids_technical_copy(self) -> None:
        source = read_text("js/modules/calendar.js")

        self.assertIn("Detalle de aportes, impacto y ejecución", source)
        self.assertNotIn("Detalle técnico conservado", source)


if __name__ == "__main__":
    unittest.main()
