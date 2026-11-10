// Source registry + RSS/Atom parsing. All sources are public feeds that permit automated reads.
import { decodeEntities, stripCdata } from './text.mjs';

export const USER_AGENT = 'ai-funding-tracker/0.1 (personal research feed; contact: github.com/ahmedtausif3000)';
export const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

// Google News RSS search. `when:Nd` restricts recency; max ~100 items per query.
export function googleNewsQueries(days, range) {
  const when = range ? `after:${range.from} before:${range.to}` : `when:${days}d`;
  const qs = [
    `"raises" ("Series A" OR "Series B" OR "Series C" OR "Series D" OR "seed") AI`,
    `AI startup raises million funding round`,
    `AI "raises $" million "led by"`,
    `"machine learning" OR "artificial intelligence" raises million funding`,
    `AI "funding round" million investors`,
    `robotics OR "autonomous" startup raises million Series`,
    `AI infrastructure OR "AI chip" OR "data center" startup raises million`,
    `"emerges from stealth" AI million`,
  ];
  // Generic (non-AI) funding queries. Crunchbase tags AI/ML by the company's industry list, so many
  // in-scope rounds (health tech, fintech, quantum, biotech tooling) never say "AI" in the headline.
  // These are marked ai_specific:false; the prefilter keeps them only with an explicit >= $15M amount
  // or an AI hint, and the extractor decides is_ai_ml from the article.
  const generic = [
    `"raises" "Series A" million`,
    `"raises" "Series B" million`,
    `"raises" ("Series C" OR "Series D" OR "Series E" OR "Series F") million`,
    `"seed" (raises OR secures OR closes) million startup`,
    `startup raises million "led by"`,
    `(secures OR lands OR closes OR nabs) million "funding" startup`,
    `million "financing" (startup OR company) (announces OR closes OR raises)`,
    `("emerges from stealth" OR "launches with" OR "out of stealth") million`,
    `"raises" million (health OR medical OR fintech OR insurance OR biotech OR quantum OR defense OR energy)`,
  ];
  const mk = (q, i, ai) => ({
    id: range ? `gnews-${ai ? '' : 'g'}${i + 1}-${range.from}` : `gnews-${ai ? '' : 'g'}${i + 1}`,
    kind: 'google-news',
    ai_specific: ai,
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' ' + when)}&hl=en-US&gl=US&ceid=US:en`,
    label: `Google News: ${q}`,
  });
  return [...qs.map((q, i) => mk(q, i, true)), ...generic.map((q, i) => mk(q, i, false))];
}

export const STATIC_FEEDS = [
  { id: 'prnewswire-vc', kind: 'rss', ai_specific: false, label: 'PR Newswire venture capital', url: 'https://www.prnewswire.com/rss/financial-services-latest-news/venture-capital-list.rss' },
  { id: 'alleywatch', kind: 'rss', ai_specific: false, label: 'AlleyWatch funding', url: 'https://www.alleywatch.com/category/funding/feed/', paged: true },
  // Pulse 2.0 posts nearly every US round as "Company Raises $X Million Series A"; WordPress ?paged=N reaches back ~11 days per 40 pages.
  { id: 'pulse2', kind: 'rss', ai_specific: false, label: 'Pulse 2.0', url: 'https://pulse2.com/feed/', paged: true },
  { id: 'citybiz', kind: 'rss', ai_specific: false, label: 'citybiz', url: 'https://www.citybiz.co/feed/', paged: true },
  { id: 'techcrunch-venture', kind: 'rss', ai_specific: false, label: 'TechCrunch venture', url: 'https://techcrunch.com/category/venture/feed/' },
  { id: 'techcrunch-funding', kind: 'rss', ai_specific: false, label: 'TechCrunch funding tag', url: 'https://techcrunch.com/tag/funding/feed/' },
  { id: 'techcrunch-ai', kind: 'rss', ai_specific: true, label: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
  { id: 'techfundingnews', kind: 'rss', ai_specific: false, label: 'Tech Funding News', url: 'https://techfundingnews.com/feed/', paged: true },
  { id: 'crunchbase-news', kind: 'rss', ai_specific: false, label: 'Crunchbase News', url: 'https://news.crunchbase.com/feed/' },
  { id: 'crunchbase-news-ai', kind: 'rss', ai_specific: true, label: 'Crunchbase News AI', url: 'https://news.crunchbase.com/sections/ai/feed/' },
];

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? decodeEntities(stripCdata(m[1].trim())) : '';
}
function attr(block, name, attrName) {
  const m = block.match(new RegExp(`<${name}\\s[^>]*?${attrName}="([^"]*)"`, 'i'));
  return m ? decodeEntities(m[1]) : '';
}

export function parseFeed(xml = '') {
  const items = [];
  const isAtom = /<feed[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml);
  const blocks = xml.match(isAtom ? /<entry[\s\S]*?<\/entry>/gi : /<item[\s\S]*?<\/item>/gi) || [];
  for (const b of blocks) {
    if (isAtom) {
      items.push({
        title: tag(b, 'title'),
        link: attr(b, 'link', 'href') || tag(b, 'link'),
        published: tag(b, 'updated') || tag(b, 'published'),
        description: tag(b, 'summary') || tag(b, 'content'),
        publisher: tag(b, 'name'),
      });
    } else {
      items.push({
        title: tag(b, 'title'),
        link: tag(b, 'link') || attr(b, 'link', 'href') || tag(b, 'guid'),
        published: tag(b, 'pubDate') || tag(b, 'dc:date'),
        description: tag(b, 'description') || tag(b, 'content:encoded'),
        publisher: tag(b, 'source') || tag(b, 'dc:creator'),
        publisher_url: attr(b, 'source', 'url'),
      });
    }
  }
  return items;
}

export async function fetchText(url, { ua = USER_AGENT, timeoutMs = 20000, maxBytes = 2_000_000, headers = {}, method = 'GET', body } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method, body, headers: { 'user-agent': ua, accept: 'text/html,application/xhtml+xml,application/xml,text/xml,*/*;q=0.8', 'accept-language': 'en-US,en;q=0.9', ...headers }, redirect: 'follow', signal: ctrl.signal });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, url: res.url, text: buf.subarray(0, maxBytes).toString('utf8'), ok: res.ok };
  } finally { clearTimeout(t); }
}
