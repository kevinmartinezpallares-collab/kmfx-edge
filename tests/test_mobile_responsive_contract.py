import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_text(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def png_size(relative_path: str) -> tuple[int, int]:
    data = (ROOT / relative_path).read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise AssertionError(f"{relative_path} is not a PNG")
    return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")


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

    def test_mobile_dense_data_surfaces_are_scrollable_and_compact(self) -> None:
        css = read_text("styles-v2.css")
        data_block = media_block(css, "@media (max-width: 760px)", "Mobile data density hardening")

        for selector in [
            ".trades-table-wrap",
            ".calendar-returns-table__wrap",
            ".capital-exposure-table",
            ".funding-ledger-table",
            ".strategies-table-card .table-wrap",
            ".backtest-real-table",
            ".risk-exposure-table__row",
        ]:
            self.assertIn(selector, data_block)

        self.assertIn("overflow-x: auto !important", data_block)
        self.assertIn("min-width: max(560px, 100%) !important", data_block)
        self.assertIn("padding: 9px 10px !important", data_block)
        self.assertIn("white-space: nowrap", data_block)
        self.assertIn("white-space: normal !important", data_block)
        self.assertIn("display: none !important", data_block)
        self.assertIn("grid-template-columns: repeat(2, minmax(0, 1fr)) !important", data_block)

    def test_mobile_workflow_controls_are_touch_safe(self) -> None:
        css = read_text("styles-v2.css")
        workflow_block = media_block(css, "@media (max-width: 760px)", "Mobile workflow polish")
        compact_block = media_block(css, "@media (max-width: 520px)", "Mobile workflow polish")

        for selector in [
            ".trades-history-card .tl-section-header",
            ".trades-toolbar",
            ".trades-filter-field select",
            ".dashboard-screen__actions button",
            ".capital-section__pill",
            ".capital-kpi__value",
        ]:
            self.assertIn(selector, workflow_block)

        self.assertIn("min-height: var(--kmfx-mobile-tap, 44px) !important", workflow_block)
        self.assertIn("font-size: 16px !important", workflow_block)
        self.assertIn("touch-action: manipulation", workflow_block)
        self.assertIn("scrollbar-width: none", workflow_block)
        self.assertIn("grid-template-columns: minmax(0, 1fr) !important", compact_block)
        self.assertIn("width: 100% !important", compact_block)

    def test_mobile_cards_relax_desktop_rhythm(self) -> None:
        css = read_text("styles-v2.css")
        card_block = media_block(css, "@media (max-width: 760px)", "Mobile card rhythm polish")
        compact_block = media_block(css, "@media (max-width: 520px)", "Mobile card rhythm polish")

        for selector in [
            ".trades-overview-grid",
            ".portfolio-account-grid",
            ".risk-core-metrics__grid",
            ".dashboard-professional-kpi-card",
            ".capital-account-card__metric strong",
            ".trades-overview-row__value",
        ]:
            self.assertIn(selector, card_block)

        self.assertIn("grid-template-columns: minmax(0, 1fr) !important", card_block)
        self.assertIn("grid-template-columns: repeat(2, minmax(0, 1fr)) !important", card_block)
        self.assertIn("min-height: auto !important", card_block)
        self.assertIn("padding: var(--kmfx-mobile-card-pad, 14px) !important", card_block)
        self.assertIn("overflow-wrap: anywhere", card_block)
        self.assertIn("touch-action: manipulation", card_block)
        self.assertIn(".capital-account-card__metrics", compact_block)

    def test_mobile_chips_and_badges_resist_overflow(self) -> None:
        css = read_text("styles-v2.css")
        chip_block = media_block(css, "@media (max-width: 760px)", "Mobile chip resilience")
        compact_block = media_block(css, "@media (max-width: 520px)", "Mobile chip resilience")

        for selector in [
            ".account-switcher-badges",
            ".capital-account-card__chips",
            ".calculator-workspace-badges",
            ".risk-select-trigger__tags",
            ".ui-badge",
            ".strategy-status-chip",
            ".risk-selected-tag",
            ".calc-pill",
        ]:
            self.assertIn(selector, chip_block)

        self.assertIn("flex-wrap: wrap !important", chip_block)
        self.assertIn("white-space: normal !important", chip_block)
        self.assertIn("overflow-wrap: anywhere", chip_block)
        self.assertIn("min-height: var(--kmfx-mobile-tap, 44px) !important", chip_block)
        self.assertIn("overflow-x: auto !important", chip_block)
        self.assertIn("scrollbar-width: none", chip_block)
        self.assertIn("flex-wrap: nowrap !important", compact_block)
        self.assertIn("flex: 0 0 auto", compact_block)

    def test_mobile_short_viewports_stay_reachable(self) -> None:
        css = read_text("styles-v2.css")
        short_block = media_block(css, "@media (max-width: 920px) and (max-height: 560px)", "Mobile viewport-height hardening")
        landscape_block = media_block(css, "@media (max-width: 920px) and (orientation: landscape)", "Mobile viewport-height hardening")

        for selector in [
            ".content-sticky-header",
            ".mobile-sidebar-bar",
            ".sidebar.sidebar-panel",
            ".kmfx-ui-dialog",
            ".kmfx-mobile-sheet",
            ".dashboard-chart-card__chart",
        ]:
            self.assertIn(selector, short_block)

        self.assertIn("--kmfx-mobile-edge: 10px", short_block)
        self.assertIn("max-height: 100dvh !important", short_block)
        self.assertIn("overflow-y: auto !important", short_block)
        self.assertIn("max-height: calc(100dvh - 12px", short_block)
        self.assertIn("min-height: clamp(128px, 36dvh, 180px) !important", short_block)
        self.assertIn("flex-basis: min(42vw, 260px) !important", landscape_block)
        self.assertIn("min-height: 40px !important", landscape_block)

    def test_mobile_state_messages_handle_long_copy(self) -> None:
        css = read_text("styles-v2.css")
        state_block = media_block(css, "@media (max-width: 760px)", "Mobile state-message hardening")
        compact_block = media_block(css, "@media (max-width: 520px)", "Mobile state-message hardening")

        for selector in [
            ".kmfx-ui-empty-state",
            ".connections-empty-card",
            ".risk-empty-state__primary",
            ".risk-data-state",
            ".calculator-advice-empty",
            ".connection-wizard__alert",
            ".trades-empty-state",
            ".capital-table-empty",
        ]:
            self.assertIn(selector, state_block)

        self.assertIn("padding: var(--kmfx-mobile-card-pad, 14px) !important", state_block)
        self.assertIn("overflow-wrap: anywhere", state_block)
        self.assertIn("hyphens: auto", state_block)
        self.assertIn("grid-template-columns: minmax(0, 1fr) !important", state_block)
        self.assertIn("min-height: var(--kmfx-mobile-tap, 44px) !important", state_block)
        self.assertIn("white-space: normal !important", state_block)
        self.assertIn("text-align: left !important", compact_block)

    def test_mobile_numeric_values_resist_overflow(self) -> None:
        css = read_text("styles-v2.css")
        number_block = media_block(css, "@media (max-width: 760px)", "Mobile numeric resilience")
        compact_block = media_block(css, "@media (max-width: 520px)", "Mobile numeric resilience")

        for selector in [
            ".kmfx-ui-pnl",
            ".table-num",
            ".trades-position-row__pnl",
            ".connections-account-card__metric-value",
            ".calendar-week-chip__value",
            ".calculator-primary-result strong",
            ".dashboard-professional-kpi__value",
            ".capital-account-card__metric strong",
        ]:
            self.assertIn(selector, number_block)

        self.assertIn("font-variant-numeric: tabular-nums", number_block)
        self.assertIn("overflow-wrap: anywhere", number_block)
        self.assertIn("font-size: clamp(20px, 7.5vw, 32px) !important", number_block)
        self.assertIn("line-height: 1.08 !important", number_block)
        self.assertIn("white-space: normal !important", number_block)
        self.assertIn("font-size: clamp(19px, 8.5vw, 29px) !important", compact_block)

    def test_mobile_auth_surface_is_independent_from_dashboard_shell(self) -> None:
        css = read_text("styles-v2.css")
        auth_block = media_block(css, "@media (max-width: 920px)", "Mobile auth hardening")
        compact_block = media_block(css, "@media (max-width: 520px)", "Mobile auth hardening")
        short_block = media_block(css, "@media (max-width: 920px) and (max-height: 560px)", "Mobile auth hardening")

        for selector in [
            ".auth-screen",
            ".auth-layout",
            ".auth-showcase",
            ".auth-card",
            ".auth-form-grid",
            ".auth-turnstile-wrap",
            ".auth-action",
        ]:
            self.assertIn(selector, auth_block)

        self.assertIn("grid-template-columns: minmax(0, 1fr) !important", auth_block)
        self.assertIn("min-height: var(--kmfx-mobile-tap, 44px) !important", auth_block)
        self.assertIn("font-size: 16px !important", auth_block)
        self.assertIn("overflow-x: auto !important", auth_block)
        self.assertIn("white-space: normal !important", auth_block)
        self.assertIn(".auth-benefits", compact_block)
        self.assertIn("max-height: 44dvh !important", short_block)

    def test_mobile_floating_menus_stay_inside_viewport(self) -> None:
        css = read_text("styles-v2.css")
        menu_block = media_block(css, "@media (max-width: 760px)", "Mobile floating-menu hardening")
        compact_block = media_block(css, "@media (max-width: 520px)", "Mobile floating-menu hardening")

        for selector in [
            ".kmfx-ui-tooltip",
            ".kmfx-ui-popover__content",
            ".kmfx-ui-dropdown",
            ".custom-select-dropdown",
            ".risk-select-menu",
            ".connections-account-card__menu",
            "#section-discipline .rule-profile-add-menu",
            "#section-discipline .rule-profile-weight-menu",
            "#section-discipline .rule-profile-custom-menu",
        ]:
            self.assertIn(selector, menu_block)

        self.assertIn("width: min(100%, calc(100vw - 24px)) !important", menu_block)
        self.assertIn("max-height: min(66dvh, 420px) !important", menu_block)
        self.assertIn("overflow-y: auto !important", menu_block)
        self.assertIn("overscroll-behavior: contain", menu_block)
        self.assertIn("min-height: var(--kmfx-mobile-tap, 44px) !important", menu_block)
        self.assertIn("font-size: 16px !important", menu_block)
        self.assertIn("grid-template-columns: minmax(0, 1fr) !important", menu_block)
        self.assertIn("width: calc(100vw - 16px) !important", compact_block)

    def test_mobile_row_lists_stack_without_text_overflow(self) -> None:
        css = read_text("styles-v2.css")
        row_block = media_block(css, "@media (max-width: 760px)", "Mobile row-list hardening")
        compact_block = media_block(css, "@media (max-width: 520px)", "Mobile row-list hardening")

        for selector in [
            ".funding-rule-row",
            ".funding-state-row",
            ".funding-review-row",
            ".risk-command-center__op-row",
            ".risk-exposure-row",
            ".risk-simulation-dd-row",
            ".trades-overview-row",
            ".trades-symbol-row",
            ".trades-position-row",
            ".focus-panel-execution",
        ]:
            self.assertIn(selector, row_block)

        self.assertIn("min-height: var(--kmfx-mobile-tap, 44px) !important", row_block)
        self.assertIn("grid-template-columns: minmax(0, 1fr) !important", row_block)
        self.assertIn("white-space: normal !important", row_block)
        self.assertIn("overflow-wrap: anywhere", row_block)
        self.assertIn("text-overflow: clip !important", row_block)
        self.assertIn(".trades-open-positions__head", row_block)
        self.assertIn("display: none !important", row_block)
        self.assertIn(".risk-professional-header", compact_block)
        self.assertIn("justify-items: start !important", compact_block)

    def test_mobile_headers_and_tabs_remain_reachable(self) -> None:
        css = read_text("styles-v2.css")
        header_block = media_block(css, "@media (max-width: 760px)", "Mobile header and tab hardening")
        compact_block = media_block(css, "@media (max-width: 520px)", "Mobile header and tab hardening")

        for selector in [
            ".kmfx-ui-page-header",
            ".dashboard-screen__header",
            ".calendar-screen__header",
            ".strategies-screen__header",
            ".risk-engine-page-header",
            ".tl-section-header",
            ".funding-section-head",
            ".calendar-day-report__section-head",
            ".kmfx-ui-page-header__actions",
            ".calendar-screen__actions",
            ".tl-tab-bar",
            ".widget-segmented",
            ".calculator-segmented-control",
            ".dashboard-chart-range",
        ]:
            self.assertIn(selector, header_block)

        self.assertIn("grid-template-columns: minmax(0, 1fr) !important", header_block)
        self.assertIn("font-size: clamp(20px, 7vw, 30px) !important", header_block)
        self.assertIn("overflow-x: auto !important", header_block)
        self.assertIn("overscroll-behavior-inline: contain", header_block)
        self.assertIn("min-height: var(--kmfx-mobile-tap, 44px) !important", header_block)
        self.assertIn("max-width: min(70vw, 220px) !important", header_block)
        self.assertIn("flex-basis: min(100%, 280px) !important", compact_block)

    def test_pwa_install_icon_uses_dedicated_webapp_assets(self) -> None:
        index = read_text("index.html")
        manifest = read_text("kmfx-manifest.json")

        self.assertIn("kmfx-edge-apple-touch-icon.png?v=install-logo-20260505", index)
        self.assertIn("kmfx-manifest.json?v=install-logo-20260505", index)

        for size in [192, 512, 1024]:
            path = f"assets/logos/kmfx-edge-webapp-{size}.png"
            self.assertEqual((size, size), png_size(path))
            self.assertIn(f"kmfx-edge-webapp-{size}.png?v=install-logo-20260505", manifest)

        self.assertEqual((180, 180), png_size("assets/logos/kmfx-edge-apple-touch-icon.png"))
        self.assertIn("kmfx-edge-favicon.svg?v=favicon-optical-20260501", index)

    def test_mobile_connections_screenshot_fixes_prevent_clipped_ctas(self) -> None:
        css = read_text("styles-v2.css")
        connections_block = media_block(css, "@media (max-width: 760px)", "Mobile connections screenshot fixes")
        compact_block = media_block(css, "@media (max-width: 520px)", "Mobile connections screenshot fixes")

        for selector in [
            ".connections-shell__actions",
            ".connections-empty-card__actions",
            ".connections-guide-card__launcher-actions",
            ".connections-shell__kpis",
            ".connections-empty-card",
            ".connections-guide-card",
            ".connections-account-modal__key-value",
        ]:
            self.assertIn(selector, connections_block)

        self.assertIn("grid-template-columns: minmax(0, 1fr) !important", connections_block)
        self.assertIn("overflow: visible !important", connections_block)
        self.assertIn("width: 100% !important", connections_block)
        self.assertIn("grid-template-columns: repeat(2, minmax(0, 1fr)) !important", connections_block)
        self.assertIn("overflow-wrap: anywhere", connections_block)
        self.assertIn("grid-template-columns: minmax(0, 1fr) !important", compact_block)

    def test_mobile_top_safe_rhythm_keeps_headers_clear_of_app_bar(self) -> None:
        css = read_text("styles-v2.css")
        top_block = media_block(css, "@media (max-width: 920px)", "Mobile top-safe rhythm")
        compact_block = media_block(css, "@media (max-width: 520px)", "Mobile top-safe rhythm")
        short_block = media_block(css, "@media (max-width: 920px) and (max-height: 560px)", "Mobile top-safe rhythm")

        for selector in [
            ".content",
            ".content-sticky-header",
            ".kmfx-ui-page-header",
            ".tl-page-header",
            ".dashboard-screen__header",
            ".calendar-screen__header",
            ".connections-shell .calendar-screen__header",
        ]:
            self.assertIn(selector, top_block)

        self.assertIn("--kmfx-mobile-top-rhythm: 16px", top_block)
        self.assertIn("padding-top: var(--kmfx-mobile-top-rhythm, 16px) !important", top_block)
        self.assertIn("scroll-margin-top: calc(72px + env(safe-area-inset-top)) !important", top_block)
        self.assertIn("margin: 10px 0 14px auto !important", top_block)
        self.assertIn("padding-top: 0 !important", top_block)
        self.assertIn("--kmfx-mobile-top-rhythm: 18px", compact_block)
        self.assertIn("max-width: calc(100vw - 24px) !important", compact_block)
        self.assertIn("--kmfx-mobile-top-rhythm: 10px", short_block)
        self.assertIn("margin-bottom: 10px !important", short_block)

    def test_mobile_admin_trace_grid_stays_readable_on_narrow_screens(self) -> None:
        css = read_text("styles-v2.css")
        trace_block = media_block(css, "@media (max-width: 760px)", "Mobile admin trace hardening")
        compact_block = media_block(css, "@media (max-width: 520px)", "Mobile admin trace hardening")

        for selector in [
            ".kmfx-admin-trace-card",
            ".kmfx-admin-trace-card__head",
            ".kmfx-admin-trace-card__badge",
            ".kmfx-admin-trace-card__grid",
            ".kmfx-admin-trace-card__item",
            ".kmfx-admin-trace-card__item span",
            ".kmfx-admin-trace-card__item strong",
        ]:
            self.assertIn(selector, trace_block)

        self.assertIn("padding: var(--kmfx-mobile-card-pad, 14px) !important", trace_block)
        self.assertIn("grid-template-columns: minmax(0, 1fr) !important", trace_block)
        self.assertIn("grid-template-columns: repeat(2, minmax(0, 1fr)) !important", trace_block)
        self.assertIn("white-space: normal !important", trace_block)
        self.assertIn("overflow-wrap: anywhere", trace_block)
        self.assertIn("text-overflow: clip !important", trace_block)
        self.assertIn("grid-template-columns: minmax(0, 1fr) !important", compact_block)
        self.assertIn("font-size: clamp(17px, 5.4vw, 22px) !important", compact_block)

    def test_mobile_calendar_density_uses_local_scroll_instead_of_cramped_cells(self) -> None:
        css = read_text("styles-v2.css")
        calendar_block = media_block(css, "@media (max-width: 760px)", "Mobile calendar density hardening")
        compact_block = media_block(css, "@media (max-width: 520px)", "Mobile calendar density hardening")

        for selector in [
            ".calendar-month-panel",
            ".calendar-month-panel__head",
            ".calendar-month-grid",
            ".calendar-month-grid__head",
            ".calendar-day",
            ".calendar-year-card",
            ".calendar-year-card__head",
            ".calendar-year-card__grid",
            ".calendar-returns-panel",
        ]:
            self.assertIn(selector, calendar_block)

        self.assertIn("overflow: hidden !important", calendar_block)
        self.assertIn("grid-template-columns: repeat(7, minmax(58px, 1fr)) !important", calendar_block)
        self.assertIn("overflow-x: auto !important", calendar_block)
        self.assertIn("overscroll-behavior-inline: contain", calendar_block)
        self.assertIn("-webkit-overflow-scrolling: touch", calendar_block)
        self.assertIn("min-width: 58px !important", calendar_block)
        self.assertIn("touch-action: manipulation", calendar_block)
        self.assertIn("white-space: normal !important", calendar_block)
        self.assertIn("overflow-wrap: anywhere", calendar_block)
        self.assertIn("grid-template-columns: repeat(7, minmax(54px, 1fr)) !important", compact_block)
        self.assertIn("min-width: 54px !important", compact_block)

    def test_mobile_policy_forms_stack_risk_and_funding_editors(self) -> None:
        css = read_text("styles-v2.css")
        policy_block = media_block(css, "@media (max-width: 760px)", "Mobile policy-form hardening")
        compact_block = media_block(css, "@media (max-width: 520px)", "Mobile policy-form hardening")

        for selector in [
            ".risk-policy-editors",
            ".risk-policy-card",
            ".risk-limit-form",
            ".risk-limit-actions",
            ".risk-symbol-editor",
            ".risk-inline-editor-head",
            ".funding-ledger-form",
            ".funding-detail-actions",
        ]:
            self.assertIn(selector, policy_block)

        self.assertIn("grid-template-columns: minmax(0, 1fr) !important", policy_block)
        self.assertIn("min-height: var(--kmfx-mobile-tap, 44px) !important", policy_block)
        self.assertIn("font-size: 16px !important", policy_block)
        self.assertIn("min-height: 108px !important", policy_block)
        self.assertIn("white-space: normal !important", policy_block)
        self.assertIn("overflow-wrap: anywhere", policy_block)
        self.assertIn("text-overflow: clip !important", policy_block)
        self.assertIn("touch-action: manipulation", policy_block)
        self.assertIn("padding: 12px !important", compact_block)

    def test_mobile_technical_text_wraps_urls_keys_and_copy_values(self) -> None:
        css = read_text("styles-v2.css")
        tech_block = media_block(css, "@media (max-width: 760px)", "Mobile technical-text hardening")
        compact_block = media_block(css, "@media (max-width: 520px)", "Mobile technical-text hardening")

        for selector in [
            "code",
            "pre",
            ".connection-wizard__code",
            ".connections-account-modal__key-value",
            ".connections-account-card__key-copy",
            ".connections-guide-card code",
            ".kmfx-mt5-modal pre",
            ".settings-inline-note",
        ]:
            self.assertIn(selector, tech_block)

        self.assertIn("white-space: normal !important", tech_block)
        self.assertIn("overflow-wrap: anywhere", tech_block)
        self.assertIn("word-break: break-word", tech_block)
        self.assertIn("overflow-x: auto !important", tech_block)
        self.assertIn("overscroll-behavior-inline: contain", tech_block)
        self.assertIn("-webkit-overflow-scrolling: touch", tech_block)
        self.assertIn("min-height: var(--kmfx-mobile-tap, 44px) !important", tech_block)
        self.assertIn("touch-action: manipulation", tech_block)
        self.assertIn("font-size: 12px !important", compact_block)
        self.assertIn("line-height: 1.45 !important", compact_block)

    def test_mobile_screenshot_repair_prevents_journal_strategy_settings_collapse(self) -> None:
        css = read_text("styles-v2.css")
        repair_block = media_block(css, "@media (max-width: 760px)", "Mobile screenshot repair")
        compact_block = media_block(css, "@media (max-width: 520px)", "Mobile screenshot repair")

        for selector in [
            'input[type="checkbox"]',
            ".settings-check",
            ".settings-check span",
            ".journal-cockpit-hero",
            ".journal-professional-strip",
            ".journal-kpi-card",
            ".journal-review-list",
            ".journal-subpage-hero",
            ".journal-ai-export-actions",
            ".calendar-month-nav",
            ".calendar-month-nav__label",
            ".calendar-view-toggle",
            ".calendar-value-toggle",
            ".strategies-table-card table",
            ".strategies-table-card thead",
            ".strategies-table-card tr",
            ".strategies-table-card td",
        ]:
            self.assertIn(selector, repair_block)

        self.assertIn("width: 24px !important", repair_block)
        self.assertIn("grid-template-columns: 28px minmax(0, 1fr) !important", repair_block)
        self.assertIn("writing-mode: horizontal-tb !important", repair_block)
        self.assertIn("display: flex !important", repair_block)
        self.assertIn("overflow-x: auto !important", repair_block)
        self.assertIn("flex: 0 0 min(42vw, 168px) !important", repair_block)
        self.assertIn("grid-template-columns: repeat(2, minmax(0, 1fr)) !important", repair_block)
        self.assertIn("display: none !important", repair_block)
        self.assertIn("grid-column: 1 / -1 !important", repair_block)
        self.assertIn("word-break: normal !important", repair_block)
        self.assertIn("grid-template-columns: 28px minmax(92px, 1fr) auto auto 28px !important", repair_block)
        self.assertIn("white-space: nowrap !important", repair_block)
        self.assertIn("overflow: hidden !important", repair_block)
        self.assertIn("overflow: visible !important", repair_block)
        self.assertIn("grid-template-columns: minmax(0, 1fr) !important", compact_block)
        self.assertIn("flex-basis: min(66vw, 180px) !important", compact_block)
        self.assertIn("grid-template-columns: 26px minmax(76px, 1fr) auto auto 26px !important", compact_block)

    def test_mobile_viewport_final_repair_covers_dashboard_calendar_trades_and_scores(self) -> None:
        css = read_text("styles-v2.css")
        repair_block = media_block(css, "@media (max-width: 760px)", "Mobile viewport final repair")
        compact_block = media_block(css, "@media (max-width: 520px)", "Mobile viewport final repair")
        narrow_block = media_block(css, "@media (max-width: 380px)", "Mobile viewport final repair")

        for selector in [
            ".dashboard-kpi-row--primary",
            ".dashboard-professional-kpi-row",
            ".dashboard-kpi-card__metric",
            ".dashboard-professional-kpi__value",
            ".calendar-month-nav__btn:last-child",
            ".calendar-view-toggle",
            ".calendar-value-toggle",
            ".trades-screen .trade-side",
            ".strategies-score-cell",
            ".strategies-score-read__meta",
        ]:
            self.assertIn(selector, repair_block)

        self.assertIn("grid-template-columns: repeat(2, minmax(0, 1fr)) !important", repair_block)
        self.assertIn("grid-template-columns: 30px minmax(98px, 1fr) 30px auto auto !important", repair_block)
        self.assertIn("grid-column: 3 !important", repair_block)
        self.assertIn("display: none !important", repair_block)
        self.assertIn("white-space: nowrap !important", repair_block)
        self.assertIn("overflow-wrap: normal !important", repair_block)
        self.assertIn("word-break: keep-all !important", repair_block)
        self.assertIn("writing-mode: horizontal-tb !important", repair_block)
        self.assertIn("font-size: clamp(20px, 6vw, 28px) !important", repair_block)
        self.assertIn("grid-template-columns: 28px minmax(86px, 1fr) 28px auto auto !important", compact_block)
        self.assertIn("grid-template-columns: minmax(0, 1fr) !important", narrow_block)

    def test_mobile_sidebar_submenu_parent_toggles_when_drawer_is_open(self) -> None:
        js = read_text("js/modules/navigation.js")

        self.assertIn("document.body.classList.contains(\"sidebar-mobile-open\")", js)
        self.assertIn("clickedChevron || isMobileSidebarOpen || submenuState[submenuKey] !== false", js)
        self.assertIn("toggleSubmenu(submenuKey)", js)
        self.assertIn("setSubmenuOpen(submenuKey, true)", js)

    def test_mobile_shadcn_composition_repairs_var_calendar_and_sidebar(self) -> None:
        css = read_text("styles-v2.css")
        mobile_block = media_block(css, "@media (max-width: 760px)", "Mobile shadcn composition repair")
        compact_block = media_block(css, "@media (max-width: 520px)", "Mobile shadcn composition repair")
        dashboard_js = read_text("js/modules/dashboard.js")
        calendar_js = read_text("js/modules/calendar.js")

        for selector in [
            'data-dashboard-professional-kpi="var_95"',
            ".dashboard-professional-kpi__risk-score",
            ".dashboard-professional-kpi__risk-progress",
            ".calendar-month-switcher",
            ".calendar-control-tabs",
            ".calendar-view-toggle",
            ".calendar-value-toggle",
            ".sidebar-menu-sub[hidden]",
            ".nav-subitems[hidden]",
        ]:
            self.assertIn(selector, mobile_block)

        self.assertIn("grid-template-columns: 34px minmax(0, 1fr) 34px !important", mobile_block)
        self.assertIn("border-radius: 999px !important", mobile_block)
        self.assertIn("width: clamp(8px, calc(var(--risk-score) * 1%), 100%) !important", mobile_block)
        self.assertIn("display: none !important", mobile_block)
        self.assertIn("grid-template-columns: minmax(0, 1fr) !important", compact_block)
        self.assertIn("dashboard-professional-kpi__risk-score", dashboard_js)
        self.assertIn("dashboard-professional-kpi__risk-progress-fill", dashboard_js)
        self.assertIn("calendar-month-switcher", calendar_js)
        self.assertIn("calendar-control-tabs", calendar_js)

    def test_mobile_css_blocks_keep_balanced_braces(self) -> None:
        for path in ["styles-v2.css", "launcher/ui/styles.css"]:
            css = read_text(path)
            self.assertEqual(css.count("{"), css.count("}"), path)


if __name__ == "__main__":
    unittest.main()
