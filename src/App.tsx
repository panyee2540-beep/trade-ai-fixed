import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react'
import './App.css'
import { DEFAULT_INTERVAL, DEFAULT_SYMBOL, MARKET_INTERVALS } from '../shared/constants'
import { buildFallbackAnalysis, deriveAnalysisContext } from '../shared/analysis'
import {
  buildChartPreset,
  buildScanResult,
  normalizeIntervalInput,
  normalizeSymbolInput,
  optimizeEmaBacktest,
  parseCommaList,
  runEmaBacktest,
  type BacktestResult,
  type ChartPresetResult,
  type OptimizationResult,
  type ScanResult,
} from '../shared/automation'
import type { AnalysisResponse, Candle, MarketInterval, MarketSymbol } from '../shared/types'
import { analyzeWave, fetchCandles, fetchSearchResults, fetchSummary } from './lib/api'
import { useMarketData } from './hooks/useMarketData'
import { CandleChart } from './components/CandleChart'
import { StepCard } from './components/StepCard'
import { ProbabilityBar } from './components/ProbabilityBar'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type AppView = 'dashboard' | 'analysis' | 'automation'
type AutomationTool = 'chart' | 'strategy' | 'scan' | 'alert'
type AlertDirection = 'crosses above' | 'drops below'

interface AlertRule {
  id: string
  asset: string
  direction: AlertDirection
  price: number
  note: string
  channel: string
  analysisFocus: string
  status: 'armed' | 'triggered'
  lastPrice: number | null
  triggeredAt?: string
}

const ALERT_STORAGE_KEY = 'wavemap-alert-rules-v1'

function formatPrice(value: number) {
  if (value <= 0) {
    return '-'
  }

  if (value >= 1000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }

  if (value >= 1) {
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  }

  return value.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })
}

