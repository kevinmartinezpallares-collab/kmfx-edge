import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_text(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def route_is_covered(route: str, sources: set[str]) -> bool:
    if route in sources:
        return True
    for source in sources:
        if not source.endswith("/:path*"):
            continue
        base = source[: -len("/:path*")]
        if route == base or route.startswith(f"{base}/"):
            return True
    return False


class VercelRoutingContractTests(unittest.TestCase):
    def test_every_spa_route_rewrites_to_index_html(self) -> None:
        route_map = read_text("js/modules/route-map.js")
        page_routes_match = re.search(r"PAGE_ROUTES\s*=\s*Object\.freeze\(\{(?P<body>.*?)\}\);", route_map, re.S)
        self.assertIsNotNone(page_routes_match)
        page_routes = set(re.findall(r":\s*\"(?P<route>/[^\"]+)\"", page_routes_match.group("body")))

        vercel_config = json.loads(read_text("vercel.json"))
        rewrite_sources = {
            rewrite["source"]
            for rewrite in vercel_config.get("rewrites", [])
            if rewrite.get("destination") == "/index.html"
        }

        missing = sorted(route for route in page_routes if not route_is_covered(route, rewrite_sources))
        self.assertEqual([], missing)

    def test_legacy_study_routes_redirect_to_estudio(self) -> None:
        vercel_config = json.loads(read_text("vercel.json"))
        redirects = {
            redirect["source"]: redirect["destination"]
            for redirect in vercel_config.get("redirects", [])
        }
        self.assertEqual("/estudio", redirects.get("/study"))
        self.assertEqual("/estudio", redirects.get("/glossary"))

