import importlib.util
import json
import pathlib
import sys
import tempfile
import types
import unittest
from unittest.mock import patch, MagicMock

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("catalog", ROOT / "scripts/build_catalog.py")
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)


class CatalogTests(unittest.TestCase):
    def setUp(self):
        catalog.items.clear()

    def test_urls_reject_other_schemes_and_embedded_credentials(self):
        for url in ("javascript:alert(1)", "ftp://novelfull.com/x", "https://name@novelfull.com/x", "https://novelfull.com.evil.org/x"):
            self.assertFalse(catalog.domain_allowed(url), url)
        self.assertTrue(catalog.domain_allowed("https://novelfull.com/a.html"))

    def test_kitsu_uses_poster_image_for_cover(self):
        data = {"data": [{"attributes": {"canonicalTitle": "Example", "posterImage": {"large": "https://example.com/cover.jpg"}}}]}
        with patch.object(catalog, "http_json", return_value=data):
            self.assertEqual(catalog.kitsu_enrich("Example")["cover"], "https://example.com/cover.jpg")

    def test_missing_alternative_names_cannot_match_an_unrelated_title(self):
        with patch.object(catalog, "http_json", return_value={"data": [{"attributes": {"canonicalTitle": "Unrelated story"}}]}):
            self.assertEqual(catalog.kitsu_enrich("Example"), {})

    def fake_playwright(self):
        context = MagicMock()
        context.__enter__.return_value.chromium.launch.return_value = MagicMock()
        return types.SimpleNamespace(sync_playwright=lambda: context)

    def test_empty_build_does_not_overwrite_existing_catalog(self):
        with tempfile.TemporaryDirectory(dir=ROOT.parent) as folder:
            target = pathlib.Path(folder) / "catalog.json"
            target.write_text('{"items":[{"title":"preserve"}]}', encoding="utf-8")
            before = target.read_bytes()
            with patch.object(catalog, "OUT", str(target)), patch.dict(sys.modules, {"playwright.sync_api": self.fake_playwright()}), patch.object(catalog, "scrape_novelfull"), patch.object(catalog, "scrape_wuxia"):
                with self.assertRaises(RuntimeError):
                    catalog.build_catalog()
            self.assertEqual(target.read_bytes(), before)

    def test_build_argument_rebuilds_without_entering_interactive_prompt(self):
        with patch.object(sys, "argv", ["build_catalog.py", "--build"]), patch.object(catalog, "build_catalog") as build, patch("builtins.input", side_effect=AssertionError("interactive prompt")):
            catalog.main()
            build.assert_called_once()

    def test_workflows_request_a_rebuild(self):
        for name in (".github/workflows/update-novel-catalog.yml", "workflows/update-novel-catalog.yml"):
            self.assertIn("python scripts/build_catalog.py --build", (ROOT / name).read_text(encoding="utf-8"))

    def test_unavailable_source_preserves_its_previous_entries(self):
        with tempfile.TemporaryDirectory(dir=ROOT.parent) as folder:
            target = pathlib.Path(folder) / "catalog.json"
            old = {"source": "Wuxiaworld", "title": "Previous", "url": "https://www.wuxiaworld.com/novel/previous"}
            target.write_text(json.dumps({"items": [old]}), encoding="utf-8")
            def collect(page, base, source):
                if source == "NovelFull.com":
                    catalog.add(source, "New", "https://novelfull.com/new.html")
            with patch.object(catalog, "OUT", str(target)), patch.dict(sys.modules, {"playwright.sync_api": self.fake_playwright()}), patch.object(catalog, "scrape_novelfull", side_effect=collect), patch.object(catalog, "scrape_wuxia"), patch.object(catalog, "apply_kitsu"), patch("builtins.print"):
                catalog.build_catalog()
            self.assertEqual({x["title"] for x in json.loads(target.read_text(encoding="utf-8"))["items"]}, {"New", "Previous"})


if __name__ == "__main__":
    unittest.main()
