import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from launcher import mt5_detector


class Mt5DetectorTests(unittest.TestCase):
    def test_detects_experts_folder_without_terminal_candidate(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            experts_dir = root / "MetaQuotes" / "Terminal" / "ABC123" / "MQL5" / "Experts"
            experts_dir.mkdir(parents=True)

            installations = mt5_detector._glob_installations(root, "windows")

        self.assertEqual(1, len(installations))
        self.assertEqual(str(experts_dir), installations[0].experts_path)
        self.assertEqual(str(experts_dir.parent.parent), installations[0].data_path)

    def test_scan_continues_when_windows_removes_a_directory_mid_walk(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            data_path = root / "MetaQuotes" / "Terminal" / "LIVE01"
            experts_dir = data_path / "MQL5" / "Experts"
            experts_dir.mkdir(parents=True)

            def fake_walk(root_path, topdown=True, onerror=None, followlinks=False):
                if onerror:
                    onerror(FileNotFoundError("stale app cache"))
                yield str(root_path), ["MetaQuotes"], []
                yield str(root_path / "MetaQuotes"), ["Terminal"], []
                yield str(root_path / "MetaQuotes" / "Terminal"), ["LIVE01"], []
                yield str(data_path), ["MQL5"], []
                yield str(data_path / "MQL5"), ["Experts"], []

            with patch.object(mt5_detector.os, "walk", side_effect=fake_walk):
                installations = mt5_detector._glob_installations(root, "windows")

        self.assertEqual(1, len(installations))
        self.assertEqual(str(experts_dir), installations[0].experts_path)

    def test_skips_volatile_cache_directories(self) -> None:
        self.assertFalse(mt5_detector._should_descend(Path("Cache")))
        self.assertFalse(mt5_detector._should_descend(Path("node_modules")))
        self.assertTrue(mt5_detector._should_descend(Path("MetaQuotes")))


if __name__ == "__main__":
    unittest.main()
