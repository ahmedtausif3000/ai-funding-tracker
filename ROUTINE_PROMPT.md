You are the daily runner for the ai-funding-tracker repository (already cloned in your working directory). Goal: add today's newly announced funding rounds for US AI/ML startups to the growing record and publish the page. Work only inside this repo. Do not install packages. Node 20+ is available.

Steps, in order:

1. `git pull --ff-only origin main`. Set `run_date` to today's date in UTC (YYYY-MM-DD). A GitHub Actions job (`.github/workflows/fetch.yml`, 13:00 UTC) normally commits `data/runs/<run_date>/candidates.json` and `parts/` before you start.
   - If `data/runs/<run_date>/parts/part-01.json` exists, use it and skip fetching.
   - Otherwise run `npm run fetch -- --days 2`. If it exits with `all_feeds_failed` (the sandbox may block outbound connections to the feed hosts), do not retry: write `data/runs/<run_date>/summary.md` saying the candidates were missing and the fetch was blocked, commit it, push, and finish. Never write an empty candidates file over an existing one.

2. Read `schema/EXTRACTION.md` once. Then process `data/runs/<run_date>/parts/part-01.json`, `part-02.json`, ... one file at a time. For each group, decide whether it is a real funding round and emit one row per distinct round following the contract exactly. Round-up articles can produce several rows. Do not invent names or figures; use null and empty arrays when the text does not say. Every investor name needs a verbatim supporting span in `evidence`.
   - For groups whose `text_status` is not `ok` and whose amount hint is at least $15M, if the title and snippet are not enough to fill amount, round type and HQ country, you may use WebSearch and WebFetch to find the publisher article or the company's press release (at most 15 lookups per run, highest amounts first). Add any URL you used to `source_urls`.
   - Keep every row, in or out of scope; set `exclude_reason` for funds, acquisitions, public companies and non-funding news.
   Write all rows to `data/runs/<run_date>/extracted.json` with `"extractor": "claude-code routine"`.

3. `npm run validate -- --date <run_date>`. Fix any `rejected` rows in extracted.json (wrong enum, bad date, missing field) and rerun until exit code is 0. Rows flagged "names dropped" are fine to leave.

4. `npm run merge -- --date <run_date>` then `npm run build`. Both print a JSON summary line.

5. Write `data/runs/<run_date>/summary.md`: 5 to 15 lines with the run date, feed health, counts (candidates, rows extracted, inserted, merged, in view), the in-scope rounds added today as a bullet list (company, amount, round, lead), and anything suspicious.

6. Configure git identity if needed (`git config user.name "ai-funding-tracker bot"`, `git config user.email "ahmedtausif3000@users.noreply.github.com"`). The checkout may be a detached HEAD, so never push a branch by name. Commit everything under `data/` and `docs/` with the message `daily: <run_date> — <n> in-scope rounds added`, then run exactly:
   `git pull --rebase origin main && git push origin HEAD:main`
   If that push is rejected, run `git push origin HEAD:refs/heads/daily/<run_date>` and open a pull request against main with the summary as the body.

Quality bar: correctness over coverage. A missing round is better than a wrong amount or an invented investor. Never scrape crunchbase.com or any site that returns 403 or a captcha. Never log in to anything.
