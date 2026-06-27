import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuickActionDialog } from './QuickActionDialog'

afterEach(cleanup)

function setWidth(width: number) {
  ;(window as { innerWidth: number }).innerWidth = width
}

function renderDialog(props: Partial<React.ComponentProps<typeof QuickActionDialog>> = {}) {
  const onClose = props.onClose ?? vi.fn()
  render(
    <QuickActionDialog open onClose={onClose} title="Quick add" {...props}>
      <input aria-label="Title field" />
      <button>Save</button>
    </QuickActionDialog>,
  )
  return { onClose }
}

describe('QuickActionDialog', () => {
  it('renders a bottom Sheet on mobile', () => {
    setWidth(375)
    renderDialog()
    // Sheet renders the overlay test id.
    expect(screen.getByTestId('sheet-overlay')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Quick add' })).toBeInTheDocument()
  })

  it('renders a centred modal on laptop', () => {
    setWidth(1280)
    renderDialog()
    expect(screen.getByTestId('quick-action-backdrop')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Quick add' })).toBeInTheDocument()
  })

  it('renders nothing when closed', () => {
    setWidth(1280)
    render(
      <QuickActionDialog open={false} onClose={() => {}} title="Quick add">
        <p>Body</p>
      </QuickActionDialog>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('dismisses on Escape (laptop modal)', () => {
    setWidth(1280)
    const { onClose } = renderDialog()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('dismisses on backdrop click (laptop modal)', async () => {
    setWidth(1280)
    const user = userEvent.setup()
    const { onClose } = renderDialog()
    await user.click(screen.getByTestId('quick-action-backdrop'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('keeps focus inside the laptop modal when tabbing past the last control', async () => {
    setWidth(1280)
    const user = userEvent.setup()
    renderDialog()
    const save = screen.getByRole('button', { name: 'Save' })
    save.focus()
    expect(save).toHaveFocus()
    // Tabbing from the last focusable wraps back into the dialog, never escaping.
    await user.tab()
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement)
  })
})
