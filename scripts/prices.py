#!/usr/bin/env python3
"""Collect public API pricing snapshots, validate and publish static JSON.

No paid LLM calls required. Source attribution is explicit: the models.dev catalog
is a community-curated reference, NOT first-party pricing verification.
"""
from __future__ import annotations

import argparse
import datetime as dt
import decimal
import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
STAGING = ROOT / 'data' / 'staging.json'
PUBLISHED = ROOT / 'site' / 'data' / 'prices.json'
HISTORY = ROOT / 'site' / 'data' / 'history.json'
TZ = ZoneInfo('Asia/Taipei')
MAX_RESPONSE = 24_000_000
MODEL_CATALOG = 'https://models.dev/api.json'
OPENROUTER_MODELS = 'https://openrouter.ai/api/v1/models'

FAMILIES = {
    'openai': 'GPT', 'google': 'Gemini', 'anthropic': 'Claude',
    'deepseek': 'DeepSeek', 'xai': 'Grok',
}
# These links are the first-party price references, NOT evidence that today's
# numbers were scraped or verified against those pages.
OFFICIAL_PRICING = {
    'GPT': 'https://openai.com/api/pricing/',
    'Gemini': 'https://ai.google.dev/gemini-api/docs/pricing',
    'Claude': 'https://www.anthropic.com/pricing#api',
    'DeepSeek': 'https://api-docs.deepseek.com/quick_start/pricing',
    'Grok': 'https://docs.x.ai/developers/models',
}
# Explicitly scoped hosts; unknown providers are not silently presented as
# one of the user's requested platforms.
PROVIDER_NAMES = {
    'openai': 'OpenAI', 'google': 'Google Gemini',
    'anthropic': 'Anthropic', 'deepseek': 'DeepSeek', 'xai': 'xAI',
    'openrouter': 'OpenRouter',
    'together': 'Together AI', 'togetherai': 'Together AI',
    'fireworks': 'Fireworks AI', 'fireworks-ai': 'Fireworks AI',
    'siliconflow': 'SiliconFlow', 'silicon-flow': 'SiliconFlow',
    'novita': 'Novita AI', 'novita-ai': 'Novita AI',
}
PROVIDER_CODES = {
    'OpenAI': 'openai', 'Google Gemini': 'google', 'Anthropic': 'anthropic',
    'DeepSeek': 'deepseek', 'xAI': 'xai', 'OpenRouter': 'openrouter',
    'Together AI': 'together', 'Fireworks AI': 'fireworks',
    'SiliconFlow': 'siliconflow', 'Novita AI': 'novita',
}
OFFICIAL_PROVIDERS = {'OpenAI', 'Google Gemini', 'Anthropic', 'DeepSeek', 'xAI'}
LAB_ALIASES = {
    'openai': 'openai', 'google': 'google', 'google-ai': 'google',
    'anthropic': 'anthropic', 'deepseek': 'deepseek',
    'x-ai': 'xai', 'xai': 'xai',
}
FAMILY_PREFIXES = {
    'GPT': ('gpt-', 'chatgpt-', 'o1', 'o3', 'o4'),
    'Gemini': ('gemini-',), 'Claude': ('claude-',),
    'DeepSeek': ('deepseek-',), 'Grok': ('grok-',),
}


def now_taipei() -> dt.datetime:
    return dt.datetime.now(TZ)


def iso_time(value: dt.datetime | None = None) -> str:
    return (value or now_taipei()).isoformat(timespec='seconds')


