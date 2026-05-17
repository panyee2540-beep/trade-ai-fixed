import type { Handler } from '@netlify/functions'
import { searchMarketSymbols } from '../../shared/market'
import { jsonResponse, methodNotAllowed } from './_utils'

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return methodNotAllowed(['GET'])
  }

  try {
    const query = event.queryStringParameters?.q ?? ''
    const result = await searchMarketSymbols(query)
    return jsonResponse(200, result)
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
