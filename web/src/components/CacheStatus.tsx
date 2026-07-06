import { useIsOnline } from '../lib/useIsOnline'

// CacheStatus (M11.1 S2) is the subtle "you're looking at saved data, refreshing
// now" affordance for the instant-render cache. A screen shows cached data on
// first paint (fromCache) while a background revalidation runs (isValidating);
// this hint tells the user a fresh copy is on the way without a blocking spinner.
//
// It renders nothing when offline: the app-wide OfflineBanner already says
// "showing saved data" in that case, so this would be redundant. It also renders
// nothing once fresh data has arrived (fromCache === false) or when there was no
// cached data to show (the screen shows its normal loading state instead).
export function CacheStatus({
  fromCache,
  isValidating,
}: {
  fromCache: boolean
  isValidating: boolean
}) {
  const online = useIsOnline()
  if (!online || !fromCache || !isValidating) return null
  return (
    <span className="cache-updating" role="status" aria-live="polite">
      Updating…
    </span>
  )
}
