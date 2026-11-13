# Run 2026-11-13
- Candidates were missing: the GitHub Actions fetch (13:00 UTC) did not commit candidates.json/parts for today.
- Fallback `npm run fetch -- --days 2` was blocked in this sandbox: all 27 of 27 feeds failed (`all_feeds_failed`).
- No rows extracted, nothing merged, no rounds added. Data and docs unchanged.
- Suspicious: the scheduled Actions job did not produce output today; check the fetch.yml run.
