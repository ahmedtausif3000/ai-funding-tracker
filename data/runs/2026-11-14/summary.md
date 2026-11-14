# Run 2026-11-14
- Candidates were missing: no data/runs/2026-11-14/candidates.json or parts/ from the GitHub Actions fetch (13:00 UTC) at run time.
- Fallback `npm run fetch -- --days 2` was blocked in this sandbox: all 27 of 27 feeds failed (`all_feeds_failed`). Not retried.
- No rows extracted, nothing merged, no rounds added. Data and docs unchanged.
- Suspicious: data/runs/2026-11-13/ now holds Actions-fetched candidates (13 parts, 121 groups, committed after the 2026-11-13 routine ran and recorded a blocked fetch). That run was never extracted, so those rounds are still unprocessed.
