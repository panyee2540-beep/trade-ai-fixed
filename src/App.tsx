import { startTransition, useDeferredValue, useEffect, useState } from 'react'
import './App.css'
import { DEFAULT_INTERVAL, DEFAULT_SYMBOL, MARKET_INTERVALS } from '../shared/constants'
import { analyzeWave, fetchSearchResults } from './lib/api'
import { useMarketData } from './hooks/useMarketData'
import { CandleChart } from './components/CandleChart'
import { StepCard } from './components/StepCard'
import { ProbabilityBar } from './components/ProbabilityBar'
import { buildFallbackAnalysis, deriveAnalysisContext } from '../shared/analysis'
import type { AnalysisResponse, MarketInterval, MarketSymbol } from '../shared/types'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

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

function sanitizeCommaList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .join(', ')
}

function App() {
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
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null)
  const [chartAsset, setChartAsset] = useState('BTCUSDT')
  const [chartTimeframe, setChartTimeframe] = useState('1H')
  const [chartIndicators, setChartIndicators] = useState('RSI, MACD')
  const [chartTools, setChartTools] = useState('Fibonacci levels, trendlines')
  const [chartZone, setChartZone] = useState('golden pocket zone')
  const [chartPatterns, setChartPatterns] = useState('order blocks, FVGs')
  const [chartLayout, setChartLayout] = useState('2x2')
  const [chartComparisons, setChartComparisons] = useState('ETHUSDT, SOLUSDT')
  const [strategyType, setStrategyType] = useState('trend-following')
  const [strategyAsset, setStrategyAsset] = useState('BTCUSDT')
  const [strategyTimeframe, setStrategyTimeframe] = useState('1H')
  const [strategyEntryRule, setStrategyEntryRule] = useState('EMA 20 crosses above EMA 50')
  const [strategyStopLoss, setStrategyStopLoss] = useState('5')
  const [strategyTakeProfit, setStrategyTakeProfit] = useState('15')
  const [strategyOptimizeTarget, setStrategyOptimizeTarget] = useState('EMA periods')
  const [strategyGoal, setStrategyGoal] = useState('profit factor')
  const [scanAssets, setScanAssets] = useState('BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, XRPUSDT')
  const [scanTimeframes, setScanTimeframes] = useState('Daily, Weekly')
  const [scanCondition, setScanCondition] = useState('bullish confluence / strong breakout')
  const [alertAsset, setAlertAsset] = useState('XAUUSD')
  const [alertDirection, setAlertDirection] = useState('crosses above')
  const [alertPrice, setAlertPrice] = useState('2000')
  const [alertCondition, setAlertCondition] = useState('RSI over 70')
  const [alertChannel, setAlertChannel] = useState('Telegram')
  const [alertAnalysisFocus, setAlertAnalysisFocus] = useState('breakout strength / reversal potential')

  const { data, connectionState, error } = useMarketData(selectedSymbol, timeframe)
  const derived = deriveAnalysisContext(data?.candles ?? [])

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
    if (!copiedPrompt) {
      return
    }

    const timer = window.setTimeout(() => setCopiedPrompt(null), 1800)
    return () => window.clearTimeout(timer)
  }, [copiedPrompt])

  async function handleAnalyze() {
    if (!data?.candles?.length) {
      return
    }

    setAnalysisState('loading')
    setAnalysisError(null)

    try {
      const nextAnalysis = await analyzeWave(selectedSymbol, timeframe, data.candles)
      startTransition(() => {
        setAnalysis(nextAnalysis)
        setAnalysisState('idle')
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Analysis failed'
      startTransition(() => {
        setAnalysis(buildFallbackAnalysis(selectedSymbol, timeframe, data.candles, message))
        setAnalysisState('error')
        setAnalysisError(message)
      })
    }
  }

  async function handleInstall() {
    if (!installEvent) {
      return
    }

    await installEvent.prompt()
    await installEvent.userChoice
    setInstallEvent(null)
  }

  async function handleCopyPrompt(kind: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedPrompt(kind)
    } catch {
      setCopiedPrompt(null)
    }
  }

  const chartAutomationPrompt = `Switch to ${chartAsset} ${chartTimeframe}, add ${sanitizeCommaList(chartIndicators)}, draw ${sanitizeCommaList(chartTools)}, highlight the ${chartZone}, identify and draw ${sanitizeCommaList(chartPatterns)}, switch to ${chartLayout} layout with ${sanitizeCommaList(chartComparisons)} on the side charts, enable crosshair sync, and take a screenshot.`

  const strategyPrompt = `Write a Pine Script ${strategyType} strategy for ${strategyAsset} on ${strategyTimeframe} that enters long when ${strategyEntryRule}. Add a ${strategyStopLoss}% stop loss and ${strategyTakeProfit}% take profit. Backtest it, show me the performance report, then optimize the ${strategyOptimizeTarget} to maximize the ${strategyGoal}.`

  const scanPrompt = `Analyze ${sanitizeCommaList(scanAssets)} across ${sanitizeCommaList(scanTimeframes)} timeframes. Show me which ones have ${scanCondition} and which are mixed.`

  const alertPrompt = `Alert me when ${alertAsset} ${alertDirection} ${alertPrice} with ${alertCondition}, and monitor it on ${alertChannel} so you analyze the ${alertAnalysisFocus} when it hits.`

  return (
    <div className="shell">
      <header className="hero-banner">
        <div className="hero-banner__copy">
          <span className="eyebrow">The 5-step AI trading process</span>
          <h1>WaveMap AI</h1>
          <p>
            Crypto market search, live candlestick tracking, and Elliott-wave-informed setup analysis
            designed for quick decision support on desktop and mobile.
          </p>
        </div>
        <div className="hero-banner__actions">
          <div className="status-chip">
            <span className={`status-dot status-dot--${connectionState}`} />
            {connectionState === 'live' ? 'Live stream connected' : connectionState}
          </div>
          <button type="button" className="button button--primary" onClick={handleAnalyze} disabled={!data || analysisState === 'loading'}>
            {analysisState === 'loading' ? 'Running Elliott analysis...' : 'Analyze current structure'}
          </button>
          {installEvent ? (
            <button type="button" className="button button--secondary" onClick={handleInstall}>
              Install app
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
      {analysisError ? <div className="notice notice--warning">AI fallback mode: {analysisError}</div> : null}

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
          <CandleChart candles={data?.candles ?? []} analysis={analysis} />
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

      <section className="steps-grid">
        <StepCard step="Step 1" title="Market Outlook" subtitle="Context before conviction">
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
              <span>Current structure</span>
              <strong>{analysis?.market_structure ?? 'Waiting for AI analysis or fallback context.'}</strong>
            </div>
          </div>
        </StepCard>

        <StepCard step="Step 2" title="Daily Focus List" subtitle="Search, rank, then focus">
          <div className="step-copy">
            <p>
              The search box is tuned for Binance USDT spot pairs. Pick the asset first, then choose a timeframe
              that matches your holding period.
            </p>
            <p>
              Current timeframe: <strong>{timeframe}</strong>. Best use: trigger analysis only after the live chart
              stabilizes around a clear swing.
            </p>
          </div>
        </StepCard>

        <StepCard step="Step 3" title="Trade Plan" subtitle="Count the wave, map the probabilities">
          {analysis ? (
            <>
              <ProbabilityBar
                bullish={analysis.probability_bullish}
                bearish={analysis.probability_bearish}
                sideways={analysis.probability_sideways}
              />
              <div className="step-copy">
                <p><strong>Wave count:</strong> {analysis.wave_count_summary}</p>
                <p><strong>Invalidation:</strong> {analysis.invalidation}</p>
                <p><strong>Confidence:</strong> {analysis.confidence}</p>
              </div>
            </>
          ) : (
            <div className="empty-state">
              Trigger analysis to generate the Elliott wave count, trend probabilities, and invalidation map.
            </div>
          )}
        </StepCard>

        <StepCard step="Step 4" title="Execution" subtitle="Only act on conditional zones">
          {analysis ? (
            <div className="zone-grid">
              <div className="zone-box">
                <span>{analysis.entry_zone.label}</span>
                <strong>{formatPrice(analysis.entry_zone.low)} - {formatPrice(analysis.entry_zone.high)}</strong>
                <p>{analysis.entry_zone.rationale}</p>
              </div>
              <div className="zone-box">
                <span>{analysis.stop_zone.label}</span>
                <strong>{formatPrice(analysis.stop_zone.low)} - {formatPrice(analysis.stop_zone.high)}</strong>
                <p>{analysis.stop_zone.rationale}</p>
              </div>
              {analysis.target_zones.map((targetZone) => (
                <div key={targetZone.label} className="zone-box">
                  <span>{targetZone.label}</span>
                  <strong>{formatPrice(targetZone.low)} - {formatPrice(targetZone.high)}</strong>
                  <p>{targetZone.rationale}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              The chart is live. Use the analysis button to project conditional entry, stop, and target zones.
            </div>
          )}
        </StepCard>

        <StepCard step="Step 5" title="Closure" subtitle="Risk-first review before every trade">
          {analysis ? (
            <div className="closure-grid">
              <div>
                <span className="panel-label">Execution notes</span>
                <ul>
                  {analysis.execution_notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
              <div>
                <span className="panel-label">Risk notes</span>
                <ul>
                  {analysis.risk_notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
              <div className="closure-disclaimer">
                <strong>{analysis.disclaimer}</strong>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              This app is analysis-first. It does not auto-trade or guarantee outcomes.
            </div>
          )}
        </StepCard>
      </section>

      <section className="automation-lab">
        <div className="automation-lab__header">
          <div>
            <span className="eyebrow">AI workflow studio</span>
            <h2>Automation Lab</h2>
            <p>
              Build copy-ready prompts for chart prep, Pine Script strategy work, basket scanning, and alert workflows.
              This version generates instructions for your AI/chart stack rather than controlling external platforms directly.
            </p>
          </div>
          <div className="automation-lab__badge">
            <strong>Token-smart</strong>
            <span>Prompt drafting is local. OpenAI is only used when you run analysis.</span>
          </div>
        </div>

        <div className="automation-grid">
          <section className="automation-card">
            <div className="automation-card__header">
              <span className="step-card__step">1. Chart Auto-Prep</span>
              <p>Generate a ready instruction for switching charts, adding indicators, drawing tools, and preparing screenshots.</p>
            </div>
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
                <span>Key zone</span>
                <input value={chartZone} onChange={(event) => setChartZone(event.target.value)} />
              </label>
              <label>
                <span>Patterns to identify</span>
                <input value={chartPatterns} onChange={(event) => setChartPatterns(event.target.value)} />
              </label>
              <label>
                <span>Layout</span>
                <input value={chartLayout} onChange={(event) => setChartLayout(event.target.value)} />
              </label>
              <label>
                <span>Side charts</span>
                <input value={chartComparisons} onChange={(event) => setChartComparisons(event.target.value.toUpperCase())} />
              </label>
            </div>
            <div className="prompt-output">
              <span className="panel-label">Generated prompt</span>
              <p>{chartAutomationPrompt}</p>
            </div>
            <button type="button" className="button button--secondary" onClick={() => handleCopyPrompt('chart', chartAutomationPrompt)}>
              {copiedPrompt === 'chart' ? 'Copied chart prompt' : 'Copy chart prompt'}
            </button>
          </section>

          <section className="automation-card">
            <div className="automation-card__header">
              <span className="step-card__step">2. Strategy & Backtest</span>
              <p>Draft a Pine Script and optimization brief so your AI can write, backtest, and refine a strategy faster.</p>
            </div>
            <div className="form-grid">
              <label>
                <span>Strategy type</span>
                <input value={strategyType} onChange={(event) => setStrategyType(event.target.value)} />
              </label>
              <label>
                <span>Asset</span>
                <input value={strategyAsset} onChange={(event) => setStrategyAsset(event.target.value.toUpperCase())} />
              </label>
              <label>
                <span>Timeframe</span>
                <input value={strategyTimeframe} onChange={(event) => setStrategyTimeframe(event.target.value.toUpperCase())} />
              </label>
              <label>
                <span>Optimize</span>
                <input value={strategyOptimizeTarget} onChange={(event) => setStrategyOptimizeTarget(event.target.value)} />
              </label>
              <label className="form-grid__full">
                <span>Entry rule</span>
                <input value={strategyEntryRule} onChange={(event) => setStrategyEntryRule(event.target.value)} />
              </label>
              <label>
                <span>Stop loss %</span>
                <input value={strategyStopLoss} onChange={(event) => setStrategyStopLoss(event.target.value)} />
              </label>
              <label>
                <span>Take profit %</span>
                <input value={strategyTakeProfit} onChange={(event) => setStrategyTakeProfit(event.target.value)} />
              </label>
              <label className="form-grid__full">
                <span>Optimization goal</span>
                <input value={strategyGoal} onChange={(event) => setStrategyGoal(event.target.value)} />
              </label>
            </div>
            <div className="prompt-output">
              <span className="panel-label">Generated prompt</span>
              <p>{strategyPrompt}</p>
            </div>
            <button type="button" className="button button--secondary" onClick={() => handleCopyPrompt('strategy', strategyPrompt)}>
              {copiedPrompt === 'strategy' ? 'Copied strategy prompt' : 'Copy strategy prompt'}
            </button>
          </section>

          <section className="automation-card">
            <div className="automation-card__header">
              <span className="step-card__step">3. Multi-Asset Scan</span>
              <p>Turn a basket of symbols into one scan request so you can compare confluence and breakout quality quickly.</p>
            </div>
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
                <span>Condition</span>
                <input value={scanCondition} onChange={(event) => setScanCondition(event.target.value)} />
              </label>
            </div>
            <div className="prompt-output">
              <span className="panel-label">Generated prompt</span>
              <p>{scanPrompt}</p>
            </div>
            <button type="button" className="button button--secondary" onClick={() => handleCopyPrompt('scan', scanPrompt)}>
              {copiedPrompt === 'scan' ? 'Copied scan prompt' : 'Copy scan prompt'}
            </button>
          </section>

          <section className="automation-card">
            <div className="automation-card__header">
              <span className="step-card__step">4. Smart Alert Brief</span>
              <p>Prepare an alert instruction for Telegram or another alert channel, with the exact follow-up analysis you want.</p>
            </div>
            <div className="form-grid">
              <label>
                <span>Asset</span>
                <input value={alertAsset} onChange={(event) => setAlertAsset(event.target.value.toUpperCase())} />
              </label>
              <label>
                <span>Direction</span>
                <input value={alertDirection} onChange={(event) => setAlertDirection(event.target.value)} />
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
                <span>Extra condition</span>
                <input value={alertCondition} onChange={(event) => setAlertCondition(event.target.value)} />
              </label>
              <label className="form-grid__full">
                <span>Follow-up analysis focus</span>
                <input value={alertAnalysisFocus} onChange={(event) => setAlertAnalysisFocus(event.target.value)} />
              </label>
            </div>
            <div className="prompt-output">
              <span className="panel-label">Generated prompt</span>
              <p>{alertPrompt}</p>
            </div>
            <button type="button" className="button button--secondary" onClick={() => handleCopyPrompt('alert', alertPrompt)}>
              {copiedPrompt === 'alert' ? 'Copied alert prompt' : 'Copy alert prompt'}
            </button>
          </section>
        </div>
      </section>
    </div>
  )
}

export default App
