import type { AnalysisResponse, Candle, ConfidenceLevel, DerivedContext, MarketInterval, PriceZone, TrendBias } from './types'

function round(value: number, decimals = 4) {
  return Number(value.toFixed(decimals))
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function uniqueSorted(values: number[]) {
  return [...new Set(values.map((value) => round(value, 4)))].sort((a, b) => a - b)
}

export function deriveAnalysisContext(candles: Candle[]): DerivedContext {
  if (candles.length === 0) {
    return {
      currentPrice: 0,
      priceChangePercent: 0,
      averageRangePercent: 0,
      momentumPercent: 0,
      supportLevels: [],
      resistanceLevels: [],
      recentSwingHighs: [],
      recentSwingLows: [],
      structureBias: 'sideways',
    }
  }

  const closes = candles.map((candle) => candle.close)
  const currentPrice = closes.at(-1) ?? 0
  const lookback = candles.slice(-80)
  const baseline = closes[Math.max(0, closes.length - 50)] ?? currentPrice
  const priceChangePercent = baseline === 0 ? 0 : ((currentPrice - baseline) / baseline) * 100

  const rangePercents = lookback.map((candle) => {
    if (candle.low <= 0) {
      return 0
    }

    return ((candle.high - candle.low) / candle.low) * 100
  })

  const fastWindow = closes.slice(-12)
  const slowWindow = closes.slice(-36)
  const fastAverage = average(fastWindow)
  const slowAverage = average(slowWindow)
  const momentumPercent = slowAverage === 0 ? 0 : ((fastAverage - slowAverage) / slowAverage) * 100

  const swingHighs: number[] = []
  const swingLows: number[] = []
  const points = candles.slice(-60)

  for (let index = 2; index < points.length - 2; index += 1) {
    const current = points[index]
    const before = points.slice(index - 2, index)
    const after = points.slice(index + 1, index + 3)

    if (before.every((candle) => current.high >= candle.high) && after.every((candle) => current.high >= candle.high)) {
      swingHighs.push(current.high)
    }

    if (before.every((candle) => current.low <= candle.low) && after.every((candle) => current.low <= candle.low)) {
      swingLows.push(current.low)
    }
  }

  const recentSwingHighs = uniqueSorted(swingHighs).slice(-3)
  const recentSwingLows = uniqueSorted(swingLows).slice(0, 3)
  const supportLevels = recentSwingLows.length > 0 ? recentSwingLows : uniqueSorted(points.slice(-12).map((candle) => candle.low)).slice(0, 3)
  const resistanceLevels = recentSwingHighs.length > 0 ? recentSwingHighs : uniqueSorted(points.slice(-12).map((candle) => candle.high)).slice(-3)

  let structureBias: TrendBias = 'sideways'

  if (priceChangePercent > 1.2 && momentumPercent > 0.4) {
    structureBias = 'bullish'
  } else if (priceChangePercent < -1.2 && momentumPercent < -0.4) {
    structureBias = 'bearish'
  }

  return {
    currentPrice: round(currentPrice, 6),
    priceChangePercent: round(priceChangePercent, 2),
    averageRangePercent: round(average(rangePercents), 2),
    momentumPercent: round(momentumPercent, 2),
    supportLevels,
    resistanceLevels,
    recentSwingHighs,
    recentSwingLows,
    structureBias,
  }
}

function makeZone(label: string, center: number, paddingPercent: number, rationale: string): PriceZone {
  const halfWidth = center * paddingPercent

  return {
    label,
    low: round(center - halfWidth, 6),
    high: round(center + halfWidth, 6),
    rationale,
  }
}

export function buildFallbackAnalysis(symbol: string, timeframe: MarketInterval, candles: Candle[], reason: string): AnalysisResponse {
  const context = deriveAnalysisContext(candles)
  const lastPrice = context.currentPrice || candles.at(-1)?.close || 0
  const bias = context.structureBias
  const nearestSupport = context.supportLevels.at(-1) ?? lastPrice * 0.985
  const nearestResistance = context.resistanceLevels.at(0) ?? lastPrice * 1.015

  const entryCenter = bias === 'bearish' ? nearestResistance : nearestSupport
  const stopCenter = bias === 'bearish' ? nearestResistance * 1.01 : nearestSupport * 0.99
  const firstTarget = bias === 'bearish' ? nearestSupport : nearestResistance

  return {
    symbol,
    timeframe,
    trend_bias: bias,
    higher_timeframe_bias: bias,
    wave_count_summary: `Fallback view: the data quality is not clean enough for a confident Elliott wave count. ${reason}`,
    market_structure: `Price is behaving in a ${bias} to sideways structure based on simple momentum and swing analysis rather than a confirmed wave sequence.`,
    probability_bullish: bias === 'bullish' ? 46 : 27,
    probability_bearish: bias === 'bearish' ? 46 : 27,
    probability_sideways: 27,
    entry_zone: makeZone(
      bias === 'bearish' ? 'Sell-on-retest zone' : 'Buy-on-dip zone',
      entryCenter,
      0.004,
      bias === 'bearish'
        ? 'Use only if price retests resistance and momentum weakens.'
        : 'Use only if price revisits support and holds above it.',
    ),
    stop_zone: makeZone(
      'Invalidation stop zone',
      stopCenter,
      0.0025,
      'Place risk outside the local structure, not inside the noise.',
    ),
    target_zones: [
      makeZone(
        'Primary target',
        firstTarget,
        0.004,
        'First reaction zone based on recent opposing swing levels.',
      ),
      makeZone(
        'Stretch target',
        bias === 'bearish' ? firstTarget * 0.985 : firstTarget * 1.015,
        0.005,
        'Only realistic if momentum expands after the initial move.',
      ),
    ],
    invalidation:
      bias === 'bearish'
        ? 'Invalid if price reclaims recent resistance and holds above the local swing highs.'
        : 'Invalid if price loses the nearby support shelf and accepts below recent swing lows.',
    confidence: 'low',
    support_levels: context.supportLevels,
    resistance_levels: context.resistanceLevels,
    execution_notes: [
      'Treat this as a conditional setup, not a certainty call.',
      'Wait for confirmation near the zone instead of chasing the current candle.',
    ],
    risk_notes: [
      'Elliott wave labeling becomes unreliable in choppy or news-driven conditions.',
      'Lower timeframes can invalidate quickly when volatility expands.',
    ],
    disclaimer: 'Educational analysis only. This app does not guarantee outcomes and does not place trades.',
    generated_at: new Date().toISOString(),
  }
}

export function normalizeProbabilities(
  bullish: number,
  bearish: number,
  sideways: number,
) {
  const total = bullish + bearish + sideways

  if (total <= 0) {
    return {
      bullish: 33,
      bearish: 33,
      sideways: 34,
    }
  }

  const normalizedBullish = clamp(Math.round((bullish / total) * 100), 0, 100)
  const normalizedBearish = clamp(Math.round((bearish / total) * 100), 0, 100)
  const normalizedSideways = clamp(100 - normalizedBullish - normalizedBearish, 0, 100)

  return {
    bullish: normalizedBullish,
    bearish: normalizedBearish,
    sideways: normalizedSideways,
  }
}

export function confidenceLabelFromVolatility(averageRangePercent: number): ConfidenceLevel {
  if (averageRangePercent >= 4.5) {
    return 'low'
  }

  if (averageRangePercent >= 2.3) {
    return 'medium'
  }

  return 'high'
}
