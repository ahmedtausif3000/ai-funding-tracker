#!/usr/bin/env node
// List run folders that have fetched candidates but were never merged, oldest first.
// A run is pending when data/runs/<label>/parts/part-01.json exists and merge-summary.json does not.
// Usage: node scripts/pending-runs.mjs            -> JSON { pending: [{ label, groups, parts, generated_at, parts_done }] }
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNS = path.join(ROOT, 'data', 'runs');

export function pendingRuns() {
  const out = [];
  for (const label of fs.existsSync(RUNS) ? fs.readdirSync(RUNS) : []) {
    const dir = path.join(RUNS, label);
    if (!fs.existsSync(path.join(dir, 'parts', 'part-01.json'))) continue;
    if (fs.existsSync(path.join(dir, 'merge-summary.json'))) continue;
    let generated_at = null, groups = null;
    try { const j = JSON.parse(fs.readFileSync(path.join(dir, 'candidates.json'), 'utf8')); generated_at = j.generated_at; groups = (j.groups || []).length; } catch { /* parts without candidates.json: still pending */ }
    const parts = fs.readdirSync(path.join(dir, 'parts')).filter((f) => /^part-\d+\.json$/.test(f)).sort();
    const done = fs.readdirSync(dir).filter((f) => /^extracted\.part-.*\.json$/.test(f)).sort();
    out.push({ label, groups, parts: parts.length, generated_at, parts_done: done });
  }
  out.sort((a, b) => String(a.generated_at || a.label).localeCompare(String(b.generated_at || b.label)));
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify({ pending: pendingRuns() }, null, 1));
}
