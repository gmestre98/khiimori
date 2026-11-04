import { Link } from 'react-router-dom'
import { Icon } from '../components/ui/Icon'
import { INCLUDE_LABELS, isPaid, packageDay, packageForDate, usePackages } from './packages'

// PackageBanner shows, on a day a package covers, which package it is part of,
// which day of it this is, what it includes and whether it's paid. Links to the
// package in Money.
export function PackageBanner({ tripId, date }: { tripId: string; date: string }) {
  const packages = usePackages(tripId)
  const pkg = packageForDate(packages, date)
  if (!pkg) return null
  const { day, of } = packageDay(pkg, date)
  const incl = pkg.includes.map((i) => (INCLUDE_LABELS[i] ?? i).toLowerCase())
  const sub = [
    `Day ${day} of ${of}`,
    incl.length > 0 ? `${incl.join(', ')} included` : '',
    isPaid(pkg) ? 'paid' : 'part paid',
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <Link
      to={`/trips/${tripId}/budget`}
      className="pkg-banner"
      aria-label={`Part of ${pkg.name}: ${sub}`}
    >
      <span className="pkg-banner-icon" aria-hidden="true">
        <Icon name="package" size={18} />
      </span>
      <span className="pkg-banner-text">
        <span className="pkg-banner-title">Part of {pkg.name}</span>
        <span className="pkg-banner-sub">{sub}</span>
      </span>
      <Icon name="chevron-right" size={16} />
    </Link>
  )
}
