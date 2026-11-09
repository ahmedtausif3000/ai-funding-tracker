#!/usr/bin/env node
// Stage 1: pull candidate funding announcements from public feeds, prefilter, group, fetch article text.
// Output: data/runs/<run_date>/candidates.json + parts/part-NN.json (for batch extraction)
// Usage: node scripts/fetch-candidates.mjs [--days 2] [--date YYYY-MM-DD] [--no-articles] [--max-groups 120]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { googleNewsQueries, STATIC_FEEDS, parseFeed, fetchText, BROWSER_UA } from './lib/feeds.mjs';
import { decodeGoogleNewsUrl, isGoogleNewsLink, searchHeadlineUrl, resolveViaPublisherFeed, resolveViaBing } from './lib/google-news.mjs';
import { htmlToText, extractMainHtml, parseAmount, FUNDING_VERB_RE, FUNDING_CTX_RE, AI_HINT_RE, headlineCompany, normalizeName, tokenSimilarity, isoDate, sleep } from './lib/text.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : []).filter(Boolean));
const DAYS = Number(args.days || 2);
const RUN_DATE = args.date || isoDate();
const FETCH_ARTICLES = !args['no-articles'];
const MAX_GROUPS = Number(args['max-groups'] || 150);
const MIN_AMOUNT = 15_000_000;
const TEXT_CAP = 6000;
const PART_SIZE = 10;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUN_DIR = path.join(ROOT, 'data', 'runs', RUN_DATE);
fs.mkdirSync(path.join(RUN_DIR, 'parts'), { recursive: true });

const readJson = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } };
const seen = new Set(readJson(path.join(ROOT, 'data', 'seen-urls.json'), []));
const rounds = readJson(path.join(ROOT, 'data', 'rounds.json'), { rounds: [] }).rounds || [];

const log = (...m) => console.error(`[fetch ${new Date().toISOString().slice(11, 19)}]`, ...m);
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const cutoff = Date.now() - (DAYS + 0.5) * 86400e3;

const sources = [...googleNewsQueries(DAYS), ...STATIC_FEEDS];
const feedStats = [];
const raw = [];
for (const src of sources) {
  try {
    const res = await fetchText(src.url, { timeoutMs: 25000 });
    const items = res.ok ? parseFeed(res.text) : [];
    feedStats.push({ id: src.id, status: res.status, items: items.length });
    log(`${src.id}: ${res.status} ${items.length} items`);
    for (const it of items) {
      const pub = it.published ? Date.parse(it.published) : NaN;
      if (!Number.isNaN(pub) && pub < cutoff) continue;
      raw.push({ ...it, source_feed: src.id, ai_specific: src.ai_specific, kind: src.kind });
    }
  } catch (e) {
    feedStats.push({ id: src.id, status: 'error', error: String(e.message || e) });
    log(`${src.id}: ERROR ${e.message}`);
  }
  await sleep(300);
}

