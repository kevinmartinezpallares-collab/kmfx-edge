import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_text(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def media_block(source: str, query: str, marker: str = "") -> str:
    if marker:
        marker_index = source.find(marker)
        start = source.find(query, marker_index if marker_index != -1 else 0)
    else:
        start = source.find(query)
    if start == -1:
        raise AssertionError(f"Could not find media query {query!r}")
    open_brace = source.find("{", start)
    if open_brace == -1:
        raise AssertionError(f"Could not find opening brace for {query!r}")
    depth = 0
    for index in range(open_brace, len(source)):
        char = source[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return source[open_brace + 1:index]
    raise AssertionError(f"Could not find closing brace for {query!r}")


class MobileResponsiveContractTests(unittest.TestCase):
    def test_mobile_navigation_uses_sidebar_drawer_not_bottom_nav(self) -> None:
        css = read_text("styles-v2.css")
        mobile_nav = read_text("js/modules/mobile-nav.js")
        design_context = read_text(".impeccable.md")

        self.assertIn("no bottom tab bar", design_context)
        self.assertIn('root.dataset.navigationRetired = "sidebar";\n  return;', mobile_nav)
        self.assertIn("Mobile sidebar shell: replace the retired bottom navigation", css)
        self.assertRegex(css, r"#mobileNavRoot,\s*\.bottom-nav,\s*\.bnav-more-overlay,\s*\.bnav-more-menu\s*\{\s*display: none !important;")
        self.assertIn(".mobile-sidebar-bar", css)
        self.assertIn("data-sidebar-mobile-toggle", read_text("index.html"))

    def test_dashboard_mobile_primitives_are_mobile_only_and_next_friendly(self) -> None:
        css = read_text("styles-v2.css")
        primitive_block = media_block(css, "@media (max-width: 920px)", "Mobile responsive primitives")
        guard_block = media_block(css, "@media (max-width: 920px)", "Mobile cascade guard")

        self.assertIn("--kmfx-mobile-tap: 44px", primitive_block)
        self.assertIn(".kmfx-mobile-stack", primitive_block)
        self.assertIn(".kmfx-mobile-scroll-strip", primitive_block)
        self.assertIn(".kmfx-mobile-sheet", primitive_block)
        self.assertIn("scroll-snap-type: x proximity", primitive_block)
        self.assertIn("overflow-x: auto !important", primitive_block)
        self.assertIn(".dashboard-kpi-premium-grid", guard_block)
        self.assertIn(".table-wrap", guard_block)
        self.assertNotIn("@media (min-width", primitive_block)

    def test_launcher_mobile_overrides_desktop_min_width_without_changing_base(self) -> None:
        css = read_text("launcher/ui/styles.css")
        mobile_block = media_block(css, "@media (max-width: 720px)", "Mobile-only launcher hardening")

        self.assertIn("body {\n  min-width: 860px;", css)
        self.assertIn("min-width: 0;", mobile_block)
        self.assertIn("min-height: 100dvh", mobile_block)
        self.assertIn("overflow-x: clip", mobile_block)
        self.assertIn("touch-action: manipulation", mobile_block)
        self.assertIn(".nav-list", mobile_block)
        self.assertIn("overflow-x: auto", mobile_block)
        self.assertIn(".tool-actions", mobile_block)
        self.assertIn("grid-template-columns: minmax(0, 1fr)", mobile_block)

    def test_mobile_forms_stack_and_keep_native_inputs_readable(self) -> None:
        css = read_text("styles-v2.css")
        form_block = media_block(css, "@media (max-width: 760px)", "Mobile form hardening")

        for selector in [
            ".settings-card .form-grid-clean",
            ".settings-check-grid",
            ".funding-config-modal .form-grid-clean",
            ".calculator-config-card .form-grid-clean",
        ]:
            self.assertIn(selector, form_block)

        self.assertIn("grid-template-columns: minmax(0, 1fr) !important", form_block)
        self.assertIn("min-height: var(--kmfx-mobile-tap, 44px) !important", form_block)
        self.assertIn("font-size: 16px !important", form_block)
        self.assertIn(".settings-actions button", form_block)
        self.assertIn("width: 100% !important", form_block)

    def test_mobile_overlays_are_bounded_and_scrollable(self) -> None:
        css = read_text("styles-v2.css")
        overlay_block = media_block(css, "@media (max-width: 760px)", "Mobile overlay hardening")

        for selector in [
            ".modal-card",
            ".kmfx-ui-dialog",
            ".connection-wizard-modal",
            "#kmfx-posttrade-modal .ptt-dialog",
            ".kmfx-mt5-modal",
            ".custom-select-dropdown",
            ".kmfx-toast",
        ]:
            self.assertIn(selector, overlay_block)

        self.assertIn("max-height: calc(100dvh", overlay_block)
        self.assertIn("overflow-y: auto !important", overlay_block)
        self.assertIn("-webkit-overflow-scrolling: touch", overlay_block)
        self.assertIn("body.modal-open", overlay_block)
        self.assertIn("grid-template-columns: minmax(0, 1fr) !important", overlay_block)

    def test_mobile_charts_are_bounded_without_js_changes(self) -> None:
        css = read_text("styles-v2.css")
        chart_block = media_block(css, "@media (max-width: 760px)", "Mobile chart hardening")

        for selector in [
            ".kmfx-chart-shell",
            ".dashboard-chart-card__chart",
            ".calendar-chart-wrap",
            ".analytics-session-chart",
            ".account-banner-viz",
            ".rule-history-chart",
            ".chart-card canvas",
        ]:
            self.assertIn(selector, chart_block)

        self.assertIn("min-height: clamp(180px, 48vw, 260px) !important", chart_block)
        self.assertIn("max-height: min(58dvh, 360px) !important", chart_block)
        self.assertIn("height: auto !important", chart_block)
        self.assertIn("overflow-x: clip !important", chart_block)
        self.assertIn("scrollbar-width: none", chart_block)

    def test_mobile_css_blocks_keep_balanced_braces(self) -> None:
        for path in ["styles-v2.css", "launcher/ui/styles.css"]:
            css = read_text(path)
            self.assertEqual(css.count("{"), css.count("}"), path)


if __name__ == "__main__":
    unittest.main()
