"""Refresh the public USD/TWD reference rate; retain last valid snapshot on failure.

Data: fawazahmed0/exchange-api, updated daily, available from jsDelivr/Cloudflare.
No API key is required and missing FX must never block price updates.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

TARGET = Path("site/data/fx-rate.json")
URLS = [
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
    "https://latest.currency-api.pages.dev/v1/currencies/usd.json",
]


def parse_fx(payload: dict, source: str) -> dict:
    rate = payload.get("usd", {}).get("twd")
    date = payload.get("date")
    if (type(rate) not in (int, float) or not 1 < rate < 100 or
            not isinstance(date, str)):
        raise ValueError("Invalid USD/TWD data")
    datetime.strptime(date, "%Y-%m-%d")
    return {
        "base": "USD", "quote": "TWD", "usd_twd": float(rate),
        "rate_date": date, "source": source,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def refresh(target: Path = TARGET) -> bool:
    for url in URLS:
        try:
            req = Request(url, headers={"User-Agent": "API-Atlas/1.0 (+https://github.com/EstherAIRP/ai-api-price-tracker)"})
            with urlopen(req, timeout=15) as response:
                payload = json.load(response)
            data = parse_fx(payload, url)
            if target.exists():
                old = json.loads(target.read_text(encoding="utf-8"))
                if old.get("usd_twd") == data["usd_twd"] and old.get("rate_date") == data["rate_date"]:
                    print("FX unchanged:", data["rate_date"], data["usd_twd"])
                    return True
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print("FX updated:", data["rate_date"], data["usd_twd"])
            return True
        except Exception as exc:
            print("Warning: FX endpoint failed:", url, repr(exc))
    print("Warning: unable to refresh FX; preserving previous valid snapshot if available")
    return False


if __name__ == "__main__":
    refresh()
