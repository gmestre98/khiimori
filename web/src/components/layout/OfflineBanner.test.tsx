import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OfflineBanner } from './OfflineBanner'

// Override navigator.onLine for the duration of a test.
function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value })
}

afterEach(() => {
  setOnline(true)
})

describe('OfflineBanner', () => {
  it('renders nothing while online', () => {
    setOnline(true)
    const { container } = render(<OfflineBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows an offline status message while offline', () => {
    setOnline(false)
    render(<OfflineBanner />)
    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent(/offline/i)
  })
})
