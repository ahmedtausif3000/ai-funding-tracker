# Run 2026-11-09 (seed run, local)

- Window: 3 days. Feeds: 16/16 returned 200. Raw items 270 → 72 candidates in 59 groups after prefilter (115 not funding, 27 below $15M, 2 fund closes, 44 duplicate links).
- Link resolution: Google News and DuckDuckGo rate-limited this IP after earlier test runs; 13 links resolved (11 via publisher feeds, 2 via Bing), 19 articles fetched. Extraction used web lookups for 19 unresolved high-value groups.
- Extracted 62 rows → validator accepted 62, rejected 0, no dropped names → merged 62 new rounds, 21 in view (US, AI/ML, ≥ $15M, venture stage).
- In-scope rounds added: OpenAI $11B (reported), Zipline $1.5B, fal $1.3B Series F, Shield AI $1B Series H, Applied Compute $350M, Nominal $240M, Sentra $150M Series C, Dulo $130M Seed, Traversal $120M Series B, Rillet $100M Series C, Go.AI $85M Series A, Future Secure AI $82M, &Truth $70M Seed, Spines $64M Series A, Trajectory $45M Series A, nPhase $30M Series D, Coframe $25M Series A, Midstream Health $20M Series A, Longeye $20M Series A, geniosAI $19.1M Series A, firmly $15M Series A.
- Judgment calls: Sentra flipped to AI/ML (matches Crunchbase tagging). CesiumAstro left as not-AI. Cyera $800M marked not-funding (talks only). Mavria $130M could not be sourced beyond the headline.

## Cloud routine test run (same day, 17:02 UTC)
- The routine environment's egress proxy refused connections to all feed hosts (HTTP 403 on CONNECT), so `npm run fetch` returned 0 items. Clone, Node, scripts, commit and push all worked.
- Fix applied: the fetch stage now runs in GitHub Actions (`.github/workflows/fetch.yml`) and commits candidates before the routine runs; the routine extracts from the committed candidates. The fetch script no longer overwrites a run directory when every feed fails.
