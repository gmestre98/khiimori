import { useEffect, useState } from 'react'
import { UnauthorizedError, fetchTripUsage, type TripUsage } from '../lib/api'

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

interface UsageBarProps {
  tripId: string
  // Incremented externally to trigger a usage refresh after a photo upload/delete.
  refreshKey?: number
}

export function UsageBar({ tripId, refreshKey = 0 }: UsageBarProps) {
  const [usage, setUsage] = useState<TripUsage | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchTripUsage(tripId, controller.signal)
      .then((u) => setUsage(u))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (err instanceof UnauthorizedError) return
        // silently ignore — the bar just stays hidden
      })
    return () => controller.abort()
  }, [tripId, refreshKey])

  if (!usage || usage.used_bytes === 0) return null

  const pct = Math.min(usage.used_pct, 100)
  const atCap = usage.used_bytes >= usage.cap_bytes
  const nearCap = usage.near_cap

  return (
    <div
      className={`usage-bar-wrap${atCap ? ' usage-bar-wrap--cap' : nearCap ? ' usage-bar-wrap--warn' : ''}`}
      aria-label={`Photo storage: ${formatBytes(usage.used_bytes)} of ${formatBytes(usage.cap_bytes)} used`}
    >
      <div className="usage-bar-label">
        <span className="usage-bar-text">
          {atCap ? (
            <>
              Storage full — {formatBytes(usage.used_bytes)} of {formatBytes(usage.cap_bytes)}.{' '}
              <span className="usage-bar-hint">Delete photos to free space.</span>
            </>
          ) : nearCap ? (
            <>
              {formatBytes(usage.used_bytes)} of {formatBytes(usage.cap_bytes)} used —{' '}
              <span className="usage-bar-hint">approaching limit.</span>
            </>
          ) : (
            <>
              {formatBytes(usage.used_bytes)} of {formatBytes(usage.cap_bytes)} used
            </>
          )}
        </span>
        <span className="usage-bar-pct">{pct.toFixed(0)}%</span>
      </div>
      <div
        className="usage-bar-track"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`usage-bar-fill${atCap ? ' usage-bar-fill--cap' : nearCap ? ' usage-bar-fill--warn' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
