# Automation Lab Prompt Templates

## Overview
WaveMap AI now includes a local prompt builder for four workflow types. These prompts are designed to be copied into an external charting AI, Pine Script assistant, or alerting workflow.

## 1. Auto-Prep Chart Prompt
Template:

```text
Switch to [asset] [timeframe], add [indicators], draw [drawing tools], highlight the [key zone], identify and draw [patterns], switch to [layout] layout with [comparison assets] on the side charts, enable crosshair sync, and take a screenshot.
```

## 2. Strategy & Backtest Prompt
Template:

```text
Write a Pine Script [strategy type] strategy for [asset] on [timeframe] that enters long when [entry rule]. Add a [stop loss]% stop loss and [take profit]% take profit. Backtest it, show me the performance report, then optimize the [parameter target] to maximize the [goal].
```

## 3. Multi-Asset Scan Prompt
Template:

```text
Analyze [assets] across [timeframes] timeframes. Show me which ones have [target condition] and which are mixed.
```

## 4. Smart Alert Prompt
Template:

```text
Alert me when [asset] [direction] [price level] with [extra condition], and monitor it on [alert channel] so you analyze the [follow-up focus] when it hits.
```

## Notes
- These prompts are generated locally and do not consume OpenAI tokens by themselves.
- OpenAI usage only occurs when running the WaveMap AI chart analysis flow.
- External execution such as TradingView automation, Telegram delivery, or Pine backtesting still depends on the platform or agent you paste the prompt into.
