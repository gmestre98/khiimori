import { useEffect, useState } from 'react'
import { startWriteQueueCoordination } from '../../lib/writeQueueCoordination'

// SyncStatus (M09.4 S4) starts the offline write-queue coordination for the
// authenticated app and shows transient feedback when queued offline writes
// replay on reconnect. It renders nothing in the steady state.
//
// The queue + replay engine are owned by Milestone 04 (mutationQueue /
// replayQueue); this component only drives them from the app lifecycle and
// reports the outcome to the user.
export function SyncStatus() {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const stop = startWriteQueueCoordination(
      (results) => {
        const n = results.filter((r) => r.outcome === 'success').length
        if (n > 0) setMessage(`Synced ${n} change${n === 1 ? '' : 's'}.`)
      },
      () => {
        setMessage('Some changes couldn’t sync yet — they’ll retry when you reconnect.')
      },
    )
    return stop
  }, [])

  // Auto-dismiss the transient message a few seconds after it appears.
  useEffect(() => {
    if (!message) return
    const id = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(id)
  }, [message])

  if (!message) return null
  return (
    <div className="sync-status" role="status" aria-live="polite">
      {message}
    </div>
  )
}
