import { z } from 'zod'
import { MARKET_INTERVALS } from './constants'

const finiteNumber = z
  .number()
  .finite()

export const marketIntervalSchema = z.enum(MARKET_INTERVALS)

export const candleSchema = z.object({
  time: z.number().int().positive(),
  open: finiteNumber,
  high: finiteNumber,
  low: finiteNumber,
  close: finiteNumber,
  volume: finiteNumber,
})

export const marketSearchItemSchema = z.object({
  symbol: z.string().min(3),
  baseAsset: z.string().min(1),
  quoteAsset: z.string().min(1),
  displayName: z.string().min(1),
})

export const marketSummarySchema = z.object({
  symbol: z.string().min(3),
  currentPrice: finiteNumber,
  changePercent24h: finiteNumber,
  high24h: finiteNumber,
  low24h: finiteNumber,
  volume24h: finiteNumber,
  quoteVolume24h: finiteNumber,
})

export const priceZoneSchema = z.object({
  label: z.string().min(1),
  low: finiteNumber,
  high: finiteNumber,
  rationale: z.string().min(1),
})

export const analysisResponseSchema = z.object({
  symbol: z.string().min(3),
  timeframe: marketIntervalSchema,
  trend_bias: z.enum(['bullish', 'bearish', 'sideways']),
  higher_timeframe_bias: z.enum(['bullish', 'bearish', 'sideways', 'mixed']),
  wave_count_summary: z.string().min(1),
  market_structure: z.string().min(1),
  probability_bullish: z.number().min(0).max(100),
  probability_bearish: z.number().min(0).max(100),
  probability_sideways: z.number().min(0).max(100),
  entry_zone: priceZoneSchema,
  stop_zone: priceZoneSchema,
  target_zones: z.array(priceZoneSchema).min(1),
  invalidation: z.string().min(1),
  confidence: z.enum(['low', 'medium', 'high']),
  support_levels: z.array(finiteNumber).max(6),
  resistance_levels: z.array(finiteNumber).max(6),
  execution_notes: z.array(z.string().min(1)).min(1),
  risk_notes: z.array(z.string().min(1)).min(1),
  disclaimer: z.string().min(1),
  generated_at: z.string().min(1),
})

export const analyzeWaveRequestSchema = z.object({
  symbol: z.string().min(3).max(20),
  timeframe: marketIntervalSchema,
  candles: z.array(candleSchema).min(40).max(500),
})
