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


if __name__ == "__main__":
    unittest.main()
