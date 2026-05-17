import { DEFAULT_CANDLE_LIMIT } from '../../shared/constants'
import { fetchMarketCandles, searchMarketSymbols } from '../../shared/market'
import { analysisResponseSchema } from '../../shared/schemas'
import type { AnalysisResponse, Candle } from '../../shared/types'

const ANALYSIS_CACHE_KEY = 'wavemap-analysis-cache-v1'
const ANALYSIS_CACHE_TTL_MS = 10 * 60 * 1000
const MAX_ANALYSIS_CANDLES = 140

interface CachedAnalysisEntry {
  cacheKey: string
  expiresAt: number
  response: AnalysisResponse
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error ?? `Request failed: ${response.status}`)
  }

  return (await response.json()) as T
}

export async function fetchSearchResults(query: string) {
  return searchMarketSymbols(query)
}

export async function fetchCandles(symbol: string, interval: string) {
  return fetchMarketCandles(symbol, interval, DEFAULT_CANDLE_LIMIT)
}

function buildAnalysisCacheKey(symbol: string, timeframe: string, candles: Candle[]) {
  const lastCandle = candles.at(-1)

  if (!lastCandle) {
    return `${symbol}:${timeframe}:empty`
  }

  return [
    symbol,
    timeframe,
    candles.length,
    lastCandle.time,
    lastCandle.close.toFixed(8),
  ].join(':')
}

function readAnalysisCache(cacheKey: string) {
  try {
    const raw = window.localStorage.getItem(ANALYSIS_CACHE_KEY)

    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as CachedAnalysisEntry

    if (parsed.cacheKey !== cacheKey || parsed.expiresAt < Date.now()) {
      return null
    }

    return analysisResponseSchema.parse(parsed.response)
  } catch {
    return null
  }
}

function writeAnalysisCache(cacheKey: string, response: AnalysisResponse) {
  try {
    const payload: CachedAnalysisEntry = {
      cacheKey,
      expiresAt: Date.now() + ANALYSIS_CACHE_TTL_MS,
      response,
    }

    window.localStorage.setItem(ANALYSIS_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore storage failures so analysis still works in private mode or locked-down browsers.
  }
}

export async function analyzeWave(symbol: string, timeframe: string, candles: Candle[]): Promise<AnalysisResponse> {
  const trimmedCandles = candles.slice(-MAX_ANALYSIS_CANDLES)
  const cacheKey = buildAnalysisCacheKey(symbol, timeframe, trimmedCandles)
  const cached = readAnalysisCache(cacheKey)

  if (cached) {
    return cached
  }

  const payload = await getJson<AnalysisResponse>('/.netlify/functions/analyze-wave', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      symbol,
      timeframe,
      candles: trimmedCandles,
    }),
  })

  const parsed = analysisResponseSchema.parse(payload)
  writeAnalysisCache(cacheKey, parsed)
  return parsed
}
