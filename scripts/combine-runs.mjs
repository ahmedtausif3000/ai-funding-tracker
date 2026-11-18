#!/usr/bin/env node
// Catch-up helper: union several pending run folders into one, so overlapping daily fetches are extracted once.
// Dedupes candidates by id, regroups same-round coverage, drops groups that match a stored round, writes
// data/runs/<label>/candidates.json + parts/, and marks each source folder as superseded (merge-summary.json).
// Usage: node scripts/combine-runs.mjs [--runs a,b,c] [--date label] [--max-groups 600]
//        With no --runs, combines every pending run (see pending-runs.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeName, tokenSimilarity } from './lib/text.mjs';
import { pendingRuns } from './pending-runs.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : []).filter(Boolean));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNS = path.join(ROOT, 'data', 'runs');
const labels = args.runs ? String(args.runs).split(',').map((s) => s.trim()).filter(Boolean) : pendingRuns().map((p) => p.label);
if (labels.length < 2) { console.log(JSON.stringify({ combined: false, reason: 'fewer than two runs to combine', runs: labels })); process.exit(0); }
const LABEL = String(args.date || `catchup-${labels[0]}_${labels[labels.length - 1]}`);
const MAX_GROUPS = Number(args['max-groups'] || 600);
const PART_SIZE = 10;
const OUT = path.join(RUNS, LABEL);
fs.mkdirSync(path.join(OUT, 'parts'), { recursive: true });

const rank = (c) => (c.text_status === 'ok' ? 0 : c.text ? 1 : 2);
const byId = new Map();
const feeds = [];
for (const l of labels) {
  const j = JSON.parse(fs.readFileSync(path.join(RUNS, l, 'candidates.json'), 'utf8'));
  feeds.push({ run: l, groups: (j.groups || []).length, candidates: (j.candidates || []).length });
  for (const c of j.candidates || []) { const prev = byId.get(c.id); if (!prev || rank(c) < rank(prev)) byId.set(c.id, { ...c }); }
}
const cands = [...byId.values()];

const groups = [];
for (const c of cands) {
  const amt = c.amount_hint?.amount || null;
  const key = normalizeName(c.company_guess || '');
  let g = groups.find((gr) => key && tokenSimilarity(gr.company_guess, c.company_guess) >= 0.8 && (!gr.amount || !amt || Math.abs(gr.amount - amt) / Math.max(gr.amount, amt) < 0.15));
  if (!g) { g = { key: key || c.id, company_guess: c.company_guess, amount: amt, members: [] }; groups.push(g); }
  if (!g.amount && amt) g.amount = amt;
  g.members.push(c);
}
// unique keys (two groups can normalise to the same key with different amounts)
const usedKeys = new Set();
for (const g of groups) { let k = g.key, n = 2; while (usedKeys.has(k)) k = `${g.key} ${n++}`; g.key = k; usedKeys.add(k); }

const rounds = (JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'rounds.json'), 'utf8')).rounds || []).filter((r) => Date.parse(r.announced_date) > Date.now() - 45 * 86400e3);
let known = 0;
const kept = groups.filter((g) => {
  const hit = rounds.find((r) => tokenSimilarity(r.company, g.company_guess) >= 0.85 && (!g.amount || !r.amount_usd || Math.abs(r.amount_usd - g.amount) / Math.max(r.amount_usd, g.amount) < 0.15));
  if (hit) known++;
  return !hit;
});
kept.sort((a, b) => (b.amount || 0) - (a.amount || 0));
const selected = kept.slice(0, MAX_GROUPS);
for (const g of selected) { g.members.sort((a, b) => rank(a) - rank(b)); g.members.forEach((c, i) => { c.group_key = g.key; c.group_rank = i; }); }
const candidates = selected.flatMap((g) => g.members);

fs.writeFileSync(path.join(OUT, 'candidates.json'), JSON.stringify({
  run_date: LABEL, generated_at: new Date().toISOString(), combined_from: labels, min_amount_usd: 15_000_000,
  stats: { sources: feeds, unique_candidates: cands.length, groups: groups.length, known_round_groups: known, selected_groups: selected.length, candidates: candidates.length, articles_fetched: candidates.filter((c) => c.text_status === 'ok').length },
  groups: selected.map((g) => ({ key: g.key, company_guess: g.company_guess, amount_hint_usd: g.amount, candidate_ids: g.members.map((m) => m.id) })),
  candidates,
}, null, 2));
for (const f of fs.readdirSync(path.join(OUT, 'parts'))) fs.unlinkSync(path.join(OUT, 'parts', f));
const compact = (c) => ({ id: c.id, group_key: c.group_key, title: c.title, publisher: c.publisher, url: c.resolved_url || c.link, published_at: c.published_at, amount_hint: c.amount_hint?.raw || null, snippet: c.snippet, text_status: c.text_status, text: c.text ? c.text.slice(0, 3500) : null });
let part = 0;
for (let i = 0; i < selected.length; i += PART_SIZE) {
  part++;
  fs.writeFileSync(path.join(OUT, 'parts', `part-${String(part).padStart(2, '0')}.json`), JSON.stringify({ run_date: LABEL, part, groups: selected.slice(i, i + PART_SIZE).map((g) => ({ group_key: g.key, company_guess: g.company_guess, amount_hint_usd: g.amount, articles: g.members.map(compact) })) }, null, 1));
}
for (const l of labels) fs.writeFileSync(path.join(RUNS, l, 'merge-summary.json'), JSON.stringify({ run_date: l, superseded_by: LABEL, note: 'candidates combined into the catch-up run; not merged on their own' }, null, 2));
console.log(JSON.stringify({ combined: true, label: LABEL, runs: labels, unique_candidates: cands.length, groups: groups.length, known_round_groups: known, selected_groups: selected.length, parts: part }));
