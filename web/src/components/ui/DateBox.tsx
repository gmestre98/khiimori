import type { CSSProperties } from 'react'

// parseISO reads a YYYY-MM-DD date in local time (no timezone shift).
function parseISO(iso: string): Date {
  return new Date(iso + 'T00:00:00')
}

// DateBox is the redesign's signature element: a big serif day number over a
// mono weekday, with a 3px right border in the day's country colour. An empty
// day (nothing planned) draws the border dashed and faded.
export function DateBox({
  date,
  color,
  empty = false,
  size = 'sm',
  showMonth = false,
}: {
  date: string
  color: string
  empty?: boolean
  size?: 'sm' | 'md' | 'lg'
  showMonth?: boolean
}) {
  const d = parseISO(date)
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' })
  const month = d.toLocaleDateString('en-US', { month: 'short' })
  return (
    <span
      className={[
        'date-box',
        size !== 'sm' ? `date-box--${size}` : '',
        empty ? 'date-box--empty' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--country': color } as CSSProperties}
      aria-hidden="true"
    >
      <span className="date-box-num">{d.getDate()}</span>
      <span className="date-box-wd">{showMonth ? `${wd} ${month}` : wd}</span>
    </span>
  )
}