function formatPercent(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function symbolLabel(symbol: string) {
  return `${symbol.replace('USDT', '')}/USDT`
}

function biasToneClass(value: string) {
  if (value === 'bullish') {
    return 'tone tone--bullish'
  }

  if (value === 'bearish') {
    return 'tone tone--bearish'
  }

  return 'tone tone--sideways'
}

function safeJsonParse<T>(raw: string | null, fallback: T) {
  if (!raw) {
    return fallback
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function formatAnalysisError(message: string) {
  if (message.includes('429') || message.toLowerCase().includes('quota') || message.toLowerCase().includes('billing')) {
    return 'AI provider quota ของ OPENAI_API_KEY บน Netlify หมดหรือถูกจำกัดชั่วคราว (429) ไม่ใช่ token ในแชตนี้ ให้เติมเครดิต/เปิด billing แล้ว deploy ใหม่'
  }

  return message
}

function App() {
  const [activeView, setActiveView] = useState<AppView>('dashboard')
  const [openTool, setOpenTool] = useState<AutomationTool>('chart')
  const [selectedSymbol, setSelectedSymbol] = useState(DEFAULT_SYMBOL)
  const [timeframe, setTimeframe] = useState<MarketInterval>(DEFAULT_INTERVAL)
  const [searchQuery, setSearchQuery] = useState(symbolLabel(DEFAULT_SYMBOL))
  const deferredQuery = useDeferredValue(searchQuery)
  const [searchResults, setSearchResults] = useState<MarketSymbol[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null)
  const [analysisState, setAnalysisState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)

  const [chartAsset, setChartAsset] = useState('BTCUSDT')
  const [chartTimeframe, setChartTimeframe] = useState('1H')
  const [chartIndicators, setChartIndicators] = useState('EMA 20, EMA 50, RSI, MACD')
  const [chartTools, setChartTools] = useState('Trendlines, Fibonacci levels')
  const [chartZone, setChartZone] = useState('golden pocket zone')
  const [chartPatterns, setChartPatterns] = useState('order blocks, FVGs')
  const [chartLayout, setChartLayout] = useState('Focus + watchlist')
  const [chartComparisons, setChartComparisons] = useState('ETHUSDT, SOLUSDT')
  const [chartPreset, setChartPreset] = useState<ChartPresetResult | null>(null)
  const [chartAutomationStatus, setChartAutomationStatus] = useState<string | null>(null)
  const [comparisonResults, setComparisonResults] = useState<ScanResult[]>([])

  const [strategyAsset, setStrategyAsset] = useState('BTCUSDT')
  const [strategyTimeframe, setStrategyTimeframe] = useState('1H')
  const [strategyFastPeriod, setStrategyFastPeriod] = useState('20')
  const [strategySlowPeriod, setStrategySlowPeriod] = useState('50')
  const [strategyStopLoss, setStrategyStopLoss] = useState('5')
  const [strategyTakeProfit, setStrategyTakeProfit] = useState('15')
  const [strategyGoal, setStrategyGoal] = useState<'profitFactor' | 'winRate'>('profitFactor')
  const [strategyResult, setStrategyResult] = useState<BacktestResult | null>(null)
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null)
  const [strategyStatus, setStrategyStatus] = useState<string | null>(null)
  const [strategyRunning, setStrategyRunning] = useState(false)

  const [scanAssets, setScanAssets] = useState('BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, XRPUSDT')
  const [scanTimeframes, setScanTimeframes] = useState('1H, 4H')
  const [scanCondition, setScanCondition] = useState('bullish confluence / strong breakout')
  const [scanResults, setScanResults] = useState<ScanResult[]>([])
  const [scanStatus, setScanStatus] = useState<string | null>(null)
  const [scanRunning, setScanRunning] = useState(false)

  const [alertAsset, setAlertAsset] = useState('BTCUSDT')
  const [alertDirection, setAlertDirection] = useState<AlertDirection>('crosses above')
  const [alertPrice, setAlertPrice] = useState('90000')
  const [alertCondition, setAlertCondition] = useState('Watch for continuation or fast rejection.')
  const [alertChannel, setAlertChannel] = useState('Browser + in-app')
  const [alertAnalysisFocus, setAlertAnalysisFocus] = useState('breakout strength / reversal potential')
  const [alertRules, setAlertRules] = useState<AlertRule[]>(() => safeJsonParse<AlertRule[]>(
    typeof window === 'undefined' ? null : window.localStorage.getItem(ALERT_STORAGE_KEY),
    [],
  ))
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof window === 'undefined' || !('Notification' in window) ? 'unsupported' : Notification.permission,
  )

  const { data, connectionState, error } = useMarketData(selectedSymbol, timeframe)
  const derived = deriveAnalysisContext(data?.candles ?? [])

  const analysisReady = Boolean(analysis)
  const armedAlerts = useMemo(() => alertRules.filter((rule) => rule.status === 'armed'), [alertRules])
  const triggeredAlerts = useMemo(() => alertRules.filter((rule) => rule.status === 'triggered'), [alertRules])

  useEffect(() => {
    const controller = new AbortController()

    async function loadSearchResults() {
      try {
        const response = await fetchSearchResults(deferredQuery === symbolLabel(selectedSymbol) ? '' : deferredQuery)

        startTransition(() => {
          setSearchResults(response.items)
        })
      } catch {
        startTransition(() => {
          setSearchResults([])
        })
      }
    }

    void loadSearchResults()

    return () => {
      controller.abort()
    }
  }, [deferredQuery, selectedSymbol])

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify(alertRules))
  }, [alertRules])

  useEffect(() => {
    if (armedAlerts.length === 0) {
      return
    }

    let active = true

    async function pollAlerts() {
      const nextRules = await Promise.all(alertRules.map(async (rule) => {
        if (rule.status !== 'armed') {
          return rule
        }

        try {
          const summary = await fetchSummary(rule.asset)
          const currentPrice = summary.currentPrice

          if (rule.lastPrice === null) {
            return {
              ...rule,
              lastPrice: currentPrice,
            }
          }

          const crossedAbove = rule.direction === 'crosses above'
            && rule.lastPrice < rule.price
            && currentPrice >= rule.price
          const droppedBelow = rule.direction === 'drops below'
            && rule.lastPrice > rule.price
            && currentPrice <= rule.price

          if (!crossedAbove && !droppedBelow) {
            return {
              ...rule,
              lastPrice: currentPrice,
            }
          }

          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            // Surface a native alert while the app is open.
            new Notification(`WaveMap alert: ${symbolLabel(rule.asset)}`, {
              body: `${rule.direction} ${formatPrice(rule.price)}. Focus: ${rule.analysisFocus}`,
            })
          }

          return {
            ...rule,
            lastPrice: currentPrice,
            status: 'triggered' as const,
            triggeredAt: new Date().toISOString(),
          }
        } catch {
          return rule
        }
      }))

      if (!active) {
        return
      }

      setAlertRules(nextRules)
    }

    void pollAlerts()
    const timer = window.setInterval(() => {
      void pollAlerts()
    }, 20000)

    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [armedAlerts.length, alertRules])

  async function runAnalysisFor(symbol: string, nextTimeframe: MarketInterval, candles: Candle[]) {
    setAnalysisState('loading')
    setAnalysisError(null)

    try {
      const nextAnalysis = await analyzeWave(symbol, nextTimeframe, candles)
      startTransition(() => {
        setAnalysis(nextAnalysis)
        setAnalysisState('idle')
      })
      return nextAnalysis
    } catch (analysisFailure) {
      const message = analysisFailure instanceof Error ? analysisFailure.message : 'Analysis failed'
      const fallback = buildFallbackAnalysis(symbol, nextTimeframe, candles, message)
      startTransition(() => {
        setAnalysis(fallback)
        setAnalysisState('error')
        setAnalysisError(formatAnalysisError(message))
      })
      return fallback
    }
  }

  async function handleAnalyze() {
    if (!data?.candles?.length) {
      return
    }

    await runAnalysisFor(selectedSymbol, timeframe, data.candles)
    setActiveView('analysis')
  }

  async function handleInstall() {
    if (!installEvent) {
      return
    }

    await installEvent.prompt()
    await installEvent.userChoice
    setInstallEvent(null)
  }

  async function handleApplyChartAutomation() {
    const asset = normalizeSymbolInput(chartAsset)
    const nextTimeframe = normalizeIntervalInput(chartTimeframe)
    const indicators = parseCommaList(chartIndicators)
    const tools = parseCommaList(chartTools)
    const patterns = parseCommaList(chartPatterns)
    const comparisons = parseCommaList(chartComparisons).map(normalizeSymbolInput)

    setChartAutomationStatus('Applying chart preset...')
    setSelectedSymbol(asset)
    setTimeframe(nextTimeframe)
    setSearchQuery(symbolLabel(asset))
    setSearchOpen(false)
    setActiveView('dashboard')

    try {
      const market = await fetchCandles(asset, nextTimeframe)
      const preset = buildChartPreset(market.candles, {
        asset,
        timeframe: nextTimeframe,
        indicators,
        tools,
        zone: chartZone.trim() || 'focus zone',
        patterns,
        layout: chartLayout.trim() || 'Focus',
        comparisons,
      })

      setChartPreset(preset)
      await runAnalysisFor(asset, nextTimeframe, market.candles)

      if (comparisons.length > 0) {
        const scans = await Promise.all(comparisons.slice(0, 4).map(async (comparisonAsset) => {
          const comparisonMarket = await fetchCandles(comparisonAsset, nextTimeframe)
          const comparisonContext = deriveAnalysisContext(comparisonMarket.candles)
          return buildScanResult(comparisonAsset, nextTimeframe, comparisonContext, comparisonMarket.candles)
        }))
        setComparisonResults(scans)
      } else {
        setComparisonResults([])
      }

      setChartAutomationStatus(`Preset applied to ${symbolLabel(asset)} on ${nextTimeframe}.`)
      setActiveView('dashboard')
    } catch (chartError) {
      setChartAutomationStatus(chartError instanceof Error ? chartError.message : 'Failed to apply chart preset.')
    }
  }

  async function handleRunBacktest() {
    const asset = normalizeSymbolInput(strategyAsset)
    const nextTimeframe = normalizeIntervalInput(strategyTimeframe)
    const fastPeriod = Number(strategyFastPeriod)
    const slowPeriod = Number(strategySlowPeriod)
    const stopLossPercent = Number(strategyStopLoss)
    const takeProfitPercent = Number(strategyTakeProfit)

    setStrategyRunning(true)
    setStrategyStatus('Running local EMA backtest...')

    try {
      const market = asset === selectedSymbol && nextTimeframe === timeframe && data
        ? data
        : await fetchCandles(asset, nextTimeframe)

      const result = runEmaBacktest(market.candles, {
        asset,
        timeframe: nextTimeframe,
        fastPeriod,
        slowPeriod,
        stopLossPercent,
        takeProfitPercent,
      })

      setStrategyResult(result)
      setOptimizationResult(null)
      setStrategyStatus(`Backtest complete for ${symbolLabel(asset)} on ${nextTimeframe}.`)
    } catch (backtestError) {
      setStrategyStatus(backtestError instanceof Error ? backtestError.message : 'Backtest failed.')
    } finally {
      setStrategyRunning(false)
    }
  }

  async function handleOptimizeBacktest() {
    const asset = normalizeSymbolInput(strategyAsset)
    const nextTimeframe = normalizeIntervalInput(strategyTimeframe)
    const fastPeriod = Number(strategyFastPeriod)
    const slowPeriod = Number(strategySlowPeriod)
    const stopLossPercent = Number(strategyStopLoss)
    const takeProfitPercent = Number(strategyTakeProfit)

    setStrategyRunning(true)
    setStrategyStatus(`Optimizing for ${strategyGoal}...`)

    try {
      const market = asset === selectedSymbol && nextTimeframe === timeframe && data
        ? data
        : await fetchCandles(asset, nextTimeframe)

      const optimized = optimizeEmaBacktest(market.candles, {
        asset,
        timeframe: nextTimeframe,
        fastPeriod,
        slowPeriod,
        stopLossPercent,
        takeProfitPercent,
      }, strategyGoal)

      setOptimizationResult(optimized)
      setStrategyResult(optimized.result)
      setStrategyFastPeriod(String(optimized.config.fastPeriod))
      setStrategySlowPeriod(String(optimized.config.slowPeriod))
      setStrategyStatus(`Optimization complete. Best ${strategyGoal} found with EMA ${optimized.config.fastPeriod}/${optimized.config.slowPeriod}.`)
    } catch (optimizationError) {
      setStrategyStatus(optimizationError instanceof Error ? optimizationError.message : 'Optimization failed.')
    } finally {
      setStrategyRunning(false)
    }
  }

  async function handleRunScan() {
    const assets = parseCommaList(scanAssets).map(normalizeSymbolInput).slice(0, 8)
    const timeframes = parseCommaList(scanTimeframes).map(normalizeIntervalInput)
    const primaryTimeframe = timeframes[0] ?? '1h'
    const confirmationTimeframe = timeframes[1]

    setScanRunning(true)
    setScanStatus(`Scanning ${assets.length} assets on ${timeframes.join(', ')}...`)

    try {
      const results = await Promise.all(assets.map(async (asset) => {
        const primaryMarket = await fetchCandles(asset, primaryTimeframe)
        const primaryContext = deriveAnalysisContext(primaryMarket.candles)
        const primaryResult = buildScanResult(asset, primaryTimeframe, primaryContext, primaryMarket.candles)

        if (!confirmationTimeframe) {
          return primaryResult
        }

        const confirmationMarket = await fetchCandles(asset, confirmationTimeframe)
        const confirmationContext = deriveAnalysisContext(confirmationMarket.candles)
        const confirmationResult = buildScanResult(asset, confirmationTimeframe, confirmationContext, confirmationMarket.candles)

        if (primaryResult.bias === 'bullish' && confirmationResult.bias === 'bullish') {
          return {
            ...primaryResult,
            score: primaryResult.score + confirmationResult.score,
            summary: `${scanCondition}: aligned bullish across ${primaryTimeframe} and ${confirmationTimeframe}.`,
          }
        }

        if (primaryResult.bias === 'bearish' && confirmationResult.bias === 'bearish') {
          return {
            ...primaryResult,
            score: primaryResult.score + confirmationResult.score,
            summary: `${scanCondition}: aligned bearish across ${primaryTimeframe} and ${confirmationTimeframe}.`,
            bias: 'bearish' as const,
          }
        }

        return {
          ...primaryResult,
          bias: 'mixed' as const,
          summary: `${scanCondition}: mixed between ${primaryTimeframe} and ${confirmationTimeframe}.`,
        }
      }))

      setScanResults(results.sort((left, right) => right.score - left.score))
      setScanStatus('Scan complete.')
    } catch (scanError) {
      setScanStatus(scanError instanceof Error ? scanError.message : 'Scan failed.')
    } finally {
      setScanRunning(false)
    }
  }

  async function handleRequestNotifications() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported')
      return
    }

    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
  }

  function handleCreateAlert() {
    const asset = normalizeSymbolInput(alertAsset)
    const targetPrice = Number(alertPrice)

    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      return
    }

    const nextRule: AlertRule = {
      id: `${asset}-${alertDirection}-${targetPrice}-${Date.now()}`,
      asset,
      direction: alertDirection,
      price: targetPrice,
      note: alertCondition.trim(),
      channel: alertChannel.trim() || 'Browser + in-app',
      analysisFocus: alertAnalysisFocus.trim() || 'Breakout strength / reversal potential',
      status: 'armed',
      lastPrice: null,
    }

    setAlertRules((currentRules) => [nextRule, ...currentRules].slice(0, 10))
  }

  function handleRemoveAlert(ruleId: string) {
    setAlertRules((currentRules) => currentRules.filter((rule) => rule.id !== ruleId))
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar__brand">
          <div>
            <span className="eyebrow">WaveMap AI</span>
            <h1>Trade with cleaner context</h1>
          </div>
          <div className="status-chip">
            <span className={`status-dot status-dot--${connectionState}`} />
            {connectionState === 'live' ? 'Live stream connected' : connectionState}
          </div>
        </div>

        <nav className="topbar__nav" aria-label="Primary">
          {[
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'analysis', label: 'Analysis' },
            { id: 'automation', label: 'Automation' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              className={activeView === item.id ? 'topbar__tab topbar__tab--active' : 'topbar__tab'}
              onClick={() => setActiveView(item.id as AppView)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="topbar__actions">
          <button type="button" className="button button--primary" onClick={handleAnalyze} disabled={!data || analysisState === 'loading'}>
            {analysisState === 'loading' ? 'Running analysis...' : 'Analyze'}
          </button>
          {installEvent ? (
            <button type="button" className="button button--ghost" onClick={handleInstall}>
              Install
            </button>
          ) : null}
        </div>
      </header>

      {!navigator.onLine ? (
        <div className="notice notice--warning">
          Market data is unavailable offline. The app shell stays open, but live quotes and analysis need a connection.
        </div>
      ) : null}

      {error ? <div className="notice notice--error">{error}</div> : null}
      {analysisError ? <div className="notice notice--warning">AI fallback mode: ระบบสลับไปใช้การวิเคราะห์สำรองชั่วคราว - {analysisError}</div> : null}

      {activeView === 'dashboard' ? (
        <section className="page page--dashboard">
          <section className="workspace">
            <div className="chart-panel">
              <div className="chart-panel__topbar">
                <div>
                  <span className="panel-label">Market focus</span>
                  <h2>{symbolLabel(selectedSymbol)}</h2>
                </div>
                <div className="market-price">
                  <strong>{formatPrice(data?.summary.currentPrice ?? 0)}</strong>
                  <span className={(data?.summary.changePercent24h ?? 0) >= 0 ? 'positive' : 'negative'}>
                    {formatPercent(data?.summary.changePercent24h ?? 0)}
                  </span>
                </div>
              </div>
              <CandleChart symbol={selectedSymbol} timeframe={timeframe} candles={data?.candles ?? []} analysis={analysis} chartPreset={chartPreset} context={derived} />
              <div className="chart-panel__meta">
                <div>
                  <span>24h high</span>
                  <strong>{formatPrice(data?.summary.high24h ?? 0)}</strong>
                </div>
                <div>
                  <span>24h low</span>
                  <strong>{formatPrice(data?.summary.low24h ?? 0)}</strong>
                </div>
                <div>
                  <span>Volatility</span>
                  <strong>{derived.averageRangePercent.toFixed(2)}%</strong>
                </div>
                <div>
                  <span>Momentum</span>
                  <strong>{formatPercent(derived.momentumPercent)}</strong>
                </div>
              </div>
            </div>

            <aside className="control-panel">
              <div className="search-card">
                <label htmlFor="asset-search">Search crypto asset</label>
                <div className="search-input">
                  <input
                    id="asset-search"
                    value={searchQuery}
                    onChange={(event) => {
                      setSearchQuery(event.target.value)
                      setSearchOpen(true)
                    }}
                    onFocus={() => setSearchOpen(true)}
                    placeholder="BTC, ETH, SOL..."
                    autoComplete="off"
                  />
                </div>
                {searchOpen ? (
                  <div className="search-results">
                    {searchResults.length > 0 ? (
                      searchResults.map((item) => (
                        <button
                          key={item.symbol}
                          type="button"
                          className="search-results__item"
                          onClick={() => {
                            setAnalysis(null)
                            setAnalysisError(null)
                            setAnalysisState('idle')
                            setSelectedSymbol(item.symbol)
                            setSearchQuery(item.displayName)
                            setSearchOpen(false)
                          }}
                        >
                          <strong>{item.displayName}</strong>
                          <span>{item.symbol}</span>
                        </button>
                      ))
                    ) : (
                      <div className="search-results__empty">No matching USDT spot pairs.</div>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="timeframe-card">
                <span className="panel-label">Timeframe</span>
                <div className="timeframe-grid">
                  {MARKET_INTERVALS.map((intervalOption) => (
                    <button
                      key={intervalOption}
                      type="button"
                      className={intervalOption === timeframe ? 'timeframe timeframe--active' : 'timeframe'}
                      onClick={() => {
                        setAnalysis(null)
                        setAnalysisError(null)
                        setAnalysisState('idle')
                        setTimeframe(intervalOption)
                      }}
                    >
                      {intervalOption}
                    </button>
                  ))}
                </div>
              </div>

              <div className="snapshot-card">
                <span className="panel-label">Quick context</span>
                <div className="snapshot-card__grid">
                  <div>
                    <span>Structure bias</span>
                    <strong className={biasToneClass(analysis?.trend_bias ?? derived.structureBias)}>
                      {analysis?.trend_bias ?? derived.structureBias}
                    </strong>
                  </div>
                  <div>
                    <span>HTF bias</span>
                    <strong className={biasToneClass(analysis?.higher_timeframe_bias ?? derived.structureBias)}>
                      {analysis?.higher_timeframe_bias ?? derived.structureBias}
                    </strong>
                  </div>
                  <div>
                    <span>Support</span>
                    <strong>{derived.supportLevels.map(formatPrice).join(' / ') || '-'}</strong>
                  </div>
                  <div>
                    <span>Resistance</span>
                    <strong>{derived.resistanceLevels.map(formatPrice).join(' / ') || '-'}</strong>
                  </div>
                </div>
              </div>
            </aside>
          </section>

          <section className="dashboard-preview">
            <div className="dashboard-preview__header">
              <div>
                <span className="eyebrow">Analysis snapshot</span>
                <h2>Latest AI read</h2>
              </div>
              <button type="button" className="button button--ghost" onClick={() => setActiveView('analysis')}>
                Open full analysis
              </button>
            </div>

            {analysisReady ? (
              <div className="dashboard-preview__grid">
                <div className="metric-box">
                  <span>Trend bias</span>
                  <strong className={biasToneClass(analysis?.trend_bias ?? 'sideways')}>{analysis?.trend_bias}</strong>
                </div>
                <div className="metric-box">
                  <span>Confidence</span>
                  <strong>{analysis?.confidence}</strong>
                </div>
                <div className="metric-box">
                  <span>Invalidation</span>
                  <strong>{analysis?.invalidation}</strong>
                </div>
                <div className="metric-box">
                  <span>Entry zone</span>
                  <strong>
                    {formatPrice(analysis?.entry_zone.low ?? 0)} - {formatPrice(analysis?.entry_zone.high ?? 0)}
                  </strong>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                Run analysis to pin the latest Elliott wave bias, invalidation, and execution levels here.
              </div>
            )}
          </section>

          {chartPreset ? (
            <section className="dashboard-preview">
              <div className="dashboard-preview__header">
                <div>
                  <span className="eyebrow">Applied automation</span>
                  <h2>Chart preset is live</h2>
                  <p>{chartAutomationStatus ?? `Preset applied at ${new Date(chartPreset.appliedAt).toLocaleTimeString()}`}</p>
                </div>
              </div>
              <div className="dashboard-preview__grid">
                {chartPreset.indicatorSnapshots.map((snapshot) => (
                  <div key={snapshot.name} className="metric-box">
                    <span>{snapshot.name}</span>
                    <strong>{snapshot.value}</strong>
                    <small>{snapshot.note}</small>
                  </div>
                ))}
                {!chartPreset.indicatorSnapshots.length ? (
                  <div className="metric-box">
                    <span>Preset state</span>
                    <strong>{chartPreset.layout}</strong>
                    <small>Support, resistance, and zone tools were applied without indicator overlays.</small>
                  </div>
                ) : null}
              </div>
              {comparisonResults.length > 0 ? (
                <div className="comparison-grid">
                  {comparisonResults.map((result) => (
                    <div key={result.asset} className="metric-box">
                      <span>{symbolLabel(result.asset)}</span>
                      <strong className={biasToneClass(result.bias)}>{result.bias}</strong>
                      <small>{result.summary}</small>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
        </section>
      ) : null}

      {activeView === 'analysis' ? (
        <section className="page page--analysis">
          <div className="analysis-intro">
            <span className="eyebrow">Decision zone</span>
            <h2>{symbolLabel(selectedSymbol)} Analysis</h2>
            <p>Review structure, probabilities, entry zones, and risk notes without the dashboard clutter.</p>
          </div>

          <section className="analysis-highlight">
            {analysisReady ? (
              <>
                <div className="analysis-highlight__header">
                  <div>
                    <span className="panel-label">AI summary</span>
                    <h3>{analysis?.market_structure}</h3>
                  </div>
                  <div className="analysis-highlight__confidence">
                    <span>Confidence</span>
                    <strong>{analysis?.confidence}</strong>
                  </div>
                </div>
                <ProbabilityBar
                  bullish={analysis?.probability_bullish ?? 0}
                  bearish={analysis?.probability_bearish ?? 0}
                  sideways={analysis?.probability_sideways ?? 0}
                />
                <div className="analysis-highlight__grid">
                  <div className="metric-box">
                    <span>Entry zone</span>
                    <strong>{formatPrice(analysis?.entry_zone.low ?? 0)} - {formatPrice(analysis?.entry_zone.high ?? 0)}</strong>
                  </div>
                  <div className="metric-box">
                    <span>Stop zone</span>
                    <strong>{formatPrice(analysis?.stop_zone.low ?? 0)} - {formatPrice(analysis?.stop_zone.high ?? 0)}</strong>
                  </div>
                  <div className="metric-box">
                    <span>Primary invalidation</span>
                    <strong>{analysis?.invalidation}</strong>
                  </div>
                  <div className="metric-box">
                    <span>HTF bias</span>
                    <strong className={biasToneClass(analysis?.higher_timeframe_bias ?? 'mixed')}>{analysis?.higher_timeframe_bias}</strong>
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state">No analysis yet. Run the AI to fill this view with structure, probabilities, and execution levels.</div>
            )}
          </section>

          <section className="steps-stack">
            <StepCard step="Step 1" title="Market Outlook" subtitle="Context before conviction">
              {analysisReady ? (
                <div className="card-grid">
                  <div className="metric-box">
                    <span>Selected asset</span>
                    <strong>{symbolLabel(selectedSymbol)}</strong>
                  </div>
                  <div className="metric-box">
                    <span>Higher-timeframe bias</span>
                    <strong className={biasToneClass(analysis?.higher_timeframe_bias ?? derived.structureBias)}>
                      {analysis?.higher_timeframe_bias ?? derived.structureBias}
                    </strong>
                  </div>
                  <div className="metric-box">
                    <span>Range condition</span>
                    <strong>{derived.averageRangePercent.toFixed(2)}% avg candle range</strong>
                  </div>
                  <div className="metric-box">
                    <span>Wave count</span>
                    <strong>{analysis?.wave_count_summary}</strong>
                  </div>
                </div>
              ) : (
                <div className="empty-state">Market outlook will appear after the first analysis run.</div>
              )}
            </StepCard>

            <StepCard step="Step 2" title="Trade Plan" subtitle="Count the wave, map the probabilities">
              {analysisReady ? (
                <div className="step-copy">
                  <p><strong>Structure:</strong> {analysis?.market_structure}</p>
                  <p><strong>Invalidation:</strong> {analysis?.invalidation}</p>
                  <p><strong>Support:</strong> {analysis?.support_levels.map(formatPrice).join(' / ')}</p>
                  <p><strong>Resistance:</strong> {analysis?.resistance_levels.map(formatPrice).join(' / ')}</p>
                </div>
              ) : (
                <div className="empty-state">Trade planning stays collapsed until an AI count is available.</div>
              )}
            </StepCard>

            <StepCard step="Step 3" title="Execution" subtitle="Only act on conditional zones">
              {analysisReady ? (
                <div className="zone-grid">
                  <div className="zone-box">
                    <span>{analysis?.entry_zone.label}</span>
                    <strong>{formatPrice(analysis?.entry_zone.low ?? 0)} - {formatPrice(analysis?.entry_zone.high ?? 0)}</strong>
                    <p>{analysis?.entry_zone.rationale}</p>
                  </div>
                  <div className="zone-box">
                    <span>{analysis?.stop_zone.label}</span>
                    <strong>{formatPrice(analysis?.stop_zone.low ?? 0)} - {formatPrice(analysis?.stop_zone.high ?? 0)}</strong>
                    <p>{analysis?.stop_zone.rationale}</p>
                  </div>
                  {analysis?.target_zones.map((targetZone) => (
                    <div key={targetZone.label} className="zone-box">
                      <span>{targetZone.label}</span>
                      <strong>{formatPrice(targetZone.low)} - {formatPrice(targetZone.high)}</strong>
                      <p>{targetZone.rationale}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">Execution levels will stay hidden until the model returns a setup.</div>
              )}
            </StepCard>

            <StepCard step="Step 4" title="Closure" subtitle="Risk-first review before every trade">
              {analysisReady ? (
                <div className="closure-grid">
                  <div>
                    <span className="panel-label">Execution notes</span>
                    <ul>
                      {analysis?.execution_notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span className="panel-label">Risk notes</span>
                    <ul>
                      {analysis?.risk_notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="closure-disclaimer">
                    <strong>{analysis?.disclaimer}</strong>
                  </div>
                </div>
              ) : (
                <div className="empty-state">Risk review will appear once there is an analysis result to review.</div>
              )}
            </StepCard>
          </section>
        </section>
      ) : null}

      {activeView === 'automation' ? (
        <section className="page page--automation">
          <div className="automation-intro">
            <div>
              <span className="eyebrow">Automation lab</span>
              <h2>Built for WaveMap AI</h2>
              <p>These tools now act inside the app: chart presets apply here, strategies backtest locally, scans run against market data, and alerts stay monitored while the app is open.</p>
            </div>
            <div className="automation-lab__badge">
              <strong>Practical automation</strong>
              <span>No copy-paste prompts needed for the core workflow anymore.</span>
            </div>
          </div>

          <div className="automation-stack">
            <section className="automation-card">
              <button type="button" className="automation-card__toggle" onClick={() => setOpenTool('chart')}>
                <span className="step-card__step">1. Chart Auto-Prep</span>
                <strong>{openTool === 'chart' ? 'Active' : 'Open'}</strong>
              </button>
              {openTool === 'chart' ? (
                <div className="automation-card__content">
                  <div className="form-grid">
                    <label>
                      <span>Asset</span>
                      <input value={chartAsset} onChange={(event) => setChartAsset(event.target.value.toUpperCase())} />
                    </label>
                    <label>
                      <span>Timeframe</span>
                      <input value={chartTimeframe} onChange={(event) => setChartTimeframe(event.target.value.toUpperCase())} />
                    </label>
                    <label className="form-grid__full">
                      <span>Indicators</span>
                      <input value={chartIndicators} onChange={(event) => setChartIndicators(event.target.value)} />
                    </label>
                    <label className="form-grid__full">
                      <span>Drawing tools</span>
                      <input value={chartTools} onChange={(event) => setChartTools(event.target.value)} />
                    </label>
                    <label>
                      <span>Zone focus</span>
                      <input value={chartZone} onChange={(event) => setChartZone(event.target.value)} />
                    </label>
                    <label>
                      <span>Patterns</span>
                      <input value={chartPatterns} onChange={(event) => setChartPatterns(event.target.value)} />
                    </label>
                    <label>
                      <span>Layout note</span>
                      <input value={chartLayout} onChange={(event) => setChartLayout(event.target.value)} />
                    </label>
                    <label>
                      <span>Comparison watchlist</span>
                      <input value={chartComparisons} onChange={(event) => setChartComparisons(event.target.value.toUpperCase())} />
                    </label>
                  </div>
                  <div className="automation-actions">
                    <button type="button" className="button button--primary" onClick={handleApplyChartAutomation}>
                      Apply chart setup
                    </button>
                    <div className="automation-status">{chartAutomationStatus ?? 'This tool will switch the app chart, add overlays, scan comparisons, and refresh AI context.'}</div>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="automation-card">
              <button type="button" className="automation-card__toggle" onClick={() => setOpenTool('strategy')}>
                <span className="step-card__step">2. Strategy & Backtest</span>
                <strong>{openTool === 'strategy' ? 'Active' : 'Open'}</strong>
              </button>
              {openTool === 'strategy' ? (
                <div className="automation-card__content">
                  <div className="form-grid">
                    <label>
                      <span>Asset</span>
                      <input value={strategyAsset} onChange={(event) => setStrategyAsset(event.target.value.toUpperCase())} />
                    </label>
                    <label>
                      <span>Timeframe</span>
                      <input value={strategyTimeframe} onChange={(event) => setStrategyTimeframe(event.target.value.toUpperCase())} />
                    </label>
                    <label>
                      <span>Fast EMA</span>
                      <input value={strategyFastPeriod} onChange={(event) => setStrategyFastPeriod(event.target.value)} />
                    </label>
                    <label>
                      <span>Slow EMA</span>
                      <input value={strategySlowPeriod} onChange={(event) => setStrategySlowPeriod(event.target.value)} />
                    </label>
                    <label>
                      <span>Stop loss %</span>
                      <input value={strategyStopLoss} onChange={(event) => setStrategyStopLoss(event.target.value)} />
                    </label>
                    <label>
                      <span>Take profit %</span>
                      <input value={strategyTakeProfit} onChange={(event) => setStrategyTakeProfit(event.target.value)} />
                    </label>
                  </div>
                  <div className="automation-actions">
                    <button type="button" className="button button--primary" onClick={handleRunBacktest} disabled={strategyRunning}>
                      {strategyRunning ? 'Running...' : 'Run backtest'}
                    </button>
                    <button type="button" className="button button--ghost" onClick={handleOptimizeBacktest} disabled={strategyRunning}>
                      Optimize for {strategyGoal === 'profitFactor' ? 'profit factor' : 'win rate'}
                    </button>
                  </div>
                  <div className="goal-toggle">
                    <button type="button" className={strategyGoal === 'profitFactor' ? 'timeframe timeframe--active' : 'timeframe'} onClick={() => setStrategyGoal('profitFactor')}>
                      Profit factor
                    </button>
                    <button type="button" className={strategyGoal === 'winRate' ? 'timeframe timeframe--active' : 'timeframe'} onClick={() => setStrategyGoal('winRate')}>
                      Win rate
                    </button>
                  </div>
                  {strategyStatus ? <div className="automation-status">{strategyStatus}</div> : null}
                  {strategyResult ? (
                    <div className="result-grid">
                      <div className="metric-box">
                        <span>Trades</span>
                        <strong>{strategyResult.trades}</strong>
                      </div>
                      <div className="metric-box">
                        <span>Win rate</span>
                        <strong>{strategyResult.winRate}%</strong>
                      </div>
                      <div className="metric-box">
                        <span>Profit factor</span>
                        <strong>{strategyResult.profitFactor}</strong>
                      </div>
                      <div className="metric-box">
                        <span>Net return</span>
                        <strong>{strategyResult.netReturnPercent}%</strong>
                      </div>
                      <div className="metric-box">
                        <span>Max drawdown</span>
                        <strong>{strategyResult.maxDrawdownPercent}%</strong>
                      </div>
                      <div className="metric-box">
                        <span>Best / worst</span>
                        <strong>{strategyResult.bestTradePercent}% / {strategyResult.worstTradePercent}%</strong>
                      </div>
                    </div>
                  ) : null}
                  {optimizationResult ? (
                    <div className="prompt-output">
                      <span className="panel-label">Optimization summary</span>
                      <p>
                        Best {optimizationResult.optimizedMetric === 'profitFactor' ? 'profit factor' : 'win rate'} came from EMA {optimizationResult.config.fastPeriod}/{optimizationResult.config.slowPeriod}
                        {' '}with net return {optimizationResult.result.netReturnPercent}% and profit factor {optimizationResult.result.profitFactor}.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="automation-card">
              <button type="button" className="automation-card__toggle" onClick={() => setOpenTool('scan')}>
                <span className="step-card__step">3. Multi-Asset Scan</span>
                <strong>{openTool === 'scan' ? 'Active' : 'Open'}</strong>
              </button>
              {openTool === 'scan' ? (
                <div className="automation-card__content">
                  <div className="form-grid">
                    <label className="form-grid__full">
                      <span>Assets</span>
                      <textarea rows={3} value={scanAssets} onChange={(event) => setScanAssets(event.target.value.toUpperCase())} />
                    </label>
                    <label>
                      <span>Timeframes</span>
                      <input value={scanTimeframes} onChange={(event) => setScanTimeframes(event.target.value)} />
                    </label>
                    <label>
                      <span>Scan focus</span>
                      <input value={scanCondition} onChange={(event) => setScanCondition(event.target.value)} />
                    </label>
                  </div>
                  <div className="automation-actions">
                    <button type="button" className="button button--primary" onClick={handleRunScan} disabled={scanRunning}>
                      {scanRunning ? 'Scanning...' : 'Run scan'}
                    </button>
                    {scanStatus ? <div className="automation-status">{scanStatus}</div> : null}
                  </div>
                  {scanResults.length > 0 ? (
                    <div className="result-list">
                      {scanResults.map((result) => (
                        <div key={`${result.asset}-${result.timeframe}`} className="result-row">
                          <div>
                            <strong>{symbolLabel(result.asset)}</strong>
                            <span>{result.timeframe}</span>
                          </div>
                          <div className="result-row__summary">
                            <strong className={biasToneClass(result.bias)}>{result.bias}</strong>
                            <span>{result.summary}</span>
                          </div>
                          <div>
                            <strong>{formatPercent(result.priceChangePercent)}</strong>
                            <span>Momentum {formatPercent(result.momentumPercent)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="automation-card">
              <button type="button" className="automation-card__toggle" onClick={() => setOpenTool('alert')}>
                <span className="step-card__step">4. Smart Alerts</span>
                <strong>{openTool === 'alert' ? 'Active' : 'Open'}</strong>
              </button>
              {openTool === 'alert' ? (
                <div className="automation-card__content">
                  <div className="form-grid">
                    <label>
                      <span>Asset</span>
                      <input value={alertAsset} onChange={(event) => setAlertAsset(event.target.value.toUpperCase())} />
                    </label>
                    <label>
                      <span>Direction</span>
                      <select value={alertDirection} onChange={(event) => setAlertDirection(event.target.value as AlertDirection)}>
                        <option value="crosses above">Crosses above</option>
                        <option value="drops below">Drops below</option>
                      </select>
                    </label>
                    <label>
                      <span>Price level</span>
                      <input value={alertPrice} onChange={(event) => setAlertPrice(event.target.value)} />
                    </label>
                    <label>
                      <span>Alert channel</span>
                      <input value={alertChannel} onChange={(event) => setAlertChannel(event.target.value)} />
                    </label>
                    <label className="form-grid__full">
                      <span>Review note</span>
                      <input value={alertCondition} onChange={(event) => setAlertCondition(event.target.value)} />
                    </label>
                    <label className="form-grid__full">
                      <span>Follow-up focus</span>
                      <input value={alertAnalysisFocus} onChange={(event) => setAlertAnalysisFocus(event.target.value)} />
                    </label>
                  </div>
                  <div className="automation-actions">
                    <button type="button" className="button button--primary" onClick={handleCreateAlert}>
                      Create alert
                    </button>
                    {notificationPermission !== 'granted' ? (
                      <button type="button" className="button button--ghost" onClick={handleRequestNotifications}>
                        {notificationPermission === 'unsupported' ? 'Notifications unavailable' : 'Enable notifications'}
                      </button>
                    ) : null}
                  </div>
                  <div className="automation-status">
                    Alerts are monitored locally while the app stays open. Armed: {armedAlerts.length}. Triggered: {triggeredAlerts.length}.
                  </div>
                  {alertRules.length > 0 ? (
                    <div className="result-list">
                      {alertRules.map((rule) => (
                        <div key={rule.id} className="result-row">
                          <div>
                            <strong>{symbolLabel(rule.asset)}</strong>
                            <span>{rule.direction} {formatPrice(rule.price)}</span>
                          </div>
                          <div className="result-row__summary">
                            <strong className={rule.status === 'armed' ? 'tone tone--sideways' : 'tone tone--bullish'}>{rule.status}</strong>
                            <span>{rule.analysisFocus}</span>
                          </div>
                          <div className="result-row__actions">
                            <span>{rule.triggeredAt ? new Date(rule.triggeredAt).toLocaleTimeString() : 'Watching live'}</span>
                            <button type="button" className="button button--ghost" onClick={() => handleRemoveAlert(rule.id)}>Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          </div>
        </section>
      ) : null}
    </div>
  )
}

export default App
