import { useEffect, useRef } from 'react'
import { CandlestickSeries, ColorType, createChart, type IChartApi, type ISeriesApi, type CandlestickData, type UTCTimestamp, type IPriceLine } from 'lightweight-charts'
import type { AnalysisResponse, Candle } from '../../shared/types'

interface CandleChartProps {
  candles: Candle[]
  analysis: AnalysisResponse | null
}

function toChartData(candles: Candle[]): CandlestickData[] {
  return candles.map((candle) => ({
    time: Math.floor(candle.time / 1000) as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }))
}

export function CandleChart({ candles, analysis }: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])

  useEffect(() => {
    if (!containerRef.current || chartRef.current) {
      return
    }

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#0f172a' },
        textColor: '#d7e1f7',
        fontFamily: '"Space Grotesk", "Segoe UI", sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.10)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.10)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(148, 163, 184, 0.20)',
      },
      timeScale: {
        borderColor: 'rgba(148, 163, 184, 0.20)',
      },
      crosshair: {
        vertLine: {
          color: 'rgba(250, 204, 21, 0.25)',
        },
        horzLine: {
          color: 'rgba(250, 204, 21, 0.25)',
        },
      },
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#14b8a6',
      downColor: '#f97316',
      borderVisible: false,
      wickUpColor: '#14b8a6',
      wickDownColor: '#f97316',
    })

    chartRef.current = chart
    seriesRef.current = series

    return () => {
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
      priceLinesRef.current = []
    }
  }, [])

  useEffect(() => {
    if (!seriesRef.current) {
      return
    }

    seriesRef.current.setData(toChartData(candles))
    chartRef.current?.timeScale().fitContent()
  }, [candles])

  useEffect(() => {
    const series = seriesRef.current

    if (!series) {
      return
    }

    priceLinesRef.current.forEach((line) => series.removePriceLine(line))
    priceLinesRef.current = []

    if (!analysis) {
      return
    }

    const nextLines = [
      series.createPriceLine({
        price: analysis.entry_zone.low,
        color: '#facc15',
        lineStyle: 2,
        lineWidth: 1,
        title: 'Entry low',
      }),
      series.createPriceLine({
        price: analysis.entry_zone.high,
        color: '#facc15',
        lineStyle: 2,
        lineWidth: 1,
        title: 'Entry high',
      }),
      series.createPriceLine({
        price: analysis.stop_zone.low,
        color: '#fb7185',
        lineStyle: 3,
        lineWidth: 1,
        title: 'Stop',
      }),
      ...analysis.target_zones.slice(0, 2).map((targetZone, index) =>
        series.createPriceLine({
          price: targetZone.high,
          color: '#38bdf8',
          lineStyle: 0,
          lineWidth: 1,
          title: `T${index + 1}`,
        }),
      ),
    ]

    priceLinesRef.current = nextLines
  }, [analysis])

  return <div ref={containerRef} className="chart-panel__plot" aria-label="Live market chart" />
}
