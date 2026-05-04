import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

DESKTOP_SUBSECTION_PAGES = [
    "risk-ruin-var",
    "risk-monte-carlo",
    "risk-exposure",
    "journal-review",
    "journal-entries",
    "journal-ai-review",
    "strategies-backtest",
    "strategies-portfolio",
    "funded-rules",
    "funded-payouts",
]

INTERNAL_TAB_PAGES = ["analytics-daily", "analytics-hourly", "analytics-risk"]

DEFAULT_PARENT_PAGES = ["strategies", "analytics", "funded", "risk", "journal"]

ROUTE_TARGETS = {
    "/risk-engine/ruin-var": "risk-ruin-var",
    "/risk-engine/monte-carlo": "risk-monte-carlo",
    "/risk-engine/exposicion": "risk-exposure",
    "/journal/review-queue": "journal-review",
    "/journal/entradas": "journal-entries",
    "/journal/ai-review": "journal-ai-review",
    "/estrategias/backtest-vs-real": "strategies-backtest",
    "/estrategias/portafolios": "strategies-portfolio",
    "/funding/reglas": "funded-rules",
    "/funding/payouts": "funded-payouts",
}


def read_text(relative_path):
    return (ROOT / relative_path).read_text(encoding="utf-8")


def extract_object_body(source, object_name):
    pattern = rf"{re.escape(object_name)}\s*=\s*Object\.freeze\(\{{(?P<body>.*?)\}}\);"
    match = re.search(pattern, source, re.S)
    if not match:
        raise AssertionError(f"Could not find {object_name} object")
    return match.group("body")


class SidebarNavigationContractTests(unittest.TestCase):
    def test_desktop_sidebar_exposes_only_real_subsections(self):
        html = read_text("index.html")
        self.assertIn("nav-subitems", html)
        self.assertIn("sidebar-group-label", html)
        self.assertIn("sidebar-menu-button", html)
        self.assertIn("sidebar-menu-sub", html)
        self.assertIn('data-sidebar="rail"', html)
        self.assertIn("kmfx-edge-icon-contained.svg", html)
        self.assertNotIn("nav-subitem-marker", html)
        for page in DESKTOP_SUBSECTION_PAGES:
            self.assertIn(f'data-page="{page}"', html)
        for submenu in ["strategies", "risk", "journal", "funded"]:
            self.assertIn(f'data-nav-submenu-trigger="{submenu}"', html)
            self.assertIn(f'id="nav-submenu-{submenu}"', html)
        for page in INTERNAL_TAB_PAGES:
            self.assertNotIn(f'data-page="{page}"', html)
        for page in DEFAULT_PARENT_PAGES:
            self.assertNotRegex(
                html,
                rf'class="[^"]*\bnav-subitem\b[^"]*"[^>]*data-page="{re.escape(page)}"',
            )

    def test_route_map_exposes_subsections_as_real_pages(self):
        route_map = read_text("js/modules/route-map.js")
        page_routes = extract_object_body(route_map, "PAGE_ROUTES")

        for page in DESKTOP_SUBSECTION_PAGES + INTERNAL_TAB_PAGES:
            self.assertIn(f'"{page}"', page_routes)

        for path, target in ROUTE_TARGETS.items():
            quoted_path = f'"{path}"'
            quoted_target = f'"{target}"'
            self.assertRegex(
                route_map,
                rf"{re.escape(quoted_path)}\s*:\s*{re.escape(quoted_target)}",
            )

    def test_persisted_subsection_pages_remain_valid(self):
        store = read_text("js/modules/store.js")
        navigation = read_text("js/modules/navigation.js")
        valid_pages = re.search(r"const validPages = new Set\(\[(?P<body>.*?)\]\);", store, re.S)
        self.assertIsNotNone(valid_pages)

        for page in DESKTOP_SUBSECTION_PAGES:
            self.assertIn(f'"{page}"', valid_pages.group("body"))
        self.assertIn("kmfx_sidebar_submenus_v1", navigation)
        self.assertIn("setSubmenuOpen", navigation)

    def test_new_subsection_pages_use_kmfx_visual_shell(self):
        css = read_text("styles-v2.css")
        self.assertIn("KMFX Edge desktop subpage rhythm", css)
        self.assertIn("@media (min-width: 921px)", css)
        self.assertIn(".kmfx-subpage-shell", css)
        self.assertNotIn("KMFX Edge desktop page rhythm: shared product surface for every section.", css)

        module_contracts = {
            "js/modules/risk.js": ["risk-ruin-var", "risk-monte-carlo", "risk-exposure"],
            "js/modules/journal.js": ["journal-review", "journal-entries", "journal-ai-review"],
            "js/modules/strategies.js": ["strategies-backtest", "strategies-portfolio"],
            "js/modules/funded.js": ["funded-rules", "funded-payouts"],
        }
        for module_path, pages in module_contracts.items():
            source = read_text(module_path)
            self.assertIn("kmfx-subpage-shell", source)
            self.assertIn("data-kmfx-subpage", source)
            for page in pages:
                self.assertIn(page, source)

    def test_new_subsection_pages_have_distinct_visual_content(self):
        css = read_text("styles-v2.css")
        journal = read_text("js/modules/journal.js")
        funded = read_text("js/modules/funded.js")
        strategies = read_text("js/modules/strategies.js")
        backtest = read_text("js/modules/backtest-real.js")

        for class_name in [
            "journal-subpage-hero--review",
            "journal-subpage-hero--entries",
            "journal-subpage-hero--ai",
            "journal-subpage-metric",
        ]:
            self.assertIn(class_name, journal)
            self.assertIn(class_name, css)

        for class_name in [
            "funding-subpage-hero--rules",
            "funding-subpage-hero--payouts",
            "funding-rules-command-panel",
            "funding-payout-ledger-panel",
            "funding-ledger-type",
        ]:
            self.assertIn(class_name, funded)
            self.assertIn(class_name, css)

        self.assertIn("fundingRulesSummaryMarkup", funded)
        self.assertIn("fundingPayoutsSummaryMarkup", funded)
        self.assertIn("showChallenges ? `", funded)
        self.assertIn("strategies-setup-item--featured", strategies)
        self.assertIn("strategy-status-chip", strategies)
        self.assertIn("backtest-real-focus-chip", backtest)
        self.assertIn("backtest-real-focus-chip", css)
        self.assertIn('data-tone="${statusTone(strategy.status)}"', backtest)
        for scoped_selector in [
            ".kmfx-subpage-shell .journal-review-item",
            ".kmfx-subpage-shell .journal-ai-export-item",
            ".kmfx-subpage-shell .strategies-setup-item",
            ".kmfx-subpage-shell .strategies-summary__item",
            ".kmfx-subpage-shell .backtest-real-table",
        ]:
            self.assertIn(scoped_selector, css)
        for unscoped_selector in [
            ".app-shell.sidebar-vnext.sidebar-provider .journal-review-item",
            ".app-shell.sidebar-vnext.sidebar-provider .strategies-setup-item",
            ".app-shell.sidebar-vnext.sidebar-provider .backtest-real-table",
        ]:
            self.assertNotIn(unscoped_selector, css)


if __name__ == "__main__":
    unittest.main()
