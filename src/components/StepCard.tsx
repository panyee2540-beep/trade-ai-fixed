import type { ReactNode } from 'react'

interface StepCardProps {
  step: string
  title: string
  subtitle: string
  children: ReactNode
}

export function StepCard({ step, title, subtitle, children }: StepCardProps) {
  return (
    <section className="step-card">
      <div className="step-card__header">
        <span className="step-card__step">{step}</span>
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="step-card__body">{children}</div>
    </section>
  )
}
