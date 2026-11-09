#!/usr/bin/env node
// Combine data/runs/<date>/extracted.part-*.json (written by parallel extractors) into extracted.json.
// Usage: node scripts/concat-extracted.mjs --date <run_date>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : []).filter(Boolean));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(ROOT, 'data', 'runs', String(args.date));
const files = fs.readdirSync(dir).filter((f) => /^extracted\.part-.*\.json$/.test(f)).sort();
if (!files.length) { console.error('no extracted.part-*.json in', dir); process.exit(1); }
const out = { run_date: String(args.date), extractor: 'parallel agents', notes: [], rows: [] };
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  if (j.notes) out.notes.push(`[${f}] ${j.notes}`);
  out.rows.push(...(j.rows || []));
}
out.notes = out.notes.join('\n');
fs.writeFileSync(path.join(dir, 'extracted.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ files: files.length, rows: out.rows.length }));
