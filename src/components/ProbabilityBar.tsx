interface ProbabilityBarProps {
  bullish: number
  bearish: number
  sideways: number
}

export function ProbabilityBar({ bullish, bearish, sideways }: ProbabilityBarProps) {
  return (
    <div className="probability">
      <div className="probability__row">
        <span>Bullish</span>
        <strong>{bullish}%</strong>
      </div>
      <div className="probability__track" aria-hidden="true">
        <div className="probability__segment probability__segment--bullish" style={{ width: `${bullish}%` }} />
        <div className="probability__segment probability__segment--sideways" style={{ width: `${sideways}%` }} />
        <div className="probability__segment probability__segment--bearish" style={{ width: `${bearish}%` }} />
      </div>
      <div className="probability__legend">
        <span>Sideways {sideways}%</span>
        <span>Bearish {bearish}%</span>
      </div>
    </div>
  )
}
