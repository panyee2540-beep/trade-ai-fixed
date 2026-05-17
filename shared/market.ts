import { DEFAULT_CANDLE_LIMIT, FEATURED_SYMBOLS, MARKET_INTERVALS, MAX_CANDLE_LIMIT } from './constants'
import type { Candle, MarketCandlesResponse, MarketInterval, MarketSearchResponse, MarketSummary, MarketSymbol } from './types'

const BINANCE_API_BASE = 'https://api.binance.com'

interface BinanceExchangeSymbol {
  symbol: string
  status: string
  baseAsset: string
  quoteAsset: string
  isSpotTradingAllowed: boolean
}

interface BinanceExchangeInfo {
  symbols: BinanceExchangeSymbol[]
}

interface BinanceTickerResponse {
  lastPrice: string
  priceChangePercent: string
  highPrice: string
  lowPrice: string
  volume: string
  quoteVolume: string
}

function toNumber(value: string | number) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function validateInterval(interval: string): MarketInterval {
  if (MARKET_INTERVALS.includes(interval as MarketInterval)) {
    return interval as MarketInterval
  }

  return '1h'
}

function normalizeSymbolRecord(symbol: BinanceExchangeSymbol): MarketSymbol {
  return {
    symbol: symbol.symbol,
    baseAsset: symbol.baseAsset,
    quoteAsset: symbol.quoteAsset,
    displayName: `${symbol.baseAsset}/${symbol.quoteAsset}`,
  }
}

async function fetchBinanceJson<T>(path: string) {
  const response = await fetch(`${BINANCE_API_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Binance request failed: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as T
}

async function fetchExchangeInfo() {
  const data = await fetchBinanceJson<BinanceExchangeInfo>('/api/v3/exchangeInfo')

  return data.symbols
    .filter((symbol) => symbol.status === 'TRADING' && symbol.isSpotTradingAllowed && symbol.quoteAsset === 'USDT')
    .map(normalizeSymbolRecord)
}

export async function searchMarketSymbols(query: string): Promise<MarketSearchResponse> {
  const normalizedQuery = query.trim().toUpperCase()
  const symbols = await fetchExchangeInfo()

  const filtered = normalizedQuery.length === 0
    ? FEATURED_SYMBOLS
        .map((featuredSymbol) => symbols.find((symbol) => symbol.symbol === featuredSymbol))
        .filter((symbol): symbol is MarketSymbol => Boolean(symbol))
    : symbols.filter((symbol) =>
        symbol.symbol.includes(normalizedQuery)
        || symbol.baseAsset.includes(normalizedQuery)
        || symbol.displayName.replace('/', '').includes(normalizedQuery),
      )
        .slice(0, 20)

  return {
    query,
    items: filtered,
  }
}

export async function fetchMarketSummary(symbol: string): Promise<MarketSummary> {
  const ticker = await fetchBinanceJson<BinanceTickerResponse>(`/api/v3/ticker/24hr?symbol=${symbol}`)

  return {
    symbol,
    currentPrice: toNumber(ticker.lastPrice),
    changePercent24h: toNumber(ticker.priceChangePercent),
    high24h: toNumber(ticker.highPrice),
    low24h: toNumber(ticker.lowPrice),
    volume24h: toNumber(ticker.volume),
    quoteVolume24h: toNumber(ticker.quoteVolume),
  }
}

export async function fetchMarketCandles(symbol: string, interval: string, limit = DEFAULT_CANDLE_LIMIT): Promise<MarketCandlesResponse> {
  const normalizedInterval = validateInterval(interval)
  const normalizedLimit = Math.min(Math.max(Number(limit) || DEFAULT_CANDLE_LIMIT, 40), MAX_CANDLE_LIMIT)
  const encodedSymbol = encodeURIComponent(symbol.toUpperCase())

  const [candlesRaw, summary] = await Promise.all([
    fetchBinanceJson<Array<[number, string, string, string, string, string]>>(
      `/api/v3/uiKlines?symbol=${encodedSymbol}&interval=${normalizedInterval}&limit=${normalizedLimit}`,
    ),
    fetchMarketSummary(encodedSymbol),
  ])

  const candles: Candle[] = candlesRaw.map((entry) => ({
    time: entry[0],
    open: toNumber(entry[1]),
    high: toNumber(entry[2]),
    low: toNumber(entry[3]),
    close: toNumber(entry[4]),
    volume: toNumber(entry[5]),
  }))

  return {
    symbol: encodedSymbol,
    interval: normalizedInterval,
    candles,
    summary,
    fetchedAt: new Date().toISOString(),
  }
}
