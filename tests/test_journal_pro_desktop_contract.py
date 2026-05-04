import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_text(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


class JournalProDesktopContractTests(unittest.TestCase):
    def test_user_facing_copy_does_not_expose_internal_source_terms(self) -> None:
        source = "\n".join(
            read_text(path)
            for path in [
                "js/modules/utils.js",
                "js/modules/journal.js",
                "js/modules/funded.js",
                "js/modules/risk.js",
            ]
        )
        blocked_phrases = [
            "Herramienta de workspace",
            "workspace local",
            "snapshot MT5 del backend",
            "Sin backtests importados en el workspace.",
            "flujo local estable",
            "workspace_journal",
            "Reset local",
            "depende de backend, launcher y EA",
        ]
        for phrase in blocked_phrases:
            self.assertNotIn(phrase, source)

    def test_journal_subpages_keep_distinct_desktop_surfaces(self) -> None:
        journal = read_text("js/modules/journal.js")
        for page, hero_class in {
            "journal-review": "journal-subpage-hero--review",
            "journal-entries": "journal-subpage-hero--entries",
            "journal-ai-review": "journal-subpage-hero--ai",
        }.items():
            self.assertIn(f'activePage === "{page}"', journal)
            self.assertIn(hero_class, journal)

        self.assertRegex(journal, r"const showCockpit\s*=\s*activePage === \"journal\";")
        self.assertIn('const showAiExport = activePage === "journal-ai-review";', journal)
        self.assertIn('Reporte Markdown para enviar fuera del dashboard a una IA externa.', journal)

    def test_funding_rules_and_payouts_are_not_duplicate_pages(self) -> None:
        funded = read_text("js/modules/funded.js")
        self.assertIn('const showRules = activePage === "funded-rules";', funded)
        self.assertIn('const showPayouts = activePage === "funded-payouts";', funded)
        self.assertIn("fundingRulesSummaryMarkup(selected", funded)
        self.assertIn("fundingPayoutsSummaryMarkup(selectedFundingEconomics", funded)
        self.assertIn("funding-rules-command-panel", funded)
        self.assertIn("funding-payout-ledger-panel", funded)

        rules_block = re.search(r"\$\{showRules \? `(?P<body>.*?)` : \"\"\}", funded, re.S)
        payouts_block = re.search(r"\$\{showPayouts \? `(?P<body>.*?)` : \"\"\}", funded, re.S)
        self.assertIsNotNone(rules_block)
        self.assertIsNotNone(payouts_block)
        self.assertIn("Matriz de reglas", rules_block.group("body"))
        self.assertNotIn("Ledger de payouts", rules_block.group("body"))
        self.assertIn("Ledger de payouts", payouts_block.group("body"))
        self.assertNotIn("Matriz de reglas", payouts_block.group("body"))

    def test_risk_subpages_keep_distinct_desktop_surfaces(self) -> None:
        risk = read_text("js/modules/risk.js")
        for page in ["risk-ruin-var", "risk-monte-carlo", "risk-exposure"]:
            self.assertIn(page, risk)
        self.assertIn('showMonteCarlo ? "Monte Carlo"', risk)
        self.assertIn('showExposure ? "Exposición"', risk)
        self.assertIn("risk-simulation-panel", risk)
        self.assertIn("risk-exposure-card", risk)
        self.assertIn("Riesgo abierto y presión inmediata del flujo activo.", risk)


if __name__ == "__main__":
    unittest.main()