// ---- prefilter ----
const dropped = { not_funding: 0, no_ai_hint: 0, below_min: 0, fund_close: 0, seen: 0, duplicate_link: 0, known_round: 0 };
const FUND_RE = /\b(fund\s+(?:[IVX]+|\d+|one|two|three)\b|(?:first|final|initial) close|closes? (?:its|a|an|new|\$[\d.]+\s?\w+ )?(?:\w+ ){0,3}fund\b|venture (?:capital )?firm|vc firm|capital raises|investment firm|asset manager|raises .{0,40}\bfund\b|fund of funds|for (?:its|new) fund)/i;
const FX = { USD: 1, EUR: 1.1, GBP: 1.3, CAD: 0.72, AUD: 0.65 };
const byLink = new Map();
for (const it of raw) {
  const title = (it.title || '').trim();
  const snippet = htmlToText(it.description || '').slice(0, 600);
  const blob = `${title}\n${snippet}`;
  if (!title || !it.link) continue;
  if (byLink.has(it.link)) { dropped.duplicate_link++; continue; }
  if (!FUNDING_VERB_RE.test(blob) || !FUNDING_CTX_RE.test(blob)) { dropped.not_funding++; continue; }
  const aiHint = AI_HINT_RE.test(blob);
  if (!aiHint && !it.ai_specific) { dropped.no_ai_hint++; continue; }
  if (FUND_RE.test(title)) { dropped.fund_close++; continue; }
  const amt = parseAmount(blob);
  if (amt && amt.amount * (FX[amt.currency] || 1) < MIN_AMOUNT) { dropped.below_min++; continue; }
  if (seen.has(it.link)) { dropped.seen++; continue; }
  let publisher = it.publisher || '';
  let cleanTitle = title;
  const m = title.match(/\s[-|–—]\s([^-|–—]{2,60})$/);
  if (m && it.kind === 'google-news') { publisher = publisher || m[1].trim(); cleanTitle = title.slice(0, m.index).trim(); }
  byLink.set(it.link, {
    id: hash(it.link), title: cleanTitle, publisher, link: it.link, published_at: it.published ? new Date(it.published).toISOString() : null,
    publisher_url: it.publisher_url || null, snippet, source_feed: it.source_feed, ai_hint: aiHint, amount_hint: amt, company_guess: headlineCompany(cleanTitle),
  });
}
let cands = [...byLink.values()];
log(`raw ${raw.length} -> prefiltered ${cands.length}`, JSON.stringify(dropped));

// ---- group same-round coverage ----
const groups = [];
for (const c of cands) {
  const key = normalizeName(c.company_guess);
  let g = groups.find((gr) => {
    const sim = tokenSimilarity(gr.company_guess, c.company_guess);
    const amtOk = !gr.amount || !c.amount_hint || Math.abs(gr.amount - c.amount_hint.amount) / Math.max(gr.amount, c.amount_hint.amount) < 0.15;
    return key && sim >= 0.8 && amtOk;
  });
  if (!g) { g = { key: key || c.id, company_guess: c.company_guess, amount: c.amount_hint?.amount || null, members: [] }; groups.push(g); }
  if (!g.amount && c.amount_hint) g.amount = c.amount_hint.amount;
  g.members.push(c);
}
// known-round suppression: skip groups matching an existing round (name sim + amount) announced in the last 45 days
const recent = rounds.filter((r) => Date.parse(r.announced_date) > Date.now() - 45 * 86400e3);
const kept = [];
for (const g of groups) {
  const known = recent.find((r) => tokenSimilarity(r.company, g.company_guess) >= 0.85 && (!g.amount || !r.amount_usd || Math.abs(r.amount_usd - g.amount) / Math.max(r.amount_usd, g.amount) < 0.15));
  if (known) { dropped.known_round += g.members.length; continue; }
  kept.push(g);
}
const prio = (c) => /prnewswire|businesswire|globenewswire|newswire/i.test(c.publisher + c.link) ? 0 : /techcrunch|crunchbase|alleywatch|axios|bloomberg|reuters|wsj|fortune|forbes|theinformation/i.test(c.publisher + c.link) ? 1 : 2;
kept.sort((a, b) => (b.amount || 0) - (a.amount || 0));
const selected = kept.slice(0, MAX_GROUPS);
log(`groups ${groups.length} -> after known-round suppression ${kept.length} -> selected ${selected.length}`);

