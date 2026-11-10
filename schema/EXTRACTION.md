# Extraction contract

The daily routine reads `data/runs/<run_date>/parts/part-NN.json` and writes `data/runs/<run_date>/extracted.json`.
Each part holds up to 10 **groups**. A group is one probable funding round with 1 to 3 articles about it.
Round-up articles ("Week's 10 biggest rounds", "Funding Weekly") may yield several rows; emit one row per distinct round.

## Output file

```json
{
  "run_date": "YYYY-MM-DD",
  "extractor": "claude-code routine | local",
  "notes": "free text: anything odd this run",
  "rows": [ { ...row } ]
}
```

## Row fields (all required; use null when the source does not say)

| field | type | rule |
|---|---|---|
| `group_key` | string | copy from the part file |
| `candidate_ids` | string[] | ids of the articles used |
| `company` | string | legal/brand name as written, without "Inc." etc. |
| `website` | string or null | company domain if the text or your knowledge gives it with confidence |
| `amount_usd` | number or null | announced amount in USD. Convert other currencies at a rough current rate and set `currency_note`. null when undisclosed |
| `amount_disclosed` | boolean | false when the article says undisclosed / "hundreds of millions" with no figure |
| `currency_note` | string or null | e.g. "EUR 100M converted at 1.08" |
| `round_type` | string | one of: Pre-Seed, Seed, Series A, Series B, Series C, Series D, Series E, Series F, Series G, Series H, Growth, Venture - Unspecified, Debt, Grant, Other |
| `stage_bucket` | string | Seed = Pre-Seed/Seed/Angel; Early Stage Venture = Series A, Series B, or an unspecified venture round under $50M; Late Stage Venture = Series C and later, Growth, or an unspecified round at $50M and above; Other = debt, grants, fund closes, acquisitions, public companies |
| `announced_date` | string | YYYY-MM-DD of the announcement (press release date or earliest article date), not the run date |
| `lead_investors` | string[] | only investors the text calls "led by" / "lead". Empty array when not stated |
| `investors` | string[] | all named investors including leads. Empty array when none named |
| `hq_city` | string or null | |
| `hq_state` | string or null | two-letter US state when US |
| `hq_country` | string | ISO-2, e.g. "US", "GB", "IL". "unknown" if truly unknown. Crunchbase lists the headquarters on the company profile, so a company that is dual-headquartered with a US city (e.g. "São Paulo and Atlanta", "Tel Aviv and New York") or whose press release dateline is a US city is `US`. Foreign-founded companies that moved their HQ to the US are `US` |
| `is_ai_ml` | boolean | Match Crunchbase's industry tagging, which is broad: a company is tagged Artificial Intelligence or Machine Learning when its own profile or press release says the product is AI-powered, AI-driven, AI-native, uses machine learning, or ships AI agents or copilots, whatever the vertical (fintech, insurance, health care, mortgage servicing, FinOps, radiology all count). Also true for robotics/autonomy, AI infrastructure (chips, inference, GPU cloud, data centers and power or cooling built for AI workloads) and quantum computing marketed for AI. Set false only when the article and the company's own description contain no AI/ML claim about the product, and always false for VC funds and public companies. When unsure and the round is at least $15M, do one web lookup of the company's homepage or press release before choosing false |
| `ai_ml_rationale` | string | one short sentence |
| `description` | string | what the company does, max 200 characters. No process notes (put those in the top-level `notes`) |
| `confidence` | number | 0 to 1 for the row as a whole |
| `evidence` | object | `{ "amount": "<exact quoted span>", "round": "<span or null>", "lead": "<span or null>", "investors": "<span or null>" }`. Spans must appear verbatim in the article text, snippet or title |
| `source_urls` | string[] | publisher URLs (resolved_url when present, else the feed link) |
| `exclude_reason` | string or null | set when the row is clearly out of scope so the merge can log it: "fund", "acquisition", "public-company", "not-funding", "duplicate" |

## Rules

1. Never invent. If the article does not name a lead, `lead_investors` is `[]`. If it does not give a figure, `amount_usd` is null.
2. Every investor name must have a supporting span in `evidence.investors` or `evidence.lead`. The validator drops names it cannot find in the text.
3. One row per round. If two groups turn out to be the same round, emit one row and list both `group_key`s in `notes`.
4. Keep rows even when they are out of scope (non-US, below $15M, not AI, fund close). Set `exclude_reason` or let the merge step filter. The site shows in-scope rows by default and keeps the rest behind a toggle.
5. When `text_status` is not `ok` and the title plus snippet are not enough to fill `amount_usd`, `round_type` and `hq_country`, and the amount hint is at least $15M, the routine may use WebSearch and WebFetch to find the publisher article or press release. Budget: at most 15 such lookups per run, highest amounts first.
6. Dates: prefer the press release dateline. Google News `published_at` is a fallback.
