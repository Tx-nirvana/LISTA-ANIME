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
        link_patch = patch.object(catalog, 'check_link', return_value={'status': 'unknown', 'at': '2026-10-20'})
        link_patch.start()
        self.addCleanup(link_patch.stop)
        seed_patch = patch.object(catalog, 'load_seeds', return_value=[])
        seed_patch.start()
        self.addCleanup(seed_patch.stop)

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

    def test_partial_failure_keeps_existing_titles_and_primary_identity(self):
        old = {'title':'Martial World','author':'Cocooned Cow','url':'https://novelfull.com/martial-world.html','source':'NovelFull.com','sources':[]}
        new = {'title':'Martial World','author':'Cocooned Cow','url':'https://www.wuxiaworld.com/novel/martial-world','source':'Wuxiaworld','cover':'https://example.com/new.jpg'}
        other = {'title':'Preserved','url':'https://novelfull.net/preserved.html','source':'NovelFull.net'}
        result = catalog.merge_catalog([old,other],[new])
        self.assertEqual(len(result),2)
        merged = next(x for x in result if x['title']=='Martial World')
        self.assertEqual(merged['url'],old['url'])
        self.assertEqual(len(merged['sources']),2)

    def test_chinese_titles_do_not_collapse_to_empty_identity(self):
        self.assertNotEqual(catalog.norm('大道朝天'),catalog.norm('原始战记'))

    def test_chapter_and_afterword_urls_are_not_novel_records(self):
        self.assertFalse(catalog.novel_url('https://novelfull.net/martial-world/afterword.html'))
        self.assertFalse(catalog.novel_url('https://www.wuxiaworld.com/novel/martial-world/mw-chapter-1'))
        self.assertTrue(catalog.novel_url('https://novelfull.net/martial-world.html'))

    def test_same_story_slug_merges_author_aliases_without_merging_different_books(self):
        a={'title':'Example','author':'English Alias','url':'https://novelfull.com/example.html','source':'NovelFull.com'}
        b={'title':'Example','author':'Chinese Alias','url':'https://novelfull.net/example.html','source':'NovelFull.net'}
        self.assertEqual(len(catalog.merge_catalog([a],[b])),1)
        b['url']='https://novelfull.net/another-story.html'
        self.assertEqual(len(catalog.merge_catalog([a],[b])),2)

    def test_listing_title_is_used_instead_of_a_genre_h1(self):
        page=MagicMock()
        page.locator.return_value.count.return_value=0
        self.assertEqual(catalog.page_title(page,'Martial World'),'Martial World')

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
