import type { Handler } from '@netlify/functions'
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { analysisResponseSchema, analyzeWaveRequestSchema } from '../../shared/schemas'
import { buildFallbackAnalysis, confidenceLabelFromVolatility, deriveAnalysisContext, normalizeProbabilities } from '../../shared/analysis'
import { jsonResponse, methodNotAllowed } from './_utils'
import { loadElliottWaveGuide } from './_prompt'

const elliottWaveResponseSchema = analysisResponseSchema.extend({
  probability_bullish: z.number().min(0).max(100),
  probability_bearish: z.number().min(0).max(100),
  probability_sideways: z.number().min(0).max(100),
})

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return methodNotAllowed(['POST'])
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      return jsonResponse(500, {
        error: 'Missing OPENAI_API_KEY environment variable in Netlify Functions.',
      })
    }

    const parsedBody = analyzeWaveRequestSchema.safeParse(JSON.parse(event.body ?? '{}'))

    if (!parsedBody.success) {
      return jsonResponse(400, {
        error: 'Invalid analysis payload',
        details: parsedBody.error.flatten(),
      })
    }

    const { symbol, timeframe, candles } = parsedBody.data
    const derived = deriveAnalysisContext(candles)

    if (candles.length < 80 || derived.averageRangePercent > 10) {
      return jsonResponse(200, buildFallbackAnalysis(symbol, timeframe, candles, 'The recent data is too limited or too volatile for a reliable count.'))
    }

    const client = new OpenAI({ apiKey })
    const guide = loadElliottWaveGuide()

    const response = await client.responses.parse({
      model: 'gpt-5.4-mini',
      reasoning: {
        effort: 'medium',
      },
      text: {
        format: zodTextFormat(elliottWaveResponseSchema, 'elliott_wave_analysis'),
      },
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: `You are a careful crypto market analyst.

Use the following Elliott Wave markdown guide as your durable reference:

${guide}

Rules:
- Never present certainty.
- Prefer conditional language.
- If the wave count is weak, say so and reduce confidence.
- Respect the support and resistance context.
- Return only the structured JSON requested by the schema.`,
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({
                symbol,
                timeframe,
                derived,
                candles: candles.slice(-220),
              }),
            },
          ],
        },
      ],
    })

    const parsed = response.output_parsed

    if (!parsed) {
      return jsonResponse(200, buildFallbackAnalysis(symbol, timeframe, candles, 'The model did not return a parseable structured response.'))
    }

    const probabilities = normalizeProbabilities(
      parsed.probability_bullish,
      parsed.probability_bearish,
      parsed.probability_sideways,
    )

    const safeResponse = analysisResponseSchema.parse({
      ...parsed,
      symbol,
      timeframe,
      probability_bullish: probabilities.bullish,
      probability_bearish: probabilities.bearish,
      probability_sideways: probabilities.sideways,
      confidence:
        parsed.confidence === 'high' && derived.averageRangePercent > 3.8
          ? confidenceLabelFromVolatility(derived.averageRangePercent)
          : parsed.confidence,
      generated_at: new Date().toISOString(),
      disclaimer: parsed.disclaimer || 'Educational analysis only. This app does not guarantee outcomes and does not place trades.',
    })

    return jsonResponse(200, safeResponse)
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
