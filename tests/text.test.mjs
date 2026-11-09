import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, headlineCompany, normalizeName, tokenSimilarity, htmlToText } from '../scripts/lib/text.mjs';

test('parseAmount handles $, millions, billions and other currencies', () => {
  assert.equal(parseAmount('Coframe Raises $35 Million to Build').amount, 35e6);
  assert.equal(parseAmount('geniosAI Raises $19.1M in Combined Seed').amount, 19.1e6);
  assert.equal(parseAmount('Zipline Raises $1.5B at $21.5B Valuation').amount, 1.5e9);
  assert.equal(parseAmount('Hypersonica Raises €100M').currency, 'EUR');
  assert.equal(parseAmount('Future Secure AI Pulls In US$82 Million').amount, 82e6);
  assert.equal(parseAmount('no money here'), null);
});

test('headlineCompany pulls the company out of a headline', () => {
  assert.equal(headlineCompany('Shield AI Raises $1 Billion in Series H Funding - entARABI'), 'Shield AI');
  assert.equal(headlineCompany('Sentra raises $150 mn in Series C led by Capital One Ventures'), 'Sentra');
  assert.equal(headlineCompany('Exclusive: Spines, a hybrid publisher, raises $64 million'), 'Spines');
});

test('normalizeName and tokenSimilarity match the same company across spellings', () => {
  assert.equal(normalizeName('Shield AI, Inc.'), 'shield');
  assert.ok(tokenSimilarity('Shield AI', 'Shield AI Inc') >= 0.85);
  assert.ok(tokenSimilarity('Coframe', 'Traversal') < 0.5);
});

test('htmlToText strips scripts and tags', () => {
  assert.equal(htmlToText('<p>Hi <b>there</b></p><script>x()</script>'), 'Hi there');
});
