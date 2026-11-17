# Run 2026-11-17
- Candidates were missing: the GitHub Actions fetch had not committed candidates.json/parts for today.
- Fallback `npm run fetch -- --days 2` failed with `all_feeds_failed` (0/27 feeds ok); outbound connections to feed hosts are blocked in this sandbox.
- No rows extracted, nothing merged; docs/ not rebuilt.
- Action: check the 13:00 UTC fetch.yml job and rerun.
