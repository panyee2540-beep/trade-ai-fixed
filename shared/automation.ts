import type { Candle, DerivedContext, MarketInterval } from './types'
import { deriveAnalysisContext } from './analysis'

export interface ChartPresetConfig {
  asset: string
  timeframe: MarketInterval
  indicators: string[]
  tools: string[]
  zone: string
  patterns: string[]
  layout: string
  comparisons: string[]
}

export interface IndicatorSnapshot {
  name: string
  value: string
  note: string
}

export interface ChartPresetResult extends ChartPresetConfig {
  appliedAt: string
  indicatorSnapshots: IndicatorSnapshot[]
  notes: string[]
}

export interface BacktestConfig {
  asset: string
  timeframe: MarketInterval
  fastPeriod: number
  slowPeriod: number
  stopLossPercent: number
  takeProfitPercent: number
}

export interface BacktestResult {
  asset: string
  timeframe: MarketInterval
  trades: number
  winners: number
  losers: number
  winRate: number
  profitFactor: number
  netReturnPercent: number
  maxDrawdownPercent: number
  avgTradePercent: number
  bestTradePercent: number
  worstTradePercent: number
}

export interface OptimizationResult {
  config: BacktestConfig
  result: BacktestResult
  optimizedMetric: 'profitFactor' | 'winRate'
}

export interface ScanResult {
  asset: string
  timeframe: MarketInterval
  bias: 'bullish' | 'mixed' | 'bearish'
  score: number
  summary: string
  priceChangePercent: number
  momentumPercent: number
  breakout: boolean
}

function round(value: number, decimals = 2) {
  return Number(value.toFixed(decimals))
}

function normalizePeriod(value: number, fallback: number) {
  const parsed = Math.floor(value)
  return Number.isFinite(parsed) && parsed > 1 ? parsed : fallback
}

function closingPrices(candles: Candle[]) {
  return candles.map((candle) => candle.close)
}

export function parseCommaList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function normalizeIntervalInput(value: string): MarketInterval {
  const cleaned = value.trim().toLowerCase()
  const aliases: Record<string, MarketInterval> = {
    '1m': '1m',
    '3m': '3m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1h',
    '4h': '4h',
    '1d': '1d',
    '60m': '1h',
    '240m': '4h',
    daily: '1d',
  }

  return aliases[cleaned] ?? '1h'
}

export function normalizeSymbolInput(value: string) {
  const cleaned = value.trim().toUpperCase().replace(/\s+/g, '').replace('/', '')

  if (!cleaned) {
    return 'BTCUSDT'
  }

  return cleaned.endsWith('USDT') ? cleaned : `${cleaned}USDT`
}

export function calculateEmaSeries(candles: Candle[], period: number) {
  const normalizedPeriod = normalizePeriod(period, 20)
  const multiplier = 2 / (normalizedPeriod + 1)
  const values = closingPrices(candles)
  const result: Array<number | null> = []
  let ema: number | null = null

  values.forEach((close, index) => {
    if (ema === null) {
      ema = close
      result.push(index < normalizedPeriod - 1 ? null : close)
      return
    }

    ema = ((close - ema) * multiplier) + ema
    result.push(index < normalizedPeriod - 1 ? null : ema)
  })

  return result
}

export function calculateRsi(candles: Candle[], period = 14) {
  const normalizedPeriod = normalizePeriod(period, 14)

  if (candles.length <= normalizedPeriod) {
    return null
  }

  let gains = 0
  let losses = 0

  for (let index = 1; index <= normalizedPeriod; index += 1) {
    const change = candles[index].close - candles[index - 1].close
    if (change >= 0) {
      gains += change
    } else {
      losses += Math.abs(change)
    }
  }

  let avgGain = gains / normalizedPeriod
  let avgLoss = losses / normalizedPeriod

  for (let index = normalizedPeriod + 1; index < candles.length; index += 1) {
    const change = candles[index].close - candles[index - 1].close
    const gain = Math.max(change, 0)
    const loss = Math.max(-change, 0)
    avgGain = ((avgGain * (normalizedPeriod - 1)) + gain) / normalizedPeriod
    avgLoss = ((avgLoss * (normalizedPeriod - 1)) + loss) / normalizedPeriod
  }

  if (avgLoss === 0) {
    return 100
  }

  const rs = avgGain / avgLoss
  return 100 - (100 / (1 + rs))
}

