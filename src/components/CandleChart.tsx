import { useEffect, useRef } from 'react'
import { CandlestickSeries, ColorType, LineSeries, createChart, type IChartApi, type ISeriesApi, type CandlestickData, type LineData, type UTCTimestamp, type IPriceLine } from 'lightweight-charts'
import { calculateEmaSeries, type ChartPresetResult } from '../../shared/automation'
import type { AnalysisResponse, Candle, DerivedContext } from '../../shared/types'

interface CandleChartProps {
  symbol: string
  timeframe: string
  candles: Candle[]
  analysis: AnalysisResponse | null
  chartPreset: ChartPresetResult | null
  context: DerivedContext
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

function toLineData(candles: Candle[], values: Array<number | null>): LineData[] {
  return values.flatMap((value, index) => (value === null
    ? []
    : [{
        time: Math.floor(candles[index].time / 1000) as UTCTimestamp,
        value,
      }]))
}

export function CandleChart({ symbol, timeframe, candles, analysis, chartPreset, context }: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])
  const overlaySeriesRef = useRef<ISeriesApi<'Line'>[]>([])
  const shouldAutoFitRef = useRef(true)

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
        rightOffset: 14,
        fixRightEdge: false,
        shiftVisibleRangeOnNewBar: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
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
      overlaySeriesRef.current = []
    }
  }, [])

  useEffect(() => {
    if (!seriesRef.current) {
      return
    }

    seriesRef.current.setData(toChartData(candles))
    if (shouldAutoFitRef.current) {
      chartRef.current?.timeScale().fitContent()
      shouldAutoFitRef.current = false
    }
  }, [candles])

  useEffect(() => {
    shouldAutoFitRef.current = true
  }, [symbol, timeframe])

  useEffect(() => {
    const series = seriesRef.current

    if (!series) {
      return
    }

    priceLinesRef.current.forEach((line) => series.removePriceLine(line))
    priceLinesRef.current = []
    overlaySeriesRef.current.forEach((overlay) => chartRef.current?.removeSeries(overlay))
    overlaySeriesRef.current = []

    const nextLines: IPriceLine[] = []

    if (analysis) {
      nextLines.push(
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
      )
    }

    if (chartPreset) {
      nextLines.push(
        ...context.supportLevels.slice(0, 2).map((value, index) => series.createPriceLine({
          price: value,
          color: 'rgba(45, 212, 191, 0.70)',
          lineStyle: 4,
          lineWidth: 1,
          title: `S${index + 1}`,
        })),
        ...context.resistanceLevels.slice(-2).map((value, index) => series.createPriceLine({
          price: value,
          color: 'rgba(248, 113, 113, 0.72)',
          lineStyle: 4,
          lineWidth: 1,
          title: `R${index + 1}`,
        })),
      )

      if (chartPreset.zone.toLowerCase().includes('golden pocket') && context.recentSwingHighs.length > 0 && context.recentSwingLows.length > 0) {
        const swingHigh = context.recentSwingHighs.at(-1) ?? context.currentPrice
        const swingLow = context.recentSwingLows.at(0) ?? context.currentPrice
        const range = swingHigh - swingLow
        const fib618 = swingHigh - (range * 0.618)
        const fib65 = swingHigh - (range * 0.65)
        nextLines.push(
          series.createPriceLine({
            price: fib618,
            color: 'rgba(250, 204, 21, 0.85)',
            lineStyle: 2,
            lineWidth: 1,
            title: 'Fib 0.618',
          }),
          series.createPriceLine({
            price: fib65,
            color: 'rgba(250, 204, 21, 0.55)',
            lineStyle: 2,
            lineWidth: 1,
            title: 'Fib 0.65',
          }),
        )
      }

      const lowerIndicators = chartPreset.indicators.map((item) => item.toLowerCase())

      if (lowerIndicators.some((item) => item.includes('ema 20') || item.includes('ema20'))) {
        const ema20Series = chartRef.current?.addSeries(LineSeries, {
          color: '#facc15',
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        })
        ema20Series?.setData(toLineData(candles, calculateEmaSeries(candles, 20)))
        if (ema20Series) {
          overlaySeriesRef.current.push(ema20Series)
        }
      }

      if (lowerIndicators.some((item) => item.includes('ema 50') || item.includes('ema50'))) {
        const ema50Series = chartRef.current?.addSeries(LineSeries, {
          color: '#38bdf8',
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        })
        ema50Series?.setData(toLineData(candles, calculateEmaSeries(candles, 50)))
        if (ema50Series) {
          overlaySeriesRef.current.push(ema50Series)
        }
      }
    }

    priceLinesRef.current = nextLines
  }, [analysis, chartPreset, candles, context])

  return <div ref={containerRef} className="chart-panel__plot" aria-label="Live market chart" />
}