def fetch_json(url: str, token: str | None = None) -> object:
    headers = {
        'User-Agent': 'AI-API-Price-Tracker/1.0 (+https://github.com/)',
        'Accept': 'application/json',
    }
    if token:
        headers['Authorization'] = f'Bearer {token}'
    last_error = None
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(request, timeout=35) as response:
                if not (200 <= response.status < 300):
                    raise ValueError(f'HTTP {response.status}')
                raw = response.read(MAX_RESPONSE + 1)
                if len(raw) > MAX_RESPONSE:
                    raise ValueError('Response exceeds 24 MB safety limit')
                return json.loads(raw)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError,
                json.JSONDecodeError, ValueError) as err:
            last_error = err
            if attempt < 2:
                time.sleep(1 + attempt * 2)
    raise RuntimeError(f'{url}: {last_error}')


def price(value: object, *, per_token: bool = False) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        d = decimal.Decimal(str(value))
        if not d.is_finite():
            return None
        if per_token:
            d *= 1_000_000
        # 0 is allowed only when explicitly reported as free.
        if not (0 <= d <= 10000):
            return None
        return round(float(d), 8)
    except (ValueError, TypeError, decimal.InvalidOperation):
        return None


def family_from_id(canonical: str) -> str | None:
    bits = canonical.lower().split('/', 1)
    if len(bits) != 2:
        return None
    lab = LAB_ALIASES.get(bits[0])
    if not lab:
        return None
    fam = FAMILIES[lab]
    if bits[1].startswith(FAMILY_PREFIXES[fam]):
        return fam
    return None


def normalized_id(raw: str, explicit_canonical: str | None = None,
                  provider: str | None = None) -> str | None:
    """Prefer authoritative canonical IDs; never fuzzy-join by display name."""
    for candidate in (explicit_canonical, raw):
        if not isinstance(candidate, str):
            continue
        s = candidate.strip().lower()
        if '/' in s:
            head, tail = s.split('/', 1)
            lab = LAB_ALIASES.get(head)
            if lab and tail and family_from_id(f'{lab}/{tail}'):
                return f'{lab}/{tail}'
    # Only first-party host model identifiers may be prefixed safely.
    if provider in FAMILIES and isinstance(raw, str):
        s = f'{provider}/{raw.lower().strip()}'
        if family_from_id(s):
            return s
    return None


def make_quote(provider: str, canonical: str, model_name: str, input_usd: float,
               output_usd: float, *, source: str, source_url: str,
               collected_at: str, cache_read: float | None = None,
               cache_write: float | None = None) -> dict:
    family = family_from_id(canonical)
    if not family:
        raise ValueError('Unsupported family')
    official_channel = provider in OFFICIAL_PROVIDERS
    return {
        'id': f'{PROVIDER_CODES[provider]}::{canonical}',
        'model_id': canonical, 'model_name': model_name,
        'family': family, 'provider': provider,
        'provider_type': 'official_channel' if official_channel else 'third_party',
        'input_usd_m': input_usd, 'output_usd_m': output_usd,
        'cache_read_usd_m': cache_read, 'cache_write_usd_m': cache_write,
        'source': source, 'source_url': source_url,
        'official_reference': OFFICIAL_PRICING[family],
        'verification': 'provider_api' if source == 'OpenRouter API' else 'community_catalog',
        'last_observed_at': collected_at,
        'status': 'current',
    }


def parse_catalog(payload: object, collected_at: str) -> list[dict]:
    if not isinstance(payload, dict):
        raise ValueError('Models.dev payload is not an object')
    quotes = []
    for provider_id, host in payload.items():
        if not isinstance(host, dict):
            continue
        slug = str(provider_id).lower()
        display = PROVIDER_NAMES.get(slug)
        if display is None:
            # Some catalogs expose naming variations; match their published name
            # against a strictly fixed allowlist, never arbitrary strings.
            host_name = str(host.get('name', '')).lower()
            display = next((n for n in set(PROVIDER_NAMES.values())
                            if host_name == n.lower()), None)
        if display is None:
            continue
        models = host.get('models')
        if not isinstance(models, dict):
            continue
        for model_key, record in models.items():
            if not isinstance(record, dict) or record.get('type') not in (None, 'chat', 'language'):
                continue
            canonical = normalized_id(str(model_key), record.get('canonical_model_id'),
                                      PROVIDER_CODES[display] if display in OFFICIAL_PROVIDERS else None)
            if not canonical:
                continue
            costs = record.get('cost') or {}
            if not isinstance(costs, dict):
                continue
            in_price = price(costs.get('input'))
            out_price = price(costs.get('output'))
            if in_price is None or out_price is None:
                continue
            quotes.append(make_quote(
                display, canonical, str(record.get('name') or model_key),
                in_price, out_price, source='Models.dev（社群彙整）',
                source_url=f'https://models.dev/providers/{slug}/',
                collected_at=collected_at,
                cache_read=price(costs.get('cache_read')),
                cache_write=price(costs.get('cache_write')),
            ))
    return quotes


