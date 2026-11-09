#!/usr/bin/env node
// Stage 4: dedupe validated rows into the growing record data/rounds.json; mark the in-scope view.
// Usage: node scripts/merge-rounds.mjs [--date YYYY-MM-DD]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { normalizeName, tokenSimilarity, isoDate } from './lib/text.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : []).filter(Boolean));
const RUN_DATE = args.date || isoDate();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUN_DIR = path.join(ROOT, 'data', 'runs', RUN_DATE);
const readJson = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } };

export const SCOPE = { min_amount_usd: 15_000_000, countries: ['US'], buckets: ['Seed', 'Early Stage Venture', 'Late Stage Venture'] };
export function inScope(r) {
  return r.hq_country === 'US' && r.is_ai_ml === true && typeof r.amount_usd === 'number' && r.amount_usd >= SCOPE.min_amount_usd && SCOPE.buckets.includes(r.stage_bucket) && !r.exclude_reason;
}
const uniq = (arr) => { const seen = new Set(); return arr.filter((x) => { const k = normalizeName(x); if (!k || seen.has(k)) return false; seen.add(k); return true; }); };
const amountClose = (a, b) => a == null || b == null || Math.abs(a - b) / Math.max(a, b) < 0.1;
const daysApart = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400e3;

const store = readJson(path.join(ROOT, 'data', 'rounds.json'), { version: 1, updated_at: null, rounds: [] });
const validated = readJson(path.join(RUN_DIR, 'validated.json'), null);
if (!validated) { console.error('no validated.json for', RUN_DATE); process.exit(1); }
const cands = readJson(path.join(RUN_DIR, 'candidates.json'), { candidates: [] });
const seenPath = path.join(ROOT, 'data', 'seen-urls.json');
const seen = new Set(readJson(seenPath, []));
const mergeLog = [];
let inserted = 0, merged = 0, excluded = 0;

