import type { Handler } from '@netlify/functions'
import { DEFAULT_CANDLE_LIMIT, DEFAULT_INTERVAL, DEFAULT_SYMBOL } from '../../shared/constants'
import { fetchMarketCandles } from '../../shared/market'
import { jsonResponse, methodNotAllowed } from './_utils'

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return methodNotAllowed(['GET'])
  }

  try {
    const query = event.queryStringParameters ?? {}
    const symbol = (query.symbol ?? DEFAULT_SYMBOL).toUpperCase()
    const interval = query.interval ?? DEFAULT_INTERVAL
    const limit = Number(query.limit ?? DEFAULT_CANDLE_LIMIT)
    const result = await fetchMarketCandles(symbol, interval, limit)
    return jsonResponse(200, result)
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
