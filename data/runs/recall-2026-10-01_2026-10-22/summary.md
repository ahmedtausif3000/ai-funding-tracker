# Recall run: Oct 1 to Oct 22, 2026

Triggered by a comparison against the Crunchbase export `ai-ml-funding-new-2026-october-july-249.csv` (50 in-scope rows in this window).

Before: 32 caught in view, 6 caught out of view (AI flag or HQ), 12 never fetched (headlines without "AI").
After the fetch changes (9 generic Google News queries, Pulse 2.0 and citybiz paged feeds, 3-day windows, looser prefilter) the Action fetched 4,058 raw items, 389 groups, 261 articles; 3 groups (Prism Data, Prolific Machines, Turba Labs) were hand-added because Google News never returned their coverage for any generic query.

Extraction: 8 parallel agents, 496 rows, 494 accepted (2 rejected as stale re-reports). Merge: 388 inserted, 106 merged into existing rounds, 335 excluded on insert. Corrections: 11 (6 AI/HQ reconciliations, 3 Crunchbase naming/tagging, 2 duplicates).

After: 50 of 50 Crunchbase rows in view. Store: 722 rounds, 194 in view. Report: `data/recall/2026-10-01_2026-10-22-crunchbase.md`.
