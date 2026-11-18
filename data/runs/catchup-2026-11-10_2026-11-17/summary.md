# Catch-up run: Nov 10 to Nov 17, 2026

Why this run exists: GitHub started the daily 13:00 UTC fetch 5 to 9 hours late on every one of these days, after the 6:00 AM Pacific routine had already run. The routine only looked for that day's folder, logged "fetch blocked" and never came back, so eight days of fetched candidates were never extracted.

- Combined the eight daily folders (2026-11-10 to 2026-11-17) with `scripts/combine-runs.mjs`: 1,086 unique candidates, 441 groups, 285 with article text.
- Extraction: 9 parallel agents, 512 rows, 510 accepted (2 rejected as stale re-reports: Surf, C2i Semiconductors).
- Merge: 383 inserted, 127 merged into existing rounds, 329 excluded on insert. Store: 1,105 rounds, 248 in view.
- 54 new in-view rounds, including Mirendil $1B Series A, Mercor $750M Series D, Genesis AI $500M Series A, Torus $500M, Science Corporation $400M Series D, LangChain $300M Series C, Path Robotics $300M Series E, Imprint $130M, Corma $125M Series A, Noeri $110M, Rox $100M Series B.
- Corrections added: Edelbyte Series A set to $45M (the $70M headline includes a $25M seed), Quartermaster $140M marked duplicate of the $100M Series B, Vumedi set to $104M, OpenAI updated to $15B.
- Low-confidence rows to treat with care: Zeromatter $110M (0.45, amount conflicts across sources), Tiberius Aerospace (0.6, HQ Newport Beach vs London), Fairly (0.65, no round type or investors), Science Corporation (AI tag rests on news categorisation).
