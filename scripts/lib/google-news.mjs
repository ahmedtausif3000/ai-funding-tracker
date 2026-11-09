// Resolve Google News RSS redirect links to the publisher URL.
// Newer IDs need Google's batchexecute endpoint; older IDs are a plain protobuf-in-base64.
import { fetchText, BROWSER_UA, parseFeed } from './feeds.mjs';
import { tokenSimilarity } from './text.mjs';

export function isGoogleNewsLink(u = '') { return /^https?:\/\/news\.google\.com\/(rss\/)?articles\//.test(u); }

function articleId(u) { const m = u.match(/\/articles\/([^?/]+)/); return m ? m[1] : null; }

export function decodeLegacy(id) {
  try {
    const buf = Buffer.from(id.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const s = buf.toString('latin1');
    const m = s.match(/https?:\/\/[\x21-\x7e]+/);
    if (!m) return null;
    let url = m[0];
    // strip trailing protobuf bytes that are not URL-safe
    url = url.replace(/[^\x21-\x7e]+.*$/, '').replace(/\u0012.*$/, '');
    return /^https?:\/\/[^\s]+\.[a-z]{2,}/i.test(url) ? url : null;
  } catch { return null; }
}

export async function decodeGoogleNewsUrl(link) {
  const id = articleId(link);
  if (!id) return null;
  if (!id.startsWith('AU_yqL') && !id.startsWith('CBM')) {
    const legacy = decodeLegacy(id);
    if (legacy) return legacy;
  }
  if (id.startsWith('CBM')) { const legacy = decodeLegacy(id); if (legacy) return legacy; }
  try {
    const page = await fetchText(`https://news.google.com/articles/${id}`, { ua: BROWSER_UA, timeoutMs: 15000 });
    if (page.status === 429 || /id='captcha'|sorry\/index/.test(page.text)) return 'RATE_LIMITED';
    const sg = page.text.match(/data-n-a-sg="([^"]+)"/)?.[1];
    const ts = page.text.match(/data-n-a-ts="([^"]+)"/)?.[1];
    if (!sg || !ts) return null;
    const inner = JSON.stringify(['garturlreq', [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0], id, Number(ts), sg]);
    const body = 'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', inner, null, 'generic']]]));
    const res = await fetchText('https://news.google.com/_/DotsSplashUi/data/batchexecute', { ua: BROWSER_UA, timeoutMs: 15000, headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' }, method: 'POST', body });
    if (res.status === 429) return 'RATE_LIMITED';
    return parseBatch(res.text);
  } catch { return null; }
}

function parseBatch(text) {
  const clean = text.replace(/^\)\]\}'\s*/, '');
  // response is chunked: length line, then JSON
  const jsonStart = clean.indexOf('[');
  try {
    const arr = JSON.parse(clean.slice(jsonStart).split('\n').filter((l) => l.startsWith('[')).join(''));
    for (const row of arr) {
      if (Array.isArray(row) && row[0] === 'wrb.fr' && typeof row[2] === 'string') {
        const inner = JSON.parse(row[2]);
        if (Array.isArray(inner) && typeof inner[1] === 'string' && /^https?:/.test(inner[1])) return inner[1];
      }
    }
  } catch {}
  const m = clean.match(/https?:\\\/\\\/[^"\\]+/);
  return m ? m[0].replace(/\\\//g, '/') : null;
}

// Fallback: find the publisher URL for a headline via DuckDuckGo's HTML endpoint.
export async function searchHeadlineUrl(title, publisher = '') {
  try {
    const q = `"${title.replace(/"/g, '')}"`;
    const res = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, { ua: BROWSER_UA, timeoutMs: 15000 });
    if (!res.ok) return res.status === 429 || res.status === 403 ? 'RATE_LIMITED' : null;
    const links = [...new Set([...res.text.matchAll(/uddg=([^&"]+)/g)].map((m) => { try { return decodeURIComponent(m[1]); } catch { return null; } }).filter((u) => u && /^https?:\/\//.test(u) && !/duckduckgo\.com|google\.com|bing\.com|youtube\.com|facebook\.com|twitter\.com|x\.com|linkedin\.com/.test(u)))];
    if (!links.length) return null;
    const pub = publisher.toLowerCase().replace(/[^a-z0-9]/g, '');
    const match = pub ? links.find((u) => { try { return pub.includes(new URL(u).hostname.replace(/^www\./, '').split('.')[0].replace(/[^a-z0-9]/g, '')) || new URL(u).hostname.replace(/[^a-z0-9]/g, '').includes(pub.slice(0, 8)); } catch { return false; } }) : null;
    return match || links[0];
  } catch { return null; }
}


const feedCache = new Map();
// Resolve by matching the headline against the publisher's own RSS feed (no third party involved).
export async function resolveViaPublisherFeed(title, publisherUrl) {
  if (!publisherUrl) return null;
  let origin; try { origin = new URL(publisherUrl).origin; } catch { return null; }
  if (!feedCache.has(origin)) {
    let items = [];
    for (const pathname of ['/feed/', '/feed', '/rss', '/rss.xml', '/feed/rss']) {
      try {
        const r = await fetchText(origin + pathname, { ua: BROWSER_UA, timeoutMs: 12000 });
        if (r.ok && /<(rss|feed)[\s>]/i.test(r.text)) { items = parseFeed(r.text); if (items.length) break; }
      } catch {}
    }
    feedCache.set(origin, items);
  }
  const items = feedCache.get(origin);
  let best = null, bestScore = 0;
  for (const it of items) {
    const sc = titleSimilarity(title, it.title);
    if (sc > bestScore) { bestScore = sc; best = it; }
  }
  return bestScore >= 0.72 && best?.link ? best.link : null;
}

function titleSimilarity(a, b) {
  const tok = (s) => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9$. ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2));
  const A = tok(a), B = tok(b); if (!A.size || !B.size) return 0;
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size);
}

// Bing web search RSS: quotes are loosely honored, so require a title match.
export async function resolveViaBing(title, publisher = '') {
  try {
    const res = await fetchText(`https://www.bing.com/search?q=${encodeURIComponent('"' + title.replace(/"/g, '') + '"')}&format=rss`, { ua: BROWSER_UA, timeoutMs: 15000 });
    if (!res.ok) return res.status === 429 || res.status === 403 ? 'RATE_LIMITED' : null;
    const items = parseFeed(res.text).filter((it) => it.link && !/bing\.com|microsoft\.com|google\.com|youtube\.com|linkedin\.com|x\.com|twitter\.com|facebook\.com/.test(it.link));
    let best = null, bestScore = 0;
    for (const it of items) { const sc = titleSimilarity(title, it.title); if (sc > bestScore) { bestScore = sc; best = it; } }
    return bestScore >= 0.6 && best ? best.link : null;
  } catch { return null; }
}