def parse_openrouter(payload: object, collected_at: str) -> list[dict]:
    if not isinstance(payload, dict) or not isinstance(payload.get('data'), list):
        raise ValueError('OpenRouter response missing data[]')
    rows = []
    for model in payload['data']:
        if not isinstance(model, dict):
            continue
        canonical = normalized_id(str(model.get('id', '')))
        costs = model.get('pricing')
        if not canonical or not isinstance(costs, dict):
            continue
        inp = price(costs.get('prompt'), per_token=True)
        out = price(costs.get('completion'), per_token=True)
        if inp is None or out is None:
            continue
        rows.append(make_quote(
            'OpenRouter', canonical, str(model.get('name') or model['id']),
            inp, out, source='OpenRouter API',
            source_url=f'https://openrouter.ai/{model["id"]}',
            collected_at=collected_at,
            cache_read=price(costs.get('input_cache_read'), per_token=True),
            cache_write=price(costs.get('input_cache_write'), per_token=True),
        ))
    return rows


def load_json(path: Path, default: object) -> object:
    if not path.exists():
        return default
    with path.open(encoding='utf-8') as f:
        return json.load(f)


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.tmp')
    with tmp.open('w', encoding='utf-8', newline='\n') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False)
        f.write('\n')
    tmp.replace(path)


def collect() -> None:
    timestamp = iso_time()
    results: list[dict] = []
    statuses = []
    for name, url, parser, token in [
        ('Models.dev', MODEL_CATALOG, parse_catalog, None),
        ('OpenRouter', OPENROUTER_MODELS, parse_openrouter,
         os.environ.get('OPENROUTER_API_KEY') or None),
    ]:
        try:
            rows = parser(fetch_json(url, token), timestamp)
            if not rows:
                raise ValueError('Source returned zero supported prices')
            results.extend(rows)
            statuses.append({'name': name, 'ok': True, 'count': len(rows)})
        except Exception as exc:
            # Do not log any authentication credentials in the public workflow.
            statuses.append({'name': name, 'ok': False,
                             'error': type(exc).__name__ + ': ' + str(exc)[:160]})
    if not results:
        raise RuntimeError('No usable sources; refusing to replace staging snapshot')
    # Prefer platform's own API to community estimates when IDs overlap.
    by_id = {r['id']: r for r in results}
    for r in results:
        if r['source'] == 'OpenRouter API':
            by_id[r['id']] = r
    rows = sorted(by_id.values(), key=lambda x: (x['family'], x['model_id'], x['provider']))
    snapshot = {'schema_version': 1, 'collected_at': timestamp,
                'sources': statuses, 'quotes': rows}
    write_json(STAGING, snapshot)
    print(f'Collected {len(rows)} prices from {sum(s["ok"] for s in statuses)} sources')


def is_anomaly(old: dict, new: dict) -> bool:
    for side in ('input_usd_m', 'output_usd_m'):
        prev = old.get(side)
        current = new.get(side)
        if not isinstance(prev, (int, float)) or not isinstance(current, (int, float)):
            return True
        if prev > 0 and (current == 0 or current > 5 * prev or current < 0.2 * prev):
            return True
        if prev == 0 and current > 1000:
            return True
    return False


