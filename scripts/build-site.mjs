#!/usr/bin/env node
// Stage 5: publish data for the static page in docs/ (served by GitHub Pages).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } };
const store = readJson(path.join(ROOT, 'data', 'rounds.json'), { rounds: [] });
const runsDir = path.join(ROOT, 'data', 'runs');
const runs = fs.existsSync(runsDir) ? fs.readdirSync(runsDir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort() : [];
const runSummaries = runs.map((d) => ({ run_date: d, ...readJson(path.join(runsDir, d, 'merge-summary.json'), {}), fetch: readJson(path.join(runsDir, d, 'candidates.json'), { stats: null }).stats }));
const inView = store.rounds.filter((r) => r.in_view);
const weekAgo = Date.now() - 7 * 86400e3;
const week = inView.filter((r) => Date.parse(r.announced_date) >= weekAgo);
const meta = {
  generated_at: new Date().toISOString(), last_run: store.last_run || null, total_rounds: store.rounds.length, in_view: inView.length,
  week: { count: week.length, total_usd: week.reduce((s, r) => s + (r.amount_usd || 0), 0), largest: week[0] ? { company: week[0].company, amount_usd: week[0].amount_usd } : null },
  scope: { min_amount_usd: 15_000_000, country: 'US', industries: 'AI / ML', stages: ['Seed', 'Early Stage Venture', 'Late Stage Venture'] },
  runs: runSummaries.slice(-30),
};
fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs', 'rounds.json'), JSON.stringify({ updated_at: store.updated_at, rounds: store.rounds }));
fs.writeFileSync(path.join(ROOT, 'docs', 'meta.json'), JSON.stringify(meta, null, 2));
// CSV export for spreadsheets
const cols = ['transaction_name', 'company', 'amount_usd', 'announced_date', 'round_type', 'stage_bucket', 'lead_investors', 'investors', 'hq_city', 'hq_state', 'hq_country', 'is_ai_ml', 'description', 'website', 'source_urls', 'in_view', 'first_seen_run'];
const esc = (v) => { const s = Array.isArray(v) ? v.join('; ') : v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
fs.writeFileSync(path.join(ROOT, 'docs', 'rounds.csv'), [cols.join(','), ...store.rounds.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n'));
console.log(JSON.stringify({ in_view: inView.length, total: store.rounds.length, week: meta.week }));
