# Elliott Wave Analysis Reference

## Objective
Use Elliott Wave theory as a disciplined framework for interpreting crypto market structure on the user-selected timeframe. The goal is not certainty. The goal is to produce a cautious, conditional market read with clear invalidation and risk context.

## Core Impulse Rules
- Prefer the cleanest valid count over the most creative count.
- In a standard impulse, Wave 2 should not retrace beyond the start of Wave 1.
- Wave 3 should not be the shortest of Waves 1, 3, and 5.
- Wave 4 should generally not overlap Wave 1 in a standard impulse.
- When price action overlaps excessively or becomes choppy, confidence should fall.

## Corrective Structure Guidance
- Distinguish among zigzags, flats, triangles, and combinations.
- Use alternation as a clue: if one correction was sharp, the next may be sideways.
- If the correction is unclear, state the preferred count and mention that an alternate interpretation remains possible.
- Never force an impulse count where corrective overlap dominates.

## Fibonacci Relationships
- Use Fibonacci levels as confluence, not proof.
- Common retracement areas to consider: 38.2%, 50.0%, 61.8%, and 78.6%.
- Common extension areas to consider: 100%, 127.2%, 161.8%, and 261.8%.
- Wave 3 often extends strongly. Wave 5 may truncate or extend depending on momentum and participation.

## Multi-Timeframe Reading Order
1. Read the broader structure first.
2. Use the selected timeframe for the actionable count.
3. Infer higher-timeframe bias from the larger swing structure and recent momentum.
4. If the lower timeframe disagrees with the broader structure, reduce confidence and make the setup conditional.

## Invalidation Logic
- Every preferred count must include a specific invalidation condition.
- Invalidation should be tied to market structure, not vague language.
- If a setup depends on support holding, then loss of that support should invalidate the view.
- If a setup depends on resistance rejecting price, then sustained acceptance above that resistance should invalidate the view.

## Confidence Rubric
- `high`: structure is clean, swing relationships are coherent, and invalidation is tight.
- `medium`: structure is readable but has at least one meaningful alternate count.
- `low`: overlapping candles, unstable momentum, or noisy swings make the count fragile.

## Output Requirements
- Return a structured JSON object only.
- Include:
  - `trend_bias`
  - `higher_timeframe_bias`
  - `wave_count_summary`
  - `market_structure`
  - `probability_bullish`
  - `probability_bearish`
  - `probability_sideways`
  - `entry_zone`
  - `stop_zone`
  - `target_zones`
  - `invalidation`
  - `confidence`
  - `support_levels`
  - `resistance_levels`
  - `execution_notes`
  - `risk_notes`
  - `disclaimer`

## Risk And Limitation Language
- Avoid guarantees and certainty words.
- Use conditional phrasing such as "if support holds" or "if rejection confirms".
- Emphasize that Elliott wave analysis is interpretive and probabilistic.
- Remind the user that setups can fail quickly in high-volatility or news-driven conditions.
- State clearly that the analysis is educational support, not automatic trading advice.