export function calculateMacd(candles: Candle[]) {
  if (candles.length < 35) {
    return null
  }

  const ema12 = calculateEmaSeries(candles, 12)
  const ema26 = calculateEmaSeries(candles, 26)
  const macdLine = ema12.map((value, index) => {
    if (value === null || ema26[index] === null) {
      return null
    }

    return value - (ema26[index] ?? 0)
  })

  const signalSource = macdLine.filter((value): value is number => value !== null)

  if (signalSource.length < 9) {
    return null
  }

  const signalCandles = signalSource.map((value, index) => ({
    time: index,
    open: value,
    high: value,
    low: value,
    close: value,
    volume: 0,
  }))
  const signalEma = calculateEmaSeries(signalCandles, 9).filter((value): value is number => value !== null)
  const latestMacd = macdLine.at(-1)
  const latestSignal = signalEma.at(-1)

  if (latestMacd === null || latestMacd === undefined || latestSignal === undefined) {
    return null
  }

  return {
    line: latestMacd,
    signal: latestSignal,
    histogram: latestMacd - latestSignal,
  }
}

export function buildChartPreset(candles: Candle[], config: ChartPresetConfig): ChartPresetResult {
  const context = deriveAnalysisContext(candles)
  const lowerIndicators = config.indicators.map((item) => item.toLowerCase())
  const snapshots: IndicatorSnapshot[] = []

  if (lowerIndicators.some((item) => item.includes('ema 20') || item.includes('ema20'))) {
    const latest = calculateEmaSeries(candles, 20).at(-1)
    if (latest !== null && latest !== undefined) {
      snapshots.push({
        name: 'EMA 20',
        value: latest.toFixed(2),
        note: 'Fast trend filter added to the chart overlay.',
      })
    }
  }

  if (lowerIndicators.some((item) => item.includes('ema 50') || item.includes('ema50'))) {
    const latest = calculateEmaSeries(candles, 50).at(-1)
    if (latest !== null && latest !== undefined) {
      snapshots.push({
        name: 'EMA 50',
        value: latest.toFixed(2),
        note: 'Slow trend filter added to the chart overlay.',
      })
    }
  }

  if (lowerIndicators.some((item) => item.includes('rsi'))) {
    const rsi = calculateRsi(candles)
    if (rsi !== null) {
      snapshots.push({
        name: 'RSI 14',
        value: rsi.toFixed(1),
        note: rsi >= 70 ? 'Overbought momentum' : rsi <= 30 ? 'Oversold momentum' : 'Neutral momentum',
      })
    }
  }

  if (lowerIndicators.some((item) => item.includes('macd'))) {
    const macd = calculateMacd(candles)
    if (macd) {
      snapshots.push({
        name: 'MACD',
        value: `${Number(macd.line).toFixed(2)} / ${Number(macd.signal).toFixed(2)}`,
        note: macd.histogram >= 0 ? 'Momentum expanding upward' : 'Momentum leaning downward',
      })
    }
  }

  const notes = [
    `${context.structureBias} structure bias detected from recent momentum and swing context.`,
    `Zone focus: ${config.zone}.`,
    `Pattern focus: ${config.patterns.join(', ') || 'none selected'}.`,
    `Comparison watchlist: ${config.comparisons.join(', ') || 'none selected'}.`,
  ]

  return {
    ...config,
    appliedAt: new Date().toISOString(),
    indicatorSnapshots: snapshots,
    notes,
  }
}

function crossesAbove(previousFast: number | null, previousSlow: number | null, currentFast: number | null, currentSlow: number | null) {
  return previousFast !== null
    && previousSlow !== null
    && currentFast !== null
    && currentSlow !== null
    && previousFast <= previousSlow
    && currentFast > currentSlow
}

function crossesBelow(previousFast: number | null, previousSlow: number | null, currentFast: number | null, currentSlow: number | null) {
  return previousFast !== null
    && previousSlow !== null
    && currentFast !== null
    && currentSlow !== null
    && previousFast >= previousSlow
    && currentFast < currentSlow
}

