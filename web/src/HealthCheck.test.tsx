import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { HealthCheck } from './HealthCheck'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// Mocking the global fetch lets us assert both renderings without a real API —
// the view's only dependency is the S1 client, which calls fetch under the hood.
describe('HealthCheck', () => {
  it('renders healthy and probes /readyz (not the externally-unrouted /healthz)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ready' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<HealthCheck />)

    expect(await screen.findByText(/healthy/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    // Cloud Run doesn't route /healthz externally — the browser must hit /readyz.
    const calledUrl = String(fetchMock.mock.calls[0][0])
    expect(calledUrl).toMatch(/\/readyz$/)
    expect(calledUrl).not.toMatch(/\/healthz/)
  })

  it('renders an error when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    render(<HealthCheck />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/unreachable/i)
    expect(alert).toHaveTextContent(/network down/i)
  })

  it('renders an error on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({}),
      }),
    )

    render(<HealthCheck />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/HTTP 503/)
  })
})
