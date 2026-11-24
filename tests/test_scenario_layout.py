"""The estimator scenario follows the explicitly chosen two-column reading order."""
from html.parser import HTMLParser
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
ORDER = ("promptTokens", "ragTokens", "historyPerTokens", "historyCount", "userTokens", "outputTokens")
VALUES = {"promptTokens":"2000", "ragTokens":"3000", "historyPerTokens":"500",
          "historyCount":"20", "userTokens":"500", "outputTokens":"1000"}

class ScenarioParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_grid = False
        self.inputs = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "div" and "scenario-grid" in attrs.get("class","").split():
            self.in_grid = True
        if self.in_grid and tag == "input":
            self.inputs.append(attrs)
    def handle_endtag(self, tag):
        if self.in_grid and tag == "div":
            self.in_grid = False

class EstimatorScenarioLayoutTests(unittest.TestCase):
    def test_input_order_and_preserved_defaults(self):
        parser = ScenarioParser()
        parser.feed((ROOT / "site/estimate.html").read_text(encoding="utf-8"))
        self.assertEqual(tuple(item.get("id") for item in parser.inputs), ORDER)
        self.assertEqual({item["id"]:item["value"] for item in parser.inputs}, VALUES)
        self.assertTrue(all(item.get("type") == "number" for item in parser.inputs))
    def test_grid_uses_two_columns_in_main_view(self):
        css = (ROOT / "site/style.css").read_text(encoding="utf-8")
        self.assertIn(".scenario-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}", css)

if __name__ == "__main__":
    unittest.main()
