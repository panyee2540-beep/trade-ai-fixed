import { analysisResponseSchema } from '../../shared/schemas'
import type { AnalysisResponse, Candle, MarketCandlesResponse, MarketSearchResponse } from '../../shared/types'

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path)

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  return (await response.json()) as T
}

export async function fetchSearchResults(query: string) {
  const params = new URLSearchParams({ q: query })
  return getJson<MarketSearchResponse>(`/.netlify/functions/market-search?${params.toString()}`)
}

export async function fetchCandles(symbol: string, interval: string) {
  const params = new URLSearchParams({
    symbol,
    interval,
    limit: '320',
  })

  return getJson<MarketCandlesResponse>(`/.netlify/functions/market-candles?${params.toString()}`)
}

export async function analyzeWave(symbol: string, timeframe: string, candles: Candle[]): Promise<AnalysisResponse> {
  const response = await fetch('/.netlify/functions/analyze-wave', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      symbol,
      timeframe,
      candles,
    }),
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error ?? `Analysis request failed: ${response.status}`)
  }

  const payload = await response.json()
  return analysisResponseSchema.parse(payload)
}
