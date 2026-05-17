import type { DEFAULT_INTERVAL, DEFAULT_SYMBOL, MARKET_INTERVALS } from './constants'

export type MarketInterval = (typeof MARKET_INTERVALS)[number]

export type TrendBias = 'bullish' | 'bearish' | 'sideways'
export type ConfidenceLevel = 'low' | 'medium' | 'high'

export interface MarketSymbol {
  symbol: string
  baseAsset: string
  quoteAsset: string
  displayName: string
}

export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface MarketSummary {
  symbol: string
  currentPrice: number
  changePercent24h: number
  high24h: number
  low24h: number
  volume24h: number
  quoteVolume24h: number
}

export interface DerivedContext {
  currentPrice: number
  priceChangePercent: number
  averageRangePercent: number
  momentumPercent: number
  supportLevels: number[]
  resistanceLevels: number[]
  recentSwingHighs: number[]
  recentSwingLows: number[]
  structureBias: TrendBias
}

export interface PriceZone {
  label: string
  low: number
  high: number
  rationale: string
}

export interface AnalysisResponse {
  symbol: string
  timeframe: MarketInterval
  trend_bias: TrendBias
  higher_timeframe_bias: TrendBias | 'mixed'
  wave_count_summary: string
  market_structure: string
  probability_bullish: number
  probability_bearish: number
  probability_sideways: number
  entry_zone: PriceZone
  stop_zone: PriceZone
  target_zones: PriceZone[]
  invalidation: string
  confidence: ConfidenceLevel
  support_levels: number[]
  resistance_levels: number[]
  execution_notes: string[]
  risk_notes: string[]
  disclaimer: string
  generated_at: string
}

export interface MarketSearchResponse {
  query: string
  items: MarketSymbol[]
}

export interface MarketCandlesResponse {
  symbol: string
  interval: MarketInterval
  candles: Candle[]
  summary: MarketSummary
  fetchedAt: string
}

export interface AnalyzeWaveRequest {
  symbol: string
  timeframe: MarketInterval
  candles: Candle[]
}

export interface AppDefaults {
  symbol: typeof DEFAULT_SYMBOL
  interval: typeof DEFAULT_INTERVAL
}
