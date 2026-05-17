import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const fallbackPrompt = `# Elliott Wave Analysis Guide

## Objective
Produce a cautious Elliott-wave-informed market analysis for a crypto chart.

## Core Rules
- Label the clearest valid impulse or correction first.
- Never claim certainty when overlapping or noisy price action weakens the count.
- Wave 2 should not retrace beyond the origin of Wave 1 in an impulse.
- Wave 3 should not be the shortest among Waves 1, 3, and 5.
- Wave 4 should generally not overlap Wave 1 in a standard impulse.

## Corrective Guidance
- Recognize zigzags, flats, triangles, and combinations.
- When the count is ambiguous, state the preferred count and the main alternate.

## Fibonacci Guidance
- Consider common retracement and extension zones such as 38.2%, 50%, 61.8%, 100%, 161.8%, and 261.8%.
- Treat Fibonacci levels as confluence, not proof.

## Multi-Timeframe Logic
- Use the provided timeframe as the primary lens.
- Infer higher-timeframe bias from the overall structure and momentum summary.

## Output Rules
- Return only structured JSON.
- Give probabilities for bullish, bearish, and sideways outcomes.
- Provide a conditional entry zone, stop zone, target zones, invalidation, confidence, execution notes, and risk notes.
- Keep risk language explicit and avoid promises.
`

export function loadElliottWaveGuide() {
  const filePath = resolve(process.cwd(), 'docs', 'elliott-wave-analysis.md')

  if (existsSync(filePath)) {
    return readFileSync(filePath, 'utf8')
  }

  return fallbackPrompt
}
