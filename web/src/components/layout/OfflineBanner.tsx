import { useIsOnline } from '../../lib/useIsOnline'

// OfflineBanner (M09.4 S3) gives the traveller a clear, unobtrusive indication
// that they are viewing cached data while offline. It renders nothing when
// online. The current trip stays viewable from the service-worker data cache;
// data that was never cached degrades to each screen's own "couldn't load"
// state rather than crashing.
//
// aria-live=polite announces the state change to assistive tech without
// stealing focus.
export function OfflineBanner() {
  const online = useIsOnline()
  if (online) return null
  return (
    <div className="offline-banner" role="status" aria-live="polite">
      You’re offline — showing saved trip data. Changes you make will sync when you reconnect.
    </div>
  )
}
