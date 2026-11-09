# Daily run 2026-11-09 — feed outage
- Run date: 2026-11-09
- Feed health: all 16 feeds (gnews-1..8, prnewswire-vc, alleywatch, techcrunch x3, techfundingnews, crunchbase-news x2) errored with "fetch failed".
- Cause: the sandbox egress proxy refuses CONNECT tunnels to the feed hosts (HTTP 403, confirmed with curl to techcrunch.com). Not a feed-side problem.
- Counts: candidates 0, rows extracted 0, inserted 0, merged 0. Site not rebuilt.
- In-scope rounds added today: none.
- Action: check the routine environment's network policy (allow the feed domains) and rerun; today's rounds will be picked up by the next run's --days 2 window if it is within range.
