import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts import prices

NOW = prices.iso_time()


class PriceParserTests(unittest.TestCase):
    def test_price_units_and_reject_nonfinite(self):
        self.assertEqual(prices.price('0.00000125', per_token=True), 1.25)
        self.assertEqual(prices.price('3.2'), 3.2)
        self.assertEqual(prices.price('NaN'), None)
        self.assertEqual(prices.price('-5'), None)
        self.assertEqual(prices.price('Infinity'), None)

    def test_context_window_value_validation(self):
        self.assertEqual(prices.token_limit(131072), 131072)
        self.assertEqual(prices.token_limit(200000), 200000)
        self.assertIsNone(prices.token_limit(None))
        self.assertIsNone(prices.token_limit(0))
        self.assertIsNone(prices.token_limit(-1))
        self.assertIsNone(prices.token_limit(True))
        self.assertIsNone(prices.token_limit(0.5))
        self.assertIsNone(prices.token_limit(10**12))

    def test_strict_canonical_model(self):
        self.assertEqual(prices.normalized_id('x-ai/grok-4'), 'xai/grok-4')
        self.assertEqual(prices.normalized_id('gpt-5', provider='openai'), 'openai/gpt-5')
        self.assertIsNone(prices.normalized_id('other/gpt-5'))
        self.assertIsNone(prices.normalized_id('together/gpt-5'))
        self.assertIsNone(prices.normalized_id('random/insecure-model'))

    def test_catalog_parser_limits_sources(self):
        sample = {
            'openai': {'name':'OpenAI','models':{
                'gpt-5':{'name':'GPT-5','limit':{'context':128000,'input':100000,'output':16384},'cost':{'input':1.25,'output':10}},
                'audio-model':{'cost':{'input':1.5,'output':2}},
            }},
            'openrouter': {'name':'OpenRouter','models':{
                'openai/gpt-5':{'canonical_model_id':'openai/gpt-5','cost':{'input':2,'output':11}},
            }},
            'not-allowed': {'name':'Bad Provider','models':{
                'openai/gpt-5':{'cost':{'input':0,'output':1}},
            }},
        }
        quotes = prices.parse_catalog(sample, NOW)
        self.assertEqual(len(quotes), 2)
        official = [q for q in quotes if q['provider'] == 'OpenAI'][0]
        self.assertEqual(official['model_id'], 'openai/gpt-5')
        self.assertEqual(official['provider_type'], 'official_channel')
        self.assertEqual(official['verification'], 'community_catalog')
        self.assertEqual(official['context_window_tokens'], 128000)
        self.assertEqual(official['max_output_tokens'], 16384)
        self.assertIsNone(next(q for q in quotes if q['provider']=='OpenRouter')['context_window_tokens'])

    def test_openrouter_unit_conversion(self):
        sample = {'data':[
            {'id':'anthropic/claude-sonnet-4','name':'Claude Sonnet',
             'context_length':200000, 'top_provider':{'context_length':131072,'max_completion_tokens':16384},
             'pricing':{
                'prompt':'0.000003','completion':'0.000015'}},
            {'id':'openai/gpt-free','name':'Free','pricing':{
                'prompt':'0','completion':'0'}},
            {'id':'other/not-target','pricing':{'prompt':'1','completion':'1'}},
        ]}
        rows = prices.parse_openrouter(sample, NOW)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]['input_usd_m'],3.0)
        self.assertEqual(rows[0]['output_usd_m'],15.0)
        self.assertEqual(rows[0]['verification'],'provider_api')
        self.assertEqual(rows[0]['context_window_tokens'],131072)
        self.assertEqual(rows[0]['max_output_tokens'],16384)
        self.assertIsNone(rows[1]['context_window_tokens'])
        self.assertEqual(rows[1]['input_usd_m'],0)

    def test_abnormal_changes(self):
        old = {'input_usd_m':1.0,'output_usd_m':5.0}
        self.assertTrue(prices.is_anomaly(old,{'input_usd_m':0,'output_usd_m':5.0}))
        self.assertFalse(prices.is_anomaly(old,{'input_usd_m':0.75,'output_usd_m':4.0}))
        self.assertTrue(prices.is_anomaly(old,{'input_usd_m':10,'output_usd_m':5.0}))


class PublishTests(unittest.TestCase):
    def test_publish_retains_valid_previous_and_records_changes(self):
        with tempfile.TemporaryDirectory() as t:
            base = Path(t)
            stage = base/'data'/'staging.json'
            pub = base/'site'/'data'/'prices.json'
            hist = base/'site'/'data'/'history.json'
            original = prices.make_quote('OpenAI','openai/gpt-5','GPT-5',1.0,5.0,
                source='Models.dev（社群彙整）', source_url='https://models.dev', collected_at=NOW)
            new = dict(original, input_usd_m=1.2, output_usd_m=4.5,
                       context_window_tokens=128000,max_output_tokens=16384)
            prices.write_json(pub,{'quotes':[original]})
            prices.write_json(stage, {'collected_at':prices.iso_time(),'quotes':[new],
                                      'sources':[{'name':'Models.dev','ok':True,'count':1}]})
            with patch.object(prices,'STAGING',stage),patch.object(prices,'PUBLISHED',pub),patch.object(prices,'HISTORY',hist):
                prices.publish()
            result = json.loads(pub.read_text('utf-8'))
            self.assertEqual(result['quotes'][0]['input_usd_m'],1.2)
            self.assertEqual(result['quotes'][0]['context_window_tokens'],128000)
            self.assertEqual(len(json.loads(hist.read_text('utf-8'))['events']),1)
            prices.write_json(stage, {'collected_at':prices.iso_time(),
                                      'quotes':[dict(original, input_usd_m=0.01)],
                                      'sources':[{'name':'Models.dev','ok':True}]})
            with patch.object(prices,'STAGING',stage),patch.object(prices,'PUBLISHED',pub),patch.object(prices,'HISTORY',hist):
                prices.publish()
            result = json.loads(pub.read_text('utf-8'))
            self.assertEqual(result['quotes'][0]['input_usd_m'],1.2)
            self.assertEqual(result['quotes'][0]['status'],'anomaly_hold')
            self.assertEqual(len(result['anomalies']),1)

    def test_reject_old_staging(self):
        with tempfile.TemporaryDirectory() as t:
            path = Path(t)/'staging.json'
            old = (prices.now_taipei() - dt.timedelta(days=3)).isoformat()
            prices.write_json(path,{'collected_at':old,'quotes':[{'id':'a'}]})
            with patch.object(prices,'STAGING',path):
                with self.assertRaisesRegex(RuntimeError,'stale'):
                    prices.publish()


if __name__ == '__main__':
    unittest.main()