// ---- resolve links + fetch article text (best article per group; gentle on Google) ----
const cachePath = path.join(ROOT, 'data', 'url-cache.json');
const urlCache = readJson(cachePath, {});
let fetched = 0, blocked = 0, googleStop = false, bingStop = false, searchStop = false, resolvedNow = 0, viaSearch = 0, viaFeed = 0;
for (const g of selected) {
  g.members.sort((a, b) => prio(a) - prio(b));
  for (const [i, c] of g.members.entries()) {
    c.group_key = g.key; c.group_rank = i;
    if (!FETCH_ARTICLES || i >= 1) { c.text_status = 'skipped'; continue; }
    try {
      let target = c.link;
      if (isGoogleNewsLink(target)) {
        if (urlCache[target]) target = urlCache[target].url;
        else {
          let r = await resolveViaPublisherFeed(c.title, c.publisher_url);
          if (r) viaFeed++;
          if (!r && !googleStop) {
            r = await decodeGoogleNewsUrl(target);
            await sleep(1100);
            if (r === 'RATE_LIMITED') { googleStop = true; r = null; log('Google News rate limit hit; using search fallbacks'); }
          }
          if (!r && !bingStop) {
            r = await resolveViaBing(c.title, c.publisher);
            await sleep(1500);
            if (r === 'RATE_LIMITED') { bingStop = true; r = null; log('Bing rate limited'); } else if (r) viaSearch++;
          }
          if (!r && !searchStop) {
            r = await searchHeadlineUrl(c.title, c.publisher);
            await sleep(2000);
            if (r === 'RATE_LIMITED') { searchStop = true; r = null; log('DuckDuckGo rate limited'); } else if (r) viaSearch++;
          }
          if (r) { target = r; urlCache[c.link] = { url: r, at: Date.now() }; resolvedNow++; }
          else { c.text_status = 'unresolved'; continue; }
        }
      }
      c.resolved_url = target;
      if (isGoogleNewsLink(target)) { c.text_status = 'unresolved'; continue; }
      const res = await fetchText(target, { ua: BROWSER_UA, timeoutMs: 20000 });
      if (!res.ok) { c.text_status = `blocked:${res.status}`; blocked++; continue; }
      const text = htmlToText(extractMainHtml(res.text));
      c.text = text.slice(0, TEXT_CAP); c.text_status = text.length > 400 ? 'ok' : 'thin'; fetched++;
    } catch (e) { c.text_status = `error:${String(e.message || e).slice(0, 60)}`; }
    await sleep(200);
  }
}
for (const [k, v] of Object.entries(urlCache)) if (Date.now() - v.at > 45 * 86400e3) delete urlCache[k];
fs.writeFileSync(cachePath, JSON.stringify(urlCache, null, 0));
log(`links resolved this run: ${resolvedNow} (${viaFeed} via publisher feed, ${viaSearch} via search)${googleStop ? '; Google rate limited' : ''}`);
log(`articles fetched ${fetched}, blocked ${blocked}`);

const candidates = selected.flatMap((g) => g.members);
const out = {
  run_date: RUN_DATE, generated_at: new Date().toISOString(), window_days: DAYS, min_amount_usd: MIN_AMOUNT,
  stats: { feeds: feedStats, raw_items: raw.length, prefiltered: cands.length, dropped, groups: groups.length, selected_groups: selected.length, candidates: candidates.length, articles_fetched: fetched, google_rate_limited: googleStop },
  groups: selected.map((g) => ({ key: g.key, company_guess: g.company_guess, amount_hint_usd: g.amount, candidate_ids: g.members.map((m) => m.id) })),
  candidates,
};
fs.writeFileSync(path.join(RUN_DIR, 'candidates.json'), JSON.stringify(out, null, 2));

// parts: compact, grouped, for batch extraction by the agent
const partsDir = path.join(RUN_DIR, 'parts');
for (const f of fs.readdirSync(partsDir)) fs.unlinkSync(path.join(partsDir, f));
const compact = (c) => ({ id: c.id, group_key: c.group_key, title: c.title, publisher: c.publisher, url: c.resolved_url || c.link, published_at: c.published_at, amount_hint: c.amount_hint?.raw || null, snippet: c.snippet, text_status: c.text_status, text: c.text ? c.text.slice(0, 3500) : null });
let part = 1;
for (let i = 0; i < selected.length; i += PART_SIZE) {
  const slice = selected.slice(i, i + PART_SIZE);
  fs.writeFileSync(path.join(partsDir, `part-${String(part).padStart(2, '0')}.json`), JSON.stringify({ run_date: RUN_DATE, part, groups: slice.map((g) => ({ group_key: g.key, company_guess: g.company_guess, amount_hint_usd: g.amount, articles: g.members.map(compact) })) }, null, 1));
  part++;
}
log(`wrote ${RUN_DIR}/candidates.json and ${part - 1} parts`);
console.log(JSON.stringify({ run_date: RUN_DATE, candidates: candidates.length, groups: selected.length, parts: part - 1, dir: RUN_DIR }));
