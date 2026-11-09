// Shared text helpers. Zero dependencies.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'", '#8217': '’', '#8216': '‘', '#8220': '“', '#8221': '”', '#8211': '–', '#8212': '—', hellip: '…', '#8230': '…' };

export function decodeEntities(s = '') {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    const key = e.toLowerCase();
    if (ENTITIES[key] !== undefined) return ENTITIES[key];
    if (key.startsWith('#x')) return safeChar(parseInt(key.slice(2), 16));
    if (key.startsWith('#')) return safeChar(parseInt(key.slice(1), 10));
    return m;
  });
}
function safeChar(cp) { try { return String.fromCodePoint(cp); } catch { return ''; } }

export function stripCdata(s = '') {
  return s.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1');
}

export function htmlToText(html = '') {
  let h = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  h = h.replace(/<(br|p|div|li|h[1-6]|tr|section|article|header|footer|blockquote)[^>]*>/gi, '\n');
  h = h.replace(/<[^>]+>/g, ' ');
  h = decodeEntities(h);
  return h.replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

// Pull the most article-like block out of a page before converting.
export function extractMainHtml(html = '') {
  const pick = (re) => { const m = html.match(re); return m ? m[0] : null; };
  return pick(/<article[\s\S]*?<\/article>/i)
    || pick(/<main[\s\S]*?<\/main>/i)
    || pick(/<div[^>]+(?:class|id)="[^"]*(?:article-body|articleBody|release-body|post-content|entry-content|story-body|content-body)[^"]*"[\s\S]*?<\/div>\s*<\/div>/i)
    || pick(/<body[\s\S]*?<\/body>/i)
    || html;
}

// Parse "$19.1M", "$1.2 billion", "US$35 million", "€40M" -> { amount, currency }
const AMOUNT_RE = /(US\$|USD\s?|\$|€|£|EUR\s?|GBP\s?|C\$|A\$)\s?(\d{1,4}(?:[.,]\d{1,3})?)\s?(billion|million|bn|mm|m|b)\b/i;
export function parseAmount(text = '') {
  const m = text.match(AMOUNT_RE);
  if (!m) return null;
  const sym = m[1].toUpperCase().replace(/\s/g, '');
  const currency = sym.startsWith('€') || sym === 'EUR' ? 'EUR' : sym.startsWith('£') || sym === 'GBP' ? 'GBP' : sym === 'C$' ? 'CAD' : sym === 'A$' ? 'AUD' : 'USD';
  const num = parseFloat(m[2].replace(',', '.'));
  const unit = m[3].toLowerCase();
  const mult = unit.startsWith('b') ? 1e9 : 1e6;
  return { amount: Math.round(num * mult), currency, raw: m[0] };
}

export const FUNDING_VERB_RE = /\b(raises?|raised|raising|secures?|secured|closes?|closed|lands?|landed|nabs|bags|snags|scores|pulls in|brings in|announces?|emerges? from stealth with|gets|receives?|attracts?)\b/i;
export const FUNDING_CTX_RE = /\b(funding|round|series\s?[a-h]\b|seed|pre-seed|investment|financ\w+|million|billion|\$\s?\d|valuation|venture|capital|backed|led by|investors?)\b/i;
export const AI_HINT_RE = /(\bAI\b|\bA\.I\.|artificial intelligence|machine learning|\bML\b|\bLLMs?\b|large language|foundation model|generative|\bGenAI\b|agentic|\bAI agents?\b|autonomous|robotics|\brobots?\b|computer vision|deep learning|neural|inference|\bGPUs?\b|copilot|speech recognition|voice AI|humanoid|self-driving|\bautonomy\b|data center|datacenter)/i;

const STOP_SUFFIX = /\b(inc|incorporated|corp|corporation|co|company|llc|ltd|limited|plc|gmbh|holdings|technologies|technology|labs|lab|ai|io|hq)\b\.?/gi;
export function normalizeName(name = '') {
  return name.toLowerCase()
    .replace(/[‘’'"`]/g, '')
    .replace(/[^a-z0-9& ]+/g, ' ')
    .replace(STOP_SUFFIX, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Guess the company name from a headline: text before the funding verb.
export function headlineCompany(title = '') {
  let t = title.replace(/\s[-|–—]\s[^-|–—]+$/, ''); // drop " - Publisher"
  t = t.replace(/^(exclusive|breaking|report|scoop|sources?)\s*:\s*/i, '');
  const m = t.match(FUNDING_VERB_RE);
  let head = m ? t.slice(0, m.index) : t.split(/[:,]/)[0];
  // "...officials' startup Mavria raises" -> "Mavria"
  const after = head.match(/\b(?:startup|start-up|firm|company|platform|developer|maker|scale-up|unicorn|app|lab)\s+([A-Z][\w.&-]*(?:\s+[A-Z][\w.&-]*){0,2})\s*$/);
  if (after) head = after[1];
  else if (head.includes(',')) head = head.split(',')[0]; // "Spines, a hybrid publisher," -> "Spines"
  head = head.replace(/\b(ai|a\.i\.|startup|start-up|company|firm|maker|developer|platform|provider|unicorn|robotics)\b.*$/i, (s) => s.split(/\s/)[0]);
  head = head.replace(/^(the|an?)\s+/i, '').replace(/[,.'’]+$/, '').trim();
  return head.split(/\s+/).slice(0, 4).join(' ');
}

export function tokenSet(s = '') { return new Set(normalizeName(s).split(' ').filter(Boolean)); }
export function tokenSimilarity(a, b) {
  const A = tokenSet(a), B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  const jaccard = inter / union;
  const containment = inter / Math.min(A.size, B.size);
  return Math.max(jaccard, containment >= 1 ? 0.95 : 0);
}

export function isoDate(d = new Date()) { return new Date(d).toISOString().slice(0, 10); }
export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
