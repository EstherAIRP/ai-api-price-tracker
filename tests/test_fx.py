import unittest
from scripts.fx import parse_fx

class FXTests(unittest.TestCase):
    def test_valid_rate_and_date(self):
        data = parse_fx({"date":"2026-11-24","usd":{"twd":31.2}}, "https://example.org")
        self.assertEqual(data["usd_twd"], 31.2)
        self.assertEqual(data["rate_date"], "2026-11-24")

    def test_invalid_or_missing_rate(self):
        for rate in (-1, 0, 500, None, "32"):
            with self.assertRaises((ValueError, TypeError)):
                parse_fx({"date":"2026-11-24","usd":{"twd":rate}}, "https://example.org")

    def test_date_is_required(self):
        with self.assertRaises((ValueError, TypeError)):
            parse_fx({"date":"tomorrow","usd":{"twd":31.2}}, "https://example.org")
