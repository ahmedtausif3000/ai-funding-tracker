# ai-funding-tracker

Self-hosted daily feed of **US AI/ML startup funding rounds of $15M and above** (Seed, early-stage and late-stage venture), rebuilt from public announcements without a Crunchbase subscription. The page lives at `docs/` and is served by GitHub Pages.

Pipeline (zero runtime dependencies, Node 20+):

| Stage | Command | What it does |
|---|---|---|
| 1 Fetch | `npm run fetch -- --days 2` | Pulls Google News RSS queries, PR Newswire VC, AlleyWatch, TechCrunch, Tech Funding News and Crunchbase News feeds; prefilters on funding verbs, AI hints and the $15M floor; groups coverage of the same round; resolves Google News links gently (cached, throttled, stops on 429); fetches the best article per group. Writes `data/runs/<date>/candidates.json` and `parts/part-NN.json`. |
| 2 Extract | done by the Claude Code routine (or by hand) | Reads each part file and writes `data/runs/<date>/extracted.json` following `schema/EXTRACTION.md`. No API key: the routine runs on the Claude subscription. |
| 3 Validate | `npm run validate -- --date <date>` | Schema and enum checks; drops investor names that do not appear in the source text; writes `validated.json`. |
| 4 Merge | `npm run merge -- --date <date>` | Dedupes into `data/rounds.json` (name similarity + amount within 10% + 21-day window), unions investors and sources, flags `in_view` for the US / AI-ML / >= $15M / venture-stage scope, appends `data/merge-log.ndjson`. |
| 5 Build | `npm run build` | Writes `docs/rounds.json`, `docs/meta.json`, `docs/rounds.csv` for the static page. |
| Preview | `npm run serve` | Local server on http://localhost:4321 |

## Daily automation

Two jobs. (1) GitHub Actions `fetch-candidates` runs at 13:00 UTC and commits `data/runs/<date>/candidates.json` + `parts/` (the Claude cloud sandbox blocks outbound connections to the feed hosts, so fetching lives here). (2) A Claude Code scheduled task (cloud routine) runs `ROUTINE_PROMPT.md` at 6:00 AM Pacific: extraction from the committed parts, validate, merge, build, commit to `main`. GitHub Pages then redeploys `docs/`. Manage it at https://claude.ai/code/routines. Each run leaves `data/runs/<date>/summary.md`.

To run a day by hand: `npm run fetch -- --days 2`, write `extracted.json` per the contract, then validate, merge, build, commit, push.

## Data model

`data/rounds.json` holds every extracted round, in scope or not (`in_view`). Out-of-scope rows keep an `exclude_reason` such as `non-us`, `not-ai`, `undisclosed`, `below-min`, `fund`, `acquisition`. The page shows in-scope rows by default with a toggle for the rest. `data/seen-urls.json` stops reprocessing; `data/url-cache.json` caches resolved Google News links.

## Sources and conduct

Only public RSS/Atom feeds, Google News RSS, and publisher pages that return 200 to a normal request. No scraping of crunchbase.com, no logins, no captcha bypass. Extracted facts link back to their sources. Articles are not republished.

## Recall checks against Crunchbase exports

`node scripts/compare-crunchbase.mjs <export.csv> [--from --to] [--out report.md]` matches a Crunchbase "Funding Rounds" CSV against `data/rounds.json` and reports caught-in-view, caught-out-of-view (with the reason) and missed rows, plus whether a missed company ever reached `candidates.json`. Reports live in `data/recall/`.

Findings from the Oct 1 to 22, 2026 check (50 Crunchbase rows): Crunchbase tags AI/ML from the company's industry list, so a quarter of in-scope rounds (health tech, fintech, quantum) never say "AI" in the headline, and the original eight AI-only Google News queries never returned them. The fetch now also runs nine generic funding queries, keeps any explicit round of $15M or more from non-AI feeds, walks Pulse 2.0 and citybiz feed pages, uses 3-day windows for backfills, and the extraction contract follows Crunchbase's broad AI tagging and US dual-HQ convention.

`data/corrections.json` holds manual overrides keyed by round id (`{ "<id>": { "hq_country": "US", "is_ai_ml": true, "note": "..." } }`); `merge-rounds.mjs` applies them after every merge, and `node scripts/merge-rounds.mjs --corrections-only` re-applies them on demand.

Backfill knobs on the `fetch-candidates` workflow: `from`, `to`, `label`, `max_groups`, `feed_pages` (Pulse 2.0 runs about four pages per day, so 150 pages reaches roughly five weeks back).

## Known gaps

Rounds with undisclosed amounts are excluded from the $15M view by definition. Lead investor is empty when the announcement does not name one. Stealth rounds without any press are missed; SEC Form D ingestion is a planned addition (`scripts/fetch-formd.mjs`, not yet built).
