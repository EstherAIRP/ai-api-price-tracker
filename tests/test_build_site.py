"""Deployment regression tests: cache-busted assets and nonempty catalog guard."""
from pathlib import Path
import json
import re
import shutil
import tempfile
import unittest
from scripts.build_site import build_site

ROOT = Path(__file__).resolve().parents[1]

class SiteBuildTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.source = Path(self.tmp.name) / 'site'
        shutil.copytree(ROOT / 'site', self.source)
        self.dist = Path(self.tmp.name) / 'dist'
        prices = {'quotes': [{'id': 'a', 'provider': 'OpenRouter', 'model_id': 'test/model', 'model_name': 'Test Model', 'family': 'GPT', 'input_usd_m': 2.0, 'output_usd_m': 8.0}], 'published_at': '2026-11-24T10:00:00+08:00'}
        (self.source / 'data/prices.json').write_text(json.dumps(prices), encoding='utf-8')
        (self.source / 'data/history.json').write_text(json.dumps({'events': []}), encoding='utf-8')

    def test_assets_are_versioned_and_model_data_is_copied(self):
        result = build_site(self.source, self.dist)
        self.assertEqual(result['quotes'], 1)
        html = (self.dist / 'index.html').read_text(encoding='utf-8')
        for name in ('style.css', 'fees.js', 'app.js'):
            self.assertRegex(html, rf'{re.escape(name)}\?v=[a-f0-9]{{12}}')
        self.assertEqual(json.loads((self.dist / 'data/prices.json').read_text())['quotes'][0]['provider'], 'OpenRouter')
        self.assertIn('id="loadNotice"', html)

    def test_empty_catalog_is_never_deployed(self):
        (self.source / 'data/prices.json').write_text('{"quotes": []}', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'empty model price catalog'):
            build_site(self.source, self.dist)

    def test_changing_css_changes_only_css_version(self):
        first = build_site(self.source, self.dist)['assets']
        with (self.source / 'style.css').open('a', encoding='utf-8') as f:
            f.write('\n/* updated */')
        second = build_site(self.source, self.dist)['assets']
        self.assertNotEqual(first['style.css'], second['style.css'])
        self.assertEqual(first['app.js'], second['app.js'])

if __name__ == '__main__':
    unittest.main()
