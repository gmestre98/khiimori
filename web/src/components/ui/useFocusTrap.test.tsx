import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { useFocusTrap } from './useFocusTrap'

afterEach(cleanup)

function Trapped({ active = true }: { active?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(active, ref)
  return (
    <div>
      <button>outside</button>
      <div ref={ref} role="dialog" aria-label="trap">
        <button>first</button>
        <button>last</button>
      </div>
    </div>
  )
}

describe('useFocusTrap', () => {
  it('moves focus into the container when activated', () => {
    render(<Trapped />)
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus()
  })

  it('wraps Tab from the last to the first focusable', async () => {
    const user = userEvent.setup()
    render(<Trapped />)
    screen.getByRole('button', { name: 'last' }).focus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus()
  })

  it('wraps Shift+Tab from the first to the last focusable', async () => {
    const user = userEvent.setup()
    render(<Trapped />)
    screen.getByRole('button', { name: 'first' }).focus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'last' })).toHaveFocus()
  })

  it('does nothing when inactive', () => {
    render(<Trapped active={false} />)
    expect(screen.getByRole('button', { name: 'first' })).not.toHaveFocus()
  })
})
