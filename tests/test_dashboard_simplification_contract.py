import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_text(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


class DashboardSimplificationContractTests(unittest.TestCase):
    def test_shadcn_skill_is_installed_for_project_guidance(self) -> None:
        self.assertTrue((ROOT / ".agents/skills/shadcn/SKILL.md").exists())
        self.assertTrue((ROOT / "skills-lock.json").exists())
        self.assertIn('"source": "shadcn/ui"', read_text("skills-lock.json"))

    def test_dashboard_primary_kpis_use_tooltip_composition_for_help(self) -> None:
        dashboard = read_text("js/modules/dashboard.js")
        styles = read_text("styles-v2.css")
        overview = re.search(
            r'<section class="tl-kpi-row dashboard-summary-kpis dashboard-kpi-row dashboard-kpi-row--overview">(?P<body>.*?)</section>',
            dashboard,
            re.S,
        )
        self.assertIsNotNone(overview)
        overview_body = overview.group("body")

        for snippet in [
            "equity:",
            "pnl:",
            "dd:",
            "edge:",
            '"open-risk":',
            "positions:",
        ]:
            self.assertIn(snippet, dashboard)

        self.assertEqual(overview_body.count("renderDashboardKpiCard({"), 6)
        self.assertIn('key: "equity"', overview_body)
        self.assertIn('key: "pnl"', overview_body)
        self.assertIn('key: "dd"', overview_body)
        self.assertIn('key: "edge"', overview_body)
        self.assertIn('key: "open-risk"', overview_body)
        self.assertIn('key: "positions"', overview_body)
        self.assertIn("grid-template-columns: repeat(6, minmax(0, 1fr));", styles)
        self.assertIn("dashboard-kpi-card__help-wrap", dashboard)
        self.assertIn("data-dashboard-kpi-tooltip", dashboard)
        self.assertIn("aria-describedby", dashboard)
        self.assertIn("kmfx-ui-tooltip dashboard-kpi-card__tooltip", dashboard)
        self.assertIn("role=\"tooltip\"", dashboard)
        self.assertIn(".dashboard-kpi-card__help:focus-visible + .dashboard-kpi-card__tooltip", styles)
        self.assertIn("overflow: visible;", styles)
        self.assertIn(".dashboard-kpi-card__help-wrap {\n  position: static;", styles)
        self.assertIn(".dashboard-kpi-card:nth-child(n+5) .dashboard-kpi-card__tooltip", styles)
        self.assertIn(".dashboard-kpi-card__tooltip .kmfx-ui-tooltip__content", styles)
        self.assertIn("box-sizing: border-box;", styles)


if __name__ == "__main__":
    unittest.main()
