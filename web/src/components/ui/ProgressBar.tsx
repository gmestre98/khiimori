export type ProgressBarVariant = 'default' | 'over' | 'warning'

export interface ProgressBarProps {
  /** Value in [0, 1]. Values above 1 are clamped visually but the variant can reflect over-budget. */
  value: number
  variant?: ProgressBarVariant
  /** Accessible label for the progress bar. */
  label: string
  /** Optional visible text shown alongside the bar. */
  caption?: string
  className?: string
}

export function ProgressBar({
  value,
  variant = 'default',
  label,
  caption,
  className = '',
}: ProgressBarProps) {
  const pct = Math.min(Math.max(value, 0), 1) * 100
  const fillClass = [
    'progress-bar-fill',
    variant === 'over' ? 'progress-bar-fill--over' : '',
    variant === 'warning' ? 'progress-bar-fill--warning' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={['progress-bar', className].filter(Boolean).join(' ')}>
      {caption && <span className="progress-bar-caption">{caption}</span>}
      <div
        className="progress-bar-track"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className={fillClass} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