for (const r of validated.rows) {
  let match = store.rounds.find((x) => tokenSimilarity(x.company, r.company) >= 0.85 && amountClose(x.amount_usd, r.amount_usd) && daysApart(x.announced_date, r.announced_date) <= 21);
  const now = new Date().toISOString();
  // Same company, same window, materially different amount: treat as the same round and keep the better-sourced figure.
  if (!match) {
    const compatible = (a, b) => a === b || a === 'Venture - Unspecified' || b === 'Venture - Unspecified';
    const rawName = (n) => String(n || '').toLowerCase().replace(/\b(inc|corp|corporation|llc|ltd|limited|co)\b\.?/g, '').replace(/[^a-z0-9]/g, '');
    const sameArticle = (x) => (x.candidate_ids || []).some((id) => (r.candidate_ids || []).includes(id));
    const alt = !r.exclude_reason && store.rounds.find((x) => rawName(x.company) === rawName(r.company) && !sameArticle(x) && daysApart(x.announced_date, r.announced_date) <= 21 && compatible(x.round_type, r.round_type) && x.round_type !== 'Debt' && r.round_type !== 'Debt' && !x.exclude_reason);
    if (alt && r.amount_usd != null) {
      const pressWire = (urls) => (urls || []).some((u) => /prnewswire|businesswire|globenewswire|newswire|accesswire/i.test(u));
      const newBetter = pressWire(r.source_urls) && !pressWire(alt.source_urls) || ((r.confidence ?? 0) > (alt.confidence ?? 0) + 0.15);
      mergeLog.push({ run: RUN_DATE, action: newBetter ? 'amount-corrected' : 'amount-conflict', id: alt.id, company: alt.company, stored_amount: alt.amount_usd, incoming_amount: r.amount_usd, incoming_sources: r.source_urls });
      alt.alt_amounts = [...new Set([...(alt.alt_amounts || []), newBetter ? alt.amount_usd : r.amount_usd].filter((v) => v != null))];
      if (newBetter) { alt.amount_usd = r.amount_usd; alt.amount_disclosed = true; if (r.round_type !== 'Venture - Unspecified') { alt.round_type = r.round_type; alt.stage_bucket = r.stage_bucket; } alt.transaction_name = `${alt.round_type} - ${alt.company}`; }
      match = alt;
    }
  }
  if (match) {
    const before = JSON.stringify(match);
    match.investors = uniq([...(match.investors || []), ...(r.investors || [])]);
    match.lead_investors = uniq([...(match.lead_investors || []), ...(r.lead_investors || [])]);
    match.source_urls = uniq([...(match.source_urls || []), ...(r.source_urls || [])].map((u) => u)).length ? [...new Set([...(match.source_urls || []), ...(r.source_urls || [])])] : match.source_urls;
    for (const k of ['website', 'hq_city', 'hq_state', 'description', 'currency_note']) if (!match[k] && r[k]) match[k] = r[k];
    if (match.amount_usd == null && r.amount_usd != null) { match.amount_usd = r.amount_usd; match.amount_disclosed = true; }
    if (match.round_type === 'Venture - Unspecified' && r.round_type !== 'Venture - Unspecified') { match.round_type = r.round_type; match.stage_bucket = r.stage_bucket; }
    if (Date.parse(r.announced_date) < Date.parse(match.announced_date)) match.announced_date = r.announced_date;
    if (match.hq_country === 'unknown' && r.hq_country !== 'unknown') match.hq_country = r.hq_country;
    if (r.is_ai_ml && !match.is_ai_ml && (r.confidence ?? 0) >= (match.confidence ?? 0)) { match.is_ai_ml = true; match.ai_ml_rationale = r.ai_ml_rationale || match.ai_ml_rationale; }
    match.confidence = Math.max(match.confidence ?? 0, r.confidence ?? 0);
    match.runs = [...new Set([...(match.runs || []), RUN_DATE])];
    match.updated_at = now;
    match.in_view = inScope(match);
    if (before !== JSON.stringify(match)) { merged++; mergeLog.push({ run: RUN_DATE, action: 'merged', id: match.id, company: match.company, from: r.company }); }
  } else {
    const id = crypto.createHash('sha1').update(`${normalizeName(r.company)}|${r.amount_usd}|${r.announced_date}`).digest('hex').slice(0, 10);
    const row = { id, ...r, investors: uniq(r.investors || []), lead_investors: uniq(r.lead_investors || []), transaction_name: `${r.round_type} - ${r.company}`, first_seen_run: RUN_DATE, runs: [RUN_DATE], created_at: now, updated_at: now };
    row.in_view = inScope(row);
    store.rounds.push(row); inserted++;
    if (!row.in_view) excluded++;
    mergeLog.push({ run: RUN_DATE, action: 'inserted', id, company: r.company, in_view: row.in_view, exclude_reason: r.exclude_reason || (!row.in_view ? (r.hq_country !== 'US' ? 'non-us' : !r.is_ai_ml ? 'not-ai' : r.amount_usd == null ? 'undisclosed' : r.amount_usd < SCOPE.min_amount_usd ? 'below-min' : 'stage') : null) });
  }
}
store.rounds.sort((a, b) => (b.announced_date.localeCompare(a.announced_date)) || ((b.amount_usd || 0) - (a.amount_usd || 0)));
store.updated_at = new Date().toISOString();
store.last_run = RUN_DATE;
fs.writeFileSync(path.join(ROOT, 'data', 'rounds.json'), JSON.stringify(store, null, 1));
for (const c of cands.candidates) seen.add(c.link);
fs.writeFileSync(seenPath, JSON.stringify([...seen].slice(-20000)));
fs.appendFileSync(path.join(ROOT, 'data', 'merge-log.ndjson'), mergeLog.map((m) => JSON.stringify(m)).join('\n') + (mergeLog.length ? '\n' : ''));
const summary = { run_date: RUN_DATE, inserted, merged, excluded_on_insert: excluded, total_rounds: store.rounds.length, in_view: store.rounds.filter((r) => r.in_view).length };
fs.writeFileSync(path.join(RUN_DIR, 'merge-summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
