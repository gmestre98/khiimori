import { useEffect, useState } from 'react'
import { fetchHealth, healthUrl } from './lib/api'

// State of the health probe: loading on mount, then either the healthy status
// from /readyz or an error message. A discriminated union so the render can't
// show a stale status alongside an error.
type State =
  | { kind: 'loading' }
  | { kind: 'healthy'; status: string }
  | { kind: 'error'; message: string }

// HealthCheck is Milestone 01's connectivity probe: on mount it calls the API's
// /readyz through the env-driven client (S1) and shows whether the deployed
// stack is wired end to end (epic AC2). This is not real UI — it's the proof the
// web app can reach the API cross-origin (verified against prod in S4).
export function HealthCheck() {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    // Abort the in-flight request if the component unmounts (or the effect
    // re-runs under StrictMode's double-invoke in dev) so we don't setState on
    // an unmounted component or race two responses.
    const controller = new AbortController()
    fetchHealth(controller.signal)
      .then((health) => setState({ kind: 'healthy', status: health.status }))
      .catch((err: unknown) => {
        // A deliberate abort isn't a failure to report — the component is gone.
        if (controller.signal.aborted) return
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'unreachable',
        })
      })
    return () => controller.abort()
  }, [])

  return (
    <section className="health-check">
      <h2>API health</h2>
      <p className="health-target">
        <code>{healthUrl}</code>
      </p>
      {state.kind === 'loading' && <p role="status">Checking…</p>}
      {state.kind === 'healthy' && (
        <p className="health-ok" role="status">
          ✓ Healthy ({state.status})
        </p>
      )}
      {state.kind === 'error' && (
        <p className="health-error" role="alert">
          ✗ Unreachable — {state.message}
        </p>
      )}
    </section>
  )
}
