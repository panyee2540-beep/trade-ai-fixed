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
    </div>
  )
}

export default App
