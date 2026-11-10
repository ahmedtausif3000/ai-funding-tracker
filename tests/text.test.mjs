import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, headlineCompany, normalizeName, tokenSimilarity, htmlToText, FUNDING_CTX_RE, FUNDING_VERB_RE, ROUND_CTX_RE, AI_HINT_RE } from '../scripts/lib/text.mjs';

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

test('prefilter regexes accept bare-dollar headlines and drone/unmanned companies', () => {
  const t1 = 'Exclusive: Corridian raises $38M to build underwater "stealth logistics"';
  assert.ok(FUNDING_VERB_RE.test(t1) && FUNDING_CTX_RE.test(t1), 'bare $38M must count as funding context');
  assert.ok(AI_HINT_RE.test('Corridian Raises $38M Seed to Build Ultra-Large Underwater Drones'));
  assert.ok(AI_HINT_RE.test('Boston startup raises $38 million for its ultra-large Autonomous Underwater Vehicles'));
  assert.ok(!FUNDING_CTX_RE.test('Castelion gets green light to work Blackbeard missile onto F-16'));
});

test('prefilter and headline parsing cover Crunchbase-style rounds that never say AI', () => {
  // verbs seen in misses from the Oct 2026 recall check
  for (const t of ['Sirona Medical reels in $40m for cloud-based radiology platform', 'Sunlight AI Launches with $17.4M to Help Physicians', 'Patrick Soon-Shiong bets $50m on Prolific Machines', 'Wilson Sonsini Advises Prolific Machines on $50 Million Series B2 Financing']) {
    assert.ok(FUNDING_VERB_RE.test(t), `verb: ${t}`);
  }
  assert.ok(FUNDING_CTX_RE.test('Series B2 Financing'));
  assert.ok(ROUND_CTX_RE.test('Spines: $64 Million Growth Financing As AI Publishing Platform Reaches'));
  assert.equal(headlineCompany('Startup Abby Care raises $82 million to turn family members into paid caregivers - Fortune'), 'Abby Care');
  assert.equal(headlineCompany('Pasadena Quantum Startup Oratomic Raises $475 Million, Reaching $5.4 Billion Valuation'), 'Oratomic');
  assert.equal(headlineCompany('Sunbound Acquires Richter Healthcare Consultants, Raises $24M Series A Led by TTV Capital'), 'Sunbound');
  assert.equal(headlineCompany('Spines: $64 Million Growth Financing As AI Publishing Platform Reaches Scale'), 'Spines');
  assert.equal(headlineCompany('Prism Data Secures $20M Series A to Scale AI-Powered Cash Flow Underwriting'), 'Prism Data');
});
