import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_text(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


class FrontendXssContractTests(unittest.TestCase):
    def test_account_switcher_escapes_live_account_identity(self) -> None:
        source = read_text("js/modules/accounts-ui.js")
        for snippet in [
            "${escapeHtml(account.id)}",
            "${escapeHtml(display.title)}",
            "${escapeHtml(meta)}",
            "${escapeHtml(label || account.name)}",
            "${escapeHtml(activeAccountLabel)}",
        ]:
            self.assertIn(snippet, source)

        for unsafe_snippet in [
            "${display.title}</div>",
            "${meta}</div>",
            'value="${account.id}"',
            ">${label || account.name}</option>",
        ]:
            self.assertNotIn(unsafe_snippet, source)

    def test_sidebar_escapes_profile_identity(self) -> None:
        source = read_text("js/modules/sidebar-ui.js")
        for snippet in [
            "${escapeHtml(traderName)}",
            'title="${escapeHtml(email)}"',
            "${escapeHtml(email)}",
        ]:
            self.assertIn(snippet, source)

        for unsafe_snippet in [
            "${traderName}</div>",
            'title="${email}"',
            ">${email}</div>",
        ]:
            self.assertNotIn(unsafe_snippet, source)

    def test_capital_page_escapes_account_and_position_labels(self) -> None:
        source = read_text("js/modules/portfolio.js")
        for snippet in [
            "${escapeHtml(display.title)}",
            "${escapeHtml(subtitle)}",
            "${escapeHtml(position.accountName)}",
            "${escapeHtml(position.symbol)}",
            "${escapeHtml(position.side)}",
            "${escapeHtml(formatDateTime(position.openedAt))}",
        ]:
            self.assertIn(snippet, source)

        for unsafe_snippet in [
            "${display.title}</strong>",
            "${subtitle}</span>",
            "<td>${position.accountName}</td>",
            "<td>${position.symbol}</td>",
            ">${position.side}</span>",
        ]:
            self.assertNotIn(unsafe_snippet, source)

    def test_strategies_escapes_user_defined_setup_fields(self) -> None:
        source = read_text("js/modules/strategies.js")
        for snippet in [
            "function escapeHtml",
            "function safeToken",
            "${escapeHtml(item.name)}",
            "${escapeHtml(item.description || \"Sin descripción operativa.\")}",
            "${escapeHtml(item.market || \"—\")}",
            "${escapeHtml(item.timeframe || \"—\")}",
            "${escapeHtml(item.session || \"—\")}",
            'data-strategy-id="${escapeHtml(item.id)}"',
            "strategy-status-chip--${safeToken(item.status || \"testing\", \"testing\")}",
            "${escapeHtml(strongestSetup?.name || \"—\")}",
            "${escapeHtml(weakestSetup?.name || \"—\")}",
        ]:
            self.assertIn(snippet, source)

        for unsafe_snippet in [
            "<strong>${item.name}</strong>",
            "${item.description || \"Sin descripción operativa.\"}",
            "<td>${item.market || \"—\"}</td>",
            "<td>${item.timeframe || \"—\"}</td>",
            "<td>${item.session || \"—\"}</td>",
            'data-strategy-id="${item.id}"',
            "strategy-status-chip--${item.status || \"testing\"}",
        ]:
            self.assertNotIn(unsafe_snippet, source)

    def test_analytics_escapes_dynamic_markup_from_mt5_and_journal(self) -> None:
        source = read_text("js/modules/analytics.js")
        for snippet in [
            "function escapeHtml",
            "function safeClassToken",
            "escapeHtml(item.label)",
            "escapeHtml(item.value)",
            "escapeHtml(item.meta)",
            "escapeHtml(item.secondary)",
            "escapeHtml(summaryReviewTitle)",
            "escapeHtml(summaryDrain.noteLead)",
            "escapeHtml(riskHeroTitle)",
            "escapeHtml(riskHeroContext)",
            "escapeHtml(badge.label)",
            "escapeHtml(badge.value)",
            "escapeHtml(group.title)",
            "escapeHtml(item.note)",
            "escapeHtml(row.title)",
            "escapeHtml(row.note)",
            "escapeHtml(row.metric)",
            "escapeHtml(row.status)",
            "escapeHtml(riskInsight)",
            "escapeHtml(riskProtection.state)",
            "escapeHtml(riskProtection.note)",
            "safeClassToken(item.tone)",
            "safeClassToken(row.tone)",
            "safeClassToken(riskProtection.tone)",
        ]:
            self.assertIn(snippet, source)

        for unsafe_snippet in [
            "${item.label}</span>",
            "${item.value}</strong>",
            "${item.meta}</span>",
            "${item.secondary}</small>",
            "${formatSignedCurrency(damageDriver.pnl)}<br>",
            "${summaryReviewTitle}</strong>",
            "${summaryDrain.noteLead}</span>",
            "<h3>${riskHeroTitle}</h3>",
            "<p>${riskHeroContext}</p>",
            "<strong>${row.title}</strong>",
            "<span>${row.note}</span>",
            "<p>${riskInsight}</p>",
            ">${riskProtection.state}</span>",
            "<small>${riskProtection.note}</small>",
        ]:
            self.assertNotIn(unsafe_snippet, source)


if __name__ == "__main__":
    unittest.main()
