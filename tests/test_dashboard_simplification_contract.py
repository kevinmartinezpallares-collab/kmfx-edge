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

    def test_dashboard_kpis_use_tooltip_composition_for_help(self) -> None:
        dashboard = read_text("js/modules/dashboard.js")
        styles = read_text("styles-v2.css")

        for snippet in [
            "equity:",
            "pnl:",
            "dd:",
            "edge:",
            '"open-risk":',
            "positions:",
        ]:
            self.assertIn(snippet, dashboard)

        self.assertIn("dashboard-kpi-card__help-wrap", dashboard)
        self.assertIn("data-dashboard-kpi-tooltip", dashboard)
        self.assertIn("aria-describedby", dashboard)
        self.assertIn("kmfx-ui-tooltip dashboard-kpi-card__tooltip", dashboard)
        self.assertIn("role=\"tooltip\"", dashboard)
        self.assertIn(".dashboard-kpi-card__help:focus-visible + .dashboard-kpi-card__tooltip", styles)


if __name__ == "__main__":
    unittest.main()
