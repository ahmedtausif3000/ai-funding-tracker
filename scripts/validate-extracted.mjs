#!/usr/bin/env node
// Stage 3: validate extracted.json against the contract and the source text. Writes validated.json.
// Usage: node scripts/validate-extracted.mjs [--date YYYY-MM-DD]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isoDate } from './lib/text.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : []).filter(Boolean));
const RUN_DATE = args.date || isoDate();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUN_DIR = path.join(ROOT, 'data', 'runs', RUN_DATE);
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const cands = readJson(path.join(RUN_DIR, 'candidates.json'));
const extracted = readJson(path.join(RUN_DIR, 'extracted.json'));
const byId = new Map(cands.candidates.map((c) => [c.id, c]));

const ROUND_TYPES = new Set(['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Series C', 'Series D', 'Series E', 'Series F', 'Series G', 'Series H', 'Growth', 'Venture - Unspecified', 'Debt', 'Grant', 'Other']);
const BUCKETS = new Set(['Seed', 'Early Stage Venture', 'Late Stage Venture', 'Other']);
const norm = (s) => String(s || '').toLowerCase().replace(/[‘’'"`’]/g, '').replace(/\s+/g, ' ');

const problems = [];
const rows = [];
for (const [i, r] of (extracted.rows || []).entries()) {
  const where = `row ${i} (${r.company || '?'})`;
  const errs = [];
  if (!r.company || typeof r.company !== 'string') errs.push('company missing');
  if (!Array.isArray(r.candidate_ids) || !r.candidate_ids.length) errs.push('candidate_ids missing');
  if (r.amount_usd !== null && (typeof r.amount_usd !== 'number' || r.amount_usd < 0 || r.amount_usd > 1e12)) errs.push('amount_usd not a sane number');
  if (!ROUND_TYPES.has(r.round_type)) errs.push(`round_type invalid: ${r.round_type}`);
  if (!BUCKETS.has(r.stage_bucket)) errs.push(`stage_bucket invalid: ${r.stage_bucket}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.announced_date || '')) errs.push('announced_date not YYYY-MM-DD');
  else {
    const t = Date.parse(r.announced_date);
    if (t > Date.now() + 2 * 86400e3) errs.push('announced_date in the future');
    if (t < Date.now() - 120 * 86400e3) errs.push('announced_date older than 120 days');
  }
  if (typeof r.is_ai_ml !== 'boolean') errs.push('is_ai_ml not boolean');
  if (typeof r.hq_country !== 'string') errs.push('hq_country missing');
  if (!Array.isArray(r.lead_investors) || !Array.isArray(r.investors)) errs.push('investor arrays missing');
  if (errs.length) { problems.push({ where, errors: errs, action: 'rejected' }); continue; }

  // evidence check against source text
  const corpus = norm(r.candidate_ids.map((id) => { const c = byId.get(id); return c ? `${c.title}\n${c.snippet}\n${c.text || ''}` : ''; }).join('\n'));
  const supported = (name) => {
    const n = norm(name);
    if (!n) return false;
    if (corpus.includes(n)) return true;
    const first = n.split(' ').filter((w) => w.length > 2).slice(0, 2).join(' ');
    return first && corpus.includes(first);
  };
  const webLookup = Array.isArray(r.source_urls) && r.source_urls.some((u) => !r.candidate_ids.some((id) => (byId.get(id)?.resolved_url || byId.get(id)?.link) === u));
  const dropped = [];
  if (!webLookup) {
    r.investors = r.investors.filter((n) => supported(n) || dropped.push(n) === -1);
    r.lead_investors = r.lead_investors.filter((n) => supported(n) || dropped.push(n) === -1);
  }
  for (const l of r.lead_investors) if (!r.investors.some((x) => norm(x) === norm(l))) r.investors.unshift(l);
  if (dropped.length) problems.push({ where, errors: [`investor names not found in source text: ${dropped.join('; ')}`], action: 'names dropped' });
  if (r.amount_usd && r.evidence?.amount && !corpus.includes(norm(r.evidence.amount)) && !webLookup) problems.push({ where, errors: ['evidence.amount span not found in source text'], action: 'kept, confidence lowered' }), (r.confidence = Math.min(r.confidence ?? 0.5, 0.5));
  rows.push(r);
}

const out = { run_date: RUN_DATE, validated_at: new Date().toISOString(), rows, problems, counts: { input: (extracted.rows || []).length, accepted: rows.length, rejected: problems.filter((p) => p.action === 'rejected').length } };
fs.writeFileSync(path.join(RUN_DIR, 'validated.json'), JSON.stringify(out, null, 2));
for (const p of problems) console.error(`[validate] ${p.action}: ${p.where}: ${p.errors.join('; ')}`);
console.log(JSON.stringify(out.counts));
if (out.counts.rejected) process.exitCode = 2;
