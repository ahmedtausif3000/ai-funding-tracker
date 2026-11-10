#!/usr/bin/env node
// Recall check: compare a Crunchbase "Funding Rounds" CSV export against data/rounds.json.
// Usage: node scripts/compare-crunchbase.mjs <export.csv> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--out report.md]
// Prints caught-in-view / caught-out-of-view / missed, and for misses whether the company ever reached candidates.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenSimilarity } from './lib/text.mjs';

const argv = process.argv.slice(2);
const csvPath = argv.find((a) => !a.startsWith('--'));
const args = Object.fromEntries(argv.map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : []).filter(Boolean));
if (!csvPath) { console.error('usage: compare-crunchbase.mjs <export.csv> [--from] [--to] [--out]'); process.exit(1); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseCSV(t) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const raw = parseCSV(fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, ''));
const hdr = raw[0];
const cb = raw.slice(1).filter((r) => r.length > 5).map((r) => Object.fromEntries(hdr.map((h, i) => [h, r[i]])));
const dates = cb.map((r) => r['Announced Date']).filter(Boolean).sort();
const from = args.from || dates[0], to = args.to || dates[dates.length - 1];
const truth = cb.filter((r) => r['Announced Date'] >= from && r['Announced Date'] <= to);

const store = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'rounds.json'), 'utf8')).rounds;
const domain = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
const rawName = (n) => String(n || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const days = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400e3;

// candidate corpus across runs (to tell "never fetched" from "fetched but not extracted")
const cands = [];
const runsDir = path.join(ROOT, 'data', 'runs');
for (const d of fs.existsSync(runsDir) ? fs.readdirSync(runsDir) : []) {
  const p = path.join(runsDir, d, 'candidates.json');
  if (!fs.existsSync(p)) continue;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const byId = new Map((j.candidates || []).map((c) => [c.id, c]));
  for (const g of j.groups || []) {
    const items = (g.candidate_ids || []).map((id) => byId.get(id)).filter(Boolean);
    cands.push({ run: d, company: g.company_guess, amount: g.amount_hint_usd, titles: items.map((i) => i.title), text_status: items.map((i) => i.text_status) });
  }
}

const out = { caught_in_view: [], caught_out_of_view: [], missed: [] };
for (const t of truth) {
  const name = t['Organization Name'], dom = domain(t['Organization Website']), amt = Number(t['Money Raised (in USD)']);
  const acronym = name.split(/\s+/).length >= 3 ? name.split(/\s+/).map((w) => w[0]).join('').toLowerCase() : null; // "Air Space Intelligence" -> "asi"
  const matches = store.filter((x) => {
    const nameOk = tokenSimilarity(x.company, name) >= 0.8 || rawName(x.company) === rawName(name) || (x.website && dom && domain(x.website) === dom) || (acronym && rawName(x.company) === acronym);
    return nameOk && days(x.announced_date, t['Announced Date']) <= 30;
  });
  // prefer same amount (within 15%), then in_view
  matches.sort((a, b) => {
    const ca = a.amount_usd && Math.abs(a.amount_usd - amt) / Math.max(a.amount_usd, amt) < 0.15 ? 0 : 1;
    const cbb = b.amount_usd && Math.abs(b.amount_usd - amt) / Math.max(b.amount_usd, amt) < 0.15 ? 0 : 1;
    return ca - cbb || (b.in_view ? 1 : 0) - (a.in_view ? 1 : 0);
  });
  const rec = { date: t['Announced Date'], type: t['Funding Type'], amount_m: Math.round(amt / 1e6), company: name, lead: t['Lead Investors'] };
  if (matches.length) {
    const m = matches[0];
    rec.sweep = { id: m.id, company: m.company, date: m.announced_date, round_type: m.round_type, amount_m: m.amount_usd ? Math.round(m.amount_usd / 1e6) : null, hq: m.hq_country, ai: m.is_ai_ml, exclude: m.exclude_reason || null, confidence: m.confidence, in_view: m.in_view };
    rec.why_out = m.in_view ? null : m.exclude_reason || (m.hq_country !== 'US' ? `hq=${m.hq_country}` : !m.is_ai_ml ? 'is_ai_ml=false' : m.amount_usd == null ? 'undisclosed' : m.amount_usd < 15e6 ? 'below-min' : `stage=${m.stage_bucket}`);
    (m.in_view ? out.caught_in_view : out.caught_out_of_view).push(rec);
  } else {
    const c = cands.filter((g) => tokenSimilarity(g.company || '', name) >= 0.8 || rawName(g.company || '') === rawName(name) || g.titles.some((x) => x.toLowerCase().includes(name.toLowerCase())));
    rec.candidates = c.map((g) => `${g.run}: ${g.company} $${g.amount ? Math.round(g.amount / 1e6) : '?'}M [${g.text_status.join(',')}] ${g.titles[0] || ''}`);
    rec.stage = c.length ? 'fetched-not-extracted' : 'never-in-candidates';
    out.missed.push(rec);
  }
}
const n = truth.length, a = out.caught_in_view.length, b = out.caught_out_of_view.length, c = out.missed.length;
const pct = (x) => `${Math.round((x / Math.max(n, 1)) * 100)}%`;
const lines = [];
lines.push(`# Crunchbase recall check: ${path.basename(csvPath)} (${from} to ${to})`, '');
lines.push(`| | Count | Share |`, `|---|---|---|`, `| Crunchbase rows in window | ${n} | |`, `| Caught, in view | ${a} | ${pct(a)} |`, `| Caught, out of view | ${b} | ${pct(b)} |`, `| Missed | ${c} | ${pct(c)} |`, '');
lines.push('## Caught but out of view', '');
for (const r of out.caught_out_of_view) lines.push(`- ${r.date} ${r.type} $${r.amount_m}M **${r.company}** -> stored as ${r.sweep.company} $${r.sweep.amount_m}M (${r.sweep.round_type}); out because ${r.why_out}; id ${r.sweep.id}`);
lines.push('', '## Missed', '');
for (const r of out.missed) { lines.push(`- ${r.date} ${r.type} $${r.amount_m}M **${r.company}** (lead: ${r.lead || 'n/a'}) — ${r.stage}`); for (const x of r.candidates) lines.push(`  - ${x}`); }
lines.push('', '## Caught in view', '');
for (const r of out.caught_in_view) lines.push(`- ${r.date} ${r.type} $${r.amount_m}M ${r.company} -> ${r.sweep.company} $${r.sweep.amount_m}M (${r.sweep.round_type}, conf ${r.sweep.confidence})`);
const md = lines.join('\n') + '\n';
if (args.out) { fs.writeFileSync(args.out, md); console.error(`wrote ${args.out}`); }
console.log(JSON.stringify({ window: [from, to], truth: n, caught_in_view: a, caught_out_of_view: b, missed: c, recall_in_view: a / Math.max(n, 1), recall_any: (a + b) / Math.max(n, 1) }));
if (!args.out) process.stdout.write(md);