def publish() -> None:
    staged = load_json(STAGING, None)
    if not isinstance(staged, dict) or not isinstance(staged.get('quotes'), list):
        raise RuntimeError('Staging snapshot absent. Run collect before publishing')
    now = now_taipei()
    try:
        staged_at = dt.datetime.fromisoformat(staged['collected_at'])
    except (KeyError, ValueError, TypeError):
        raise RuntimeError('Staging snapshot has no valid collection time')
    if (staged_at.tzinfo is None or staged_at.astimezone(TZ).date() != now.date()
            or not dt.timedelta(0) <= now - staged_at <= dt.timedelta(hours=12)):
        raise RuntimeError('Staging snapshot is stale; refusing to publish')
    published = load_json(PUBLISHED, {})
    prior = {x['id']: x for x in published.get('quotes', []) if isinstance(x, dict) and 'id' in x}
    merged = {k: dict(v, status='stale') for k, v in prior.items()}
    anomalies = []
    changes = []
    for quote in staged['quotes']:
        if not isinstance(quote, dict) or not isinstance(quote.get('id'), str):
            continue
        key = quote['id']
        existing = prior.get(key)
        if existing and is_anomaly(existing, quote):
            # No manual approval is necessary: a large jump is quarantined on
            # first sight, then accepted after a second matching daily fetch.
            pending = existing.get('pending_price') or {}
            same_candidate = (pending.get('input') == quote['input_usd_m']
                              and pending.get('output') == quote['output_usd_m'])
            first_seen = pending.get('first_seen_date') if same_candidate else None
            if not first_seen or first_seen >= now.date().isoformat():
                merged[key] = dict(existing, status='anomaly_hold',
                                   pending_price={
                                       'input': quote['input_usd_m'],
                                       'output': quote['output_usd_m'],
                                       'first_seen_date': first_seen or now.date().isoformat(),
                                   })
                anomalies.append({'id': key, 'previous_input': existing['input_usd_m'],
                                  'proposed_input': quote['input_usd_m'],
                                  'previous_output': existing['output_usd_m'],
                                  'proposed_output': quote['output_usd_m']})
                continue
        merged[key] = quote
        if not existing or any(existing.get(k) != quote[k]
                               for k in ('input_usd_m', 'output_usd_m')):
            changes.append({'id': key, 'at': iso_time(now),
                            'input_usd_m': quote['input_usd_m'],
                            'output_usd_m': quote['output_usd_m']})
    if not merged:
        raise RuntimeError('Refusing to publish empty model catalog')
    history = load_json(HISTORY, {'schema_version': 1, 'events': []})
    stored = history.get('events', [])
    cutoff = now - dt.timedelta(days=180)
    valid_events = []
    for event in stored + changes:
        try:
            at = dt.datetime.fromisoformat(event['at'])
            if at.tzinfo and at >= cutoff:
                valid_events.append(event)
        except (KeyError, ValueError, TypeError):
            continue
    # Preserve change-only series, bounded to avoid unbounded repository growth.
    valid_events = valid_events[-60_000:]
    write_json(HISTORY, {'schema_version': 1, 'events': valid_events})
    write_json(PUBLISHED, {
        'schema_version': 1, 'published_at': iso_time(now),
        'collected_at': staged['collected_at'],
        'sources': staged['sources'],
        'anomalies': anomalies,
        'quotes': sorted(merged.values(), key=lambda x: (x['family'], x['model_id'], x['provider'])),
    })
    print(f'Published {len(merged)} prices; {len(changes)} changes; {len(anomalies)} held anomalies')


def main() -> None:
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('command', choices=('collect', 'publish', 'full'))
    args = cli.parse_args()
    if args.command in ('collect', 'full'):
        collect()
    if args.command in ('publish', 'full'):
        publish()


if __name__ == '__main__':
    main()
