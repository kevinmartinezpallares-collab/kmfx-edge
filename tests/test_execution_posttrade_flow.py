import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_text(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


class ExecutionPostTradeFlowTests(unittest.TestCase):
    def test_post_trade_review_opens_globally_without_navigation(self) -> None:
        app = read_text("app.js")
        function_match = re.search(
            r"function openPostTradeTagFromIntent\(trade\) \{(?P<body>.*?)\n\}",
            app,
            re.S,
        )
        self.assertIsNotNone(function_match)
        body = function_match.group("body")

        self.assertIn("ensurePostTradePortal()", body)
        self.assertIn("modalOnly: true", body)
        self.assertNotIn('activePage: "discipline"', body)
        self.assertIn("initPostTradeAutoPrompt();", app)
        self.assertIn("kmfx-posttrade-portal", app)

    def test_execution_copy_prioritizes_context_over_historical_tag_backlog(self) -> None:
        discipline = read_text("js/modules/discipline.js")

        self.assertIn("POST_TRADE_REVIEW_LIMIT = 8", discipline)
        self.assertIn("Revisión post-trade priorizada", discipline)
        self.assertIn("No hace falta reconstruir todo el histórico", discipline)
        self.assertIn("las métricas MT5 siguen siendo válidas", discipline)
        self.assertIn("Revisar pendientes", discipline)
        self.assertNotIn("Completar tags", discipline)
        self.assertNotIn("Simular cierre", discipline)
        self.assertNotIn("Guardar tag", discipline)


if __name__ == "__main__":
    unittest.main()
