import { useEffect, useEffectEvent, useState } from 'react'
import { fetchCandles } from '../lib/api'
import type { Candle, MarketCandlesResponse, MarketInterval } from '../../shared/types'

type ConnectionState = 'idle' | 'loading' | 'live' | 'reconnecting' | 'offline' | 'error'

interface MarketDataState {
  data: MarketCandlesResponse | null
  connectionState: ConnectionState
  error: string | null
}

function upsertRealtimeCandle(candles: Candle[], incoming: Candle) {
  const nextCandles = [...candles]
  const last = nextCandles.at(-1)

  if (!last) {
    return [incoming]
  }

  if (last.time === incoming.time) {
    nextCandles[nextCandles.length - 1] = incoming
    return nextCandles
  }

  if (last.time < incoming.time) {
    nextCandles.push(incoming)
  }

  return nextCandles.slice(-320)
}

export function useMarketData(symbol: string, interval: MarketInterval) {
  const [state, setState] = useState<MarketDataState>({
    data: null,
    connectionState: 'loading',
    error: null,
  })

  const applyRealtimeUpdate = useEffectEvent((incoming: Candle) => {
    setState((currentState) => {
      if (!currentState.data) {
        return currentState
      }

      return {
        ...currentState,
        connectionState: 'live',
        data: {
          ...currentState.data,
          candles: upsertRealtimeCandle(currentState.data.candles, incoming),
          summary: {
            ...currentState.data.summary,
            currentPrice: incoming.close,
          },
          fetchedAt: new Date().toISOString(),
        },
      }
    })
  })

  useEffect(() => {
    let active = true
    let socket: WebSocket | null = null
    let reconnectTimer: number | null = null

    async function load() {
      setState((currentState) => ({
        ...currentState,
        connectionState: currentState.data ? 'reconnecting' : 'loading',
        error: null,
      }))

      try {
        const payload = await fetchCandles(symbol, interval)

        if (!active) {
          return
        }

        setState({
          data: payload,
          connectionState: navigator.onLine ? 'live' : 'offline',
          error: null,
        })

        if (!navigator.onLine) {
          return
        }

        connectSocket()
      } catch (error) {
        if (!active) {
          return
        }

        setState({
          data: null,
          connectionState: navigator.onLine ? 'error' : 'offline',
          error: error instanceof Error ? error.message : 'Failed to load market data',
        })
      }
    }

    function clearReconnect() {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer)
      }
    }

    function connectSocket() {
      socket?.close()

      const streamName = `${symbol.toLowerCase()}@kline_${interval}`
      socket = new WebSocket(`wss://stream.binance.com:9443/ws/${streamName}`)

      socket.onopen = () => {
        if (!active) {
          return
        }

        setState((currentState) => ({
          ...currentState,
          connectionState: 'live',
        }))
      }

      socket.onmessage = (messageEvent) => {
        const payload = JSON.parse(messageEvent.data) as {
          e?: string
          k?: {
            t: number
            o: string
            h: string
            l: string
            c: string
            v: string
          }
        }

        if (payload.e !== 'kline' || !payload.k) {
          return
        }

        applyRealtimeUpdate({
          time: payload.k.t,
          open: Number(payload.k.o),
          high: Number(payload.k.h),
          low: Number(payload.k.l),
          close: Number(payload.k.c),
          volume: Number(payload.k.v),
        })
      }

      socket.onerror = () => {
        if (!active) {
          return
        }

        setState((currentState) => ({
          ...currentState,
          connectionState: navigator.onLine ? 'reconnecting' : 'offline',
        }))
      }

      socket.onclose = () => {
        if (!active) {
          return
        }

        if (!navigator.onLine) {
          setState((currentState) => ({
            ...currentState,
            connectionState: 'offline',
          }))
          return
        }

        setState((currentState) => ({
          ...currentState,
          connectionState: 'reconnecting',
        }))

        clearReconnect()
        reconnectTimer = window.setTimeout(connectSocket, 2000)
      }
    }

    function handleOnline() {
      if (!active) {
        return
      }

      load()
    }

    function handleOffline() {
      if (!active) {
        return
      }

      socket?.close()
      setState((currentState) => ({
        ...currentState,
        connectionState: 'offline',
      }))
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    void load()

    return () => {
      active = false
      clearReconnect()
      socket?.close()
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [symbol, interval])

  return state
}
