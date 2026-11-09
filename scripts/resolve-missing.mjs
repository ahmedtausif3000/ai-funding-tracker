#!/usr/bin/env node
// Second pass: resolve + fetch text for candidates still lacking it, without touching Google. Rewrites candidates.json and parts/.
// Usage: node scripts/resolve-missing.mjs --date <run_dir> [--min 15000000] [--pace 2500]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchText, BROWSER_UA } from './lib/feeds.mjs';
import { isGoogleNewsLink, searchHeadlineUrl, resolveViaPublisherFeed, resolveViaBing } from './lib/google-news.mjs';
import { htmlToText, extractMainHtml, sleep } from './lib/text.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : []).filter(Boolean));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUN_DIR = path.join(ROOT, 'data', 'runs', String(args.date));
const MIN = Number(args.min || 15_000_000);
const PACE = Number(args.pace || 2500);
const TEXT_CAP = 6000, PART_SIZE = 10;
const log = (...m) => console.error(`[resolve ${new Date().toISOString().slice(11, 19)}]`, ...m);
const cands = JSON.parse(fs.readFileSync(path.join(RUN_DIR, 'candidates.json'), 'utf8'));
const cachePath = path.join(ROOT, 'data', 'url-cache.json');
const urlCache = (() => { try { return JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch { return {}; } })();
const byId = new Map(cands.candidates.map((c) => [c.id, c]));
let bingStop = false, ddgStop = false, resolved = 0, fetched = 0, tried = 0;

for (const g of cands.groups) {
  if (g.amount_hint_usd != null && g.amount_hint_usd < MIN) continue;
  const members = g.candidate_ids.map((id) => byId.get(id)).filter(Boolean);
  if (members.some((c) => c.text_status === 'ok')) continue;
  // try up to 2 articles in the group
  for (const c of members.slice(0, 2)) {
    tried++;
    try {
      let target = c.resolved_url && !isGoogleNewsLink(c.resolved_url) ? c.resolved_url : null;
      if (!target && urlCache[c.link]) target = urlCache[c.link].url;
      if (!target) target = await resolveViaPublisherFeed(c.title, c.publisher_url);
      if (!target && !bingStop) { const r = await resolveViaBing(c.title, c.publisher); await sleep(PACE); if (r === 'RATE_LIMITED') { bingStop = true; log('Bing rate limited'); } else target = r; }
      if (!target && !ddgStop) { const r = await searchHeadlineUrl(c.title, c.publisher); await sleep(PACE); if (r === 'RATE_LIMITED') { ddgStop = true; log('DDG rate limited'); } else target = r; }
      if (!target || isGoogleNewsLink(target)) { c.text_status = c.text_status === 'skipped' ? 'unresolved' : c.text_status; continue; }
      c.resolved_url = target; urlCache[c.link] = { url: target, at: Date.now() }; resolved++;
      const res = await fetchText(target, { ua: BROWSER_UA, timeoutMs: 20000 });
      if (!res.ok) { c.text_status = `blocked:${res.status}`; continue; }
      const text = htmlToText(extractMainHtml(res.text));
      c.text = text.slice(0, TEXT_CAP); c.text_status = text.length > 400 ? 'ok' : 'thin';
      if (c.text_status === 'ok') { fetched++; break; }
    } catch (e) { c.text_status = `error:${String(e.message || e).slice(0, 60)}`; }
    await sleep(300);
  }
  if (bingStop && ddgStop) { log('all search fallbacks rate limited; stopping'); break; }
}
fs.writeFileSync(cachePath, JSON.stringify(urlCache));
fs.writeFileSync(path.join(RUN_DIR, 'candidates.json'), JSON.stringify(cands, null, 2));
// regenerate parts
const partsDir = path.join(RUN_DIR, 'parts');
for (const f of fs.readdirSync(partsDir)) fs.unlinkSync(path.join(partsDir, f));
const compact = (c) => ({ id: c.id, group_key: c.group_key, title: c.title, publisher: c.publisher, url: c.resolved_url || c.link, published_at: c.published_at, amount_hint: c.amount_hint?.raw || null, snippet: c.snippet, text_status: c.text_status, text: c.text ? c.text.slice(0, 3500) : null });
let part = 1;
for (let i = 0; i < cands.groups.length; i += PART_SIZE) {
  const slice = cands.groups.slice(i, i + PART_SIZE);
  fs.writeFileSync(path.join(partsDir, `part-${String(part).padStart(2, '0')}.json`), JSON.stringify({ run_date: cands.run_date, part, groups: slice.map((g) => ({ group_key: g.key, company_guess: g.company_guess, amount_hint_usd: g.amount_hint_usd, articles: g.candidate_ids.map((id) => byId.get(id)).filter(Boolean).map(compact) })) }, null, 1));
  part++;
}
const st = {}; for (const c of cands.candidates) st[c.text_status] = (st[c.text_status] || 0) + 1;
log(`tried ${tried}, resolved ${resolved}, text ok ${fetched}; parts ${part - 1}`, JSON.stringify(st));
console.log(JSON.stringify({ tried, resolved, fetched_ok: fetched, parts: part - 1 }));
