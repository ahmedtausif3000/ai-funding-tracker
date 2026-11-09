# Backfill run 2026-11-09 (local, 8-day window)

- Why: the seed run used a 3-day window and missed rounds announced Nov 2-6 (e.g. Corridian $38M, Kalepa $75M, Humble Robotics $51M). Also fixed a prefilter bug where bare "$38M" headlines failed the funding-context check.
- Feeds 16/16 OK. 49 groups, 80 candidates, 38 articles fetched (Google rate-limited; publisher feeds + Bing covered the rest). Extraction used 25 web lookups.
- 61 rows extracted, 61 accepted → 60 inserted, 1 merged (Mavria amount corrected $130M → $100M Seed led by Paradigm, HQ Houston TX, per the company's own announcement). Record now 126 rounds, 44 in view.
- In-scope rounds added: Modal Labs $750M D, Bedrock Robotics $600M C, Icon $200M D, Laza Medical up to $160M B, Ocient $100M C, Foundry Robotics $100M A, Kalepa $75M B, Tutor Intelligence $75M B, Daytona $60M B, Casap $56M B, Stuut $52.5M B, Humble Robotics $51M A, Ultra $50M A, Formic $50M B, Lazarus AI $43M, Reframe Systems $40M, Corridian $38M Seed, Larridin $30M A, Gritt $26M A, Origin $20M Seed, Brava Security $15M Seed.
- Caveats: Reframe (Aug) and Gritt (Jul) dates are month-level from a Crunchbase sector round-up. Several HQs came from the extractor's knowledge rather than text (noted in confidence).
