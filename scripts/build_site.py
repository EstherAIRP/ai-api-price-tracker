"""Build a cache-safe static Pages artifact and reject empty/malformed catalogs."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil

def build_site(source: Path, destination: Path) -> dict:
    source = source.resolve()
    destination = destination.resolve()
    if destination == source or source in destination.parents:
        raise ValueError("Destination cannot be inside site source")
    if destination.exists():
        shutil.rmtree(destination)
    catalog = json.loads((source / "data/prices.json").read_text(encoding="utf-8"))
    history = json.loads((source / "data/history.json").read_text(encoding="utf-8"))
    policies = json.loads((source / "data/provider-fees.json").read_text(encoding="utf-8"))
    if not isinstance(catalog.get("quotes"), list) or not catalog["quotes"]:
        raise ValueError("Refusing to deploy empty model price catalog")
    if not isinstance(history.get("events"), list) or not policies.get("providers", {}).get("OpenRouter"):
        raise ValueError("Missing history or fee policy data")
    shutil.copytree(source, destination)
    pages = {
        "index.html": ("style.css", "fees.js", "app.js"),
        "estimate.html": ("style.css", "estimate-core.js", "estimate.js"),
    }
    asset_versions = {}
    for page, assets in pages.items():
        html_path = destination / page
        html = html_path.read_text(encoding="utf-8")
        for asset in assets:
            payload = (source / asset).read_bytes()
            token = hashlib.sha256(payload).hexdigest()[:12]
            attr = "href" if asset.endswith(".css") else "src"
            pattern = rf'({attr}="\./{re.escape(asset)})(?:\?v=[^"]*)?(")'
            html, count = re.subn(pattern, rf'\g<1>?v={token}\g<2>', html)
            if count != 1:
                raise ValueError(f"Expected exactly one {asset} reference in {page}; found {count}")
            asset_versions[asset] = token
        html_path.write_text(html, encoding="utf-8")
    return {"quotes": len(catalog["quotes"]), "assets": asset_versions}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="site")
    parser.add_argument("--destination", default="dist")
    args = parser.parse_args()
    result = build_site(Path(args.source), Path(args.destination))
    print(json.dumps(result, ensure_ascii=False))
