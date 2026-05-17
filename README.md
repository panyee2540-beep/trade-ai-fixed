# WaveMap AI

WaveMap AI is a responsive crypto trading support PWA built for Netlify. It combines:

- Binance spot symbol search
- Live candlestick chart streaming
- Multi-timeframe market review
- Elliott-wave-informed AI analysis
- Conditional buy/sell setup zones with invalidation and risk notes

## Stack

- React 19 + Vite + TypeScript
- TradingView Lightweight Charts
- Netlify Functions
- OpenAI Responses API
- Binance Spot public market data
- Vite PWA plugin

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create a local env file from the example and set your OpenAI key:

```bash
copy .env.example .env
```

3. Run the app:

```bash
npm run dev
```

4. Run with Netlify Functions locally:

```bash
npm run netlify:dev
```

## Required environment variable

- `OPENAI_API_KEY`

Set it locally in `.env` and in Netlify under Site configuration -> Environment variables.

## Main endpoints

- `/.netlify/functions/market-search?q=BTC`
- `/.netlify/functions/market-candles?symbol=BTCUSDT&interval=1h&limit=320`
- `/.netlify/functions/analyze-wave`

## Quality checks

```bash
npm run typecheck
npm run lint
npm run build
```

## Deploy to Netlify

1. Push this project to GitHub, GitLab, or Bitbucket.
2. Create a new Netlify site from that repo.
3. Netlify should detect:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
4. Add `OPENAI_API_KEY` in Netlify environment variables.
5. Deploy.

`netlify.toml` is already included with the build, functions, and SPA redirect configuration.

## Notes

- v1 is crypto spot only.
- The app is analysis-first and does not place trades.
- If AI analysis is unavailable or low-confidence, the app falls back to a rule-based cautionary setup.
- The Elliott Wave prompt reference lives in [docs/elliott-wave-analysis.md](/e:/Script/Trade_AI/docs/elliott-wave-analysis.md).
