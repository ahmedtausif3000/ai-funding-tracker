# Daily run 2026-11-10
- Candidates were missing: no candidates.json/parts were committed by the 13:00 UTC Actions job.
- Fallback fetch (`npm run fetch -- --days 2`) failed with all_feeds_failed (0/27 feeds OK); the sandbox blocks outbound connections to the feed hosts.
- No rows extracted, nothing merged; the page was not rebuilt.
- Suspicious: the Actions fetch job may not have run or failed today; check .github/workflows/fetch.yml runs.