export function runEmaBacktest(candles: Candle[], config: BacktestConfig): BacktestResult {
  const fastPeriod = normalizePeriod(config.fastPeriod, 20)
  const slowPeriod = normalizePeriod(config.slowPeriod, 50)
  const stopLossPercent = Math.max(config.stopLossPercent, 0.2) / 100
  const takeProfitPercent = Math.max(config.takeProfitPercent, 0.2) / 100
  const emaFast = calculateEmaSeries(candles, fastPeriod)
  const emaSlow = calculateEmaSeries(candles, slowPeriod)

  let equity = 100
  let peakEquity = 100
  let maxDrawdown = 0
  let position: { entry: number } | null = null
  const tradeReturns: number[] = []

  for (let index = 1; index < candles.length; index += 1) {
    const candle = candles[index]
    const previousFast = emaFast[index - 1]
    const previousSlow = emaSlow[index - 1]
    const currentFast = emaFast[index]
    const currentSlow = emaSlow[index]

    if (!position && crossesAbove(previousFast, previousSlow, currentFast, currentSlow)) {
      position = { entry: candle.close }
      continue
    }

    if (!position) {
      continue
    }

    const stopLevel = position.entry * (1 - stopLossPercent)
    const targetLevel = position.entry * (1 + takeProfitPercent)
    let exitPrice: number | null = null

    if (candle.low <= stopLevel) {
      exitPrice = stopLevel
    } else if (candle.high >= targetLevel) {
      exitPrice = targetLevel
    } else if (crossesBelow(previousFast, previousSlow, currentFast, currentSlow)) {
      exitPrice = candle.close
    }

    if (exitPrice === null) {
      continue
    }

    const tradeReturn = ((exitPrice - position.entry) / position.entry) * 100
    tradeReturns.push(tradeReturn)
    equity *= 1 + (tradeReturn / 100)
    peakEquity = Math.max(peakEquity, equity)
    maxDrawdown = Math.max(maxDrawdown, ((peakEquity - equity) / peakEquity) * 100)
    position = null
  }

  const winners = tradeReturns.filter((value) => value > 0)
  const losers = tradeReturns.filter((value) => value <= 0)
  const grossProfit = winners.reduce((sum, value) => sum + value, 0)
  const grossLoss = losers.reduce((sum, value) => sum + Math.abs(value), 0)

  return {
    asset: config.asset,
    timeframe: config.timeframe,
    trades: tradeReturns.length,
    winners: winners.length,
    losers: losers.length,
    winRate: tradeReturns.length === 0 ? 0 : round((winners.length / tradeReturns.length) * 100),
    profitFactor: grossLoss === 0 ? round(grossProfit, 2) : round(grossProfit / grossLoss, 2),
    netReturnPercent: round(equity - 100, 2),
    maxDrawdownPercent: round(maxDrawdown, 2),
    avgTradePercent: tradeReturns.length === 0 ? 0 : round(tradeReturns.reduce((sum, value) => sum + value, 0) / tradeReturns.length, 2),
    bestTradePercent: tradeReturns.length === 0 ? 0 : round(Math.max(...tradeReturns), 2),
    worstTradePercent: tradeReturns.length === 0 ? 0 : round(Math.min(...tradeReturns), 2),
  }
}

export function optimizeEmaBacktest(candles: Candle[], config: BacktestConfig, metric: 'profitFactor' | 'winRate'): OptimizationResult {
  let bestConfig = config
  let bestResult = runEmaBacktest(candles, config)
  let bestScore = metric === 'profitFactor' ? bestResult.profitFactor : bestResult.winRate

  for (let fast = 8; fast <= 24; fast += 4) {
    for (let slow = 30; slow <= 80; slow += 10) {
      if (fast >= slow) {
        continue
      }

      const candidateConfig: BacktestConfig = {
        ...config,
        fastPeriod: fast,
        slowPeriod: slow,
      }
      const candidateResult = runEmaBacktest(candles, candidateConfig)
      const candidateScore = metric === 'profitFactor' ? candidateResult.profitFactor : candidateResult.winRate

      if (candidateScore > bestScore) {
        bestScore = candidateScore
        bestConfig = candidateConfig
        bestResult = candidateResult
      }
    }
  }

  return {
    config: bestConfig,
    result: bestResult,
    optimizedMetric: metric,
  }
}

function isBreakout(candles: Candle[]) {
  if (candles.length < 25) {
    return false
  }

  const latest = candles.at(-1)
  const previousHigh = Math.max(...candles.slice(-21, -1).map((candle) => candle.high))

  return Boolean(latest && latest.close >= previousHigh * 0.997)
}

export function buildScanResult(asset: string, timeframe: MarketInterval, context: DerivedContext, candles: Candle[]): ScanResult {
  const breakout = isBreakout(candles)
  const bullishScore = (context.structureBias === 'bullish' ? 2 : 0)
    + (context.momentumPercent > 0.4 ? 1 : 0)
    + (context.priceChangePercent > 1 ? 1 : 0)
    + (breakout ? 1 : 0)
  const bearishScore = (context.structureBias === 'bearish' ? 2 : 0)
    + (context.momentumPercent < -0.4 ? 1 : 0)
    + (context.priceChangePercent < -1 ? 1 : 0)

  let bias: ScanResult['bias'] = 'mixed'
  let summary = 'Mixed structure. Wait for cleaner confluence.'

  if (bullishScore >= 4) {
    bias = 'bullish'
    summary = breakout
      ? 'Bullish confluence with breakout pressure building.'
      : 'Bullish confluence with supportive momentum and structure.'
  } else if (bearishScore >= 3) {
    bias = 'bearish'
    summary = 'Bearish pressure is dominant across recent structure and momentum.'
  }

  return {
    asset,
    timeframe,
    bias,
    score: bullishScore - bearishScore,
    summary,
    priceChangePercent: context.priceChangePercent,
    momentumPercent: context.momentumPercent,
    breakout,
  }
}
