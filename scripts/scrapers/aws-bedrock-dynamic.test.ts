import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBedrockTables } from './aws-bedrock-dynamic';

const H = (g: string) => [`${g} models`, 'Price per 1M input tokens', 'Price per 1M output tokens'];

test('Bedrock: current per-provider tables, first (default-region) table wins', () => {
  const prices = parseBedrockTables([
    [['Cohere models', 'Price per 1,000 queries**'], ['Rerank 3.5', '$2.00']],
    [H('DeepSeek'), ['DeepSeek v3.2', '$ 0.62', '$ 1.85']],
    [H('Mistral'), ['Devstral 2 123B', '$ 0.40', '$ 2.00'], ['Mistral Large 3', '$ 0.50', '$ 1.50']],
    [H('Mistral'), ['Mistral Large 3', '$ 0.59', '$ 1.76']],
    [['Inference option', 'Input', 'Output', 'Cache read'], ['Global CRIS', '$3.00', '$15.00', '$0.30']],
  ]);
  assert.deepEqual(prices.map((p) => [p.modelName, p.inputPricePer1M, p.outputPricePer1M]), [['mistral-large-3', 0.5, 1.5]]);
});

test('Bedrock: legacy Provider / Model Name layout still parses', () => {
  const prices = parseBedrockTables([[
    ['Provider', 'Model Name', 'Price per 1M input tokens', 'Price per 1M output tokens'],
    ['Anthropic', 'Claude 3.5 Haiku', '$0.80', '$4.00'],
    ['Meta', 'Llama 3', '$0.30', '$0.60'],
  ]]);
  assert.deepEqual(prices.map((p) => p.modelName), ['claude-3.5-haiku']);
});

test('Bedrock: no supported rows -> empty (scraper reports failure)', () => {
  assert.equal(parseBedrockTables([[H('Kimi'), ['Kimi K2.5', '$ 0.60', '$ 3.00']]]).length, 0);
});
