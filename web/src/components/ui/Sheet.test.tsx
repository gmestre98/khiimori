import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sheet } from './Sheet'

afterEach(cleanup)

describe('Sheet', () => {
  it('renders nothing when closed', () => {
    render(
      <Sheet open={false} onClose={() => {}} title="Test sheet">
        <p>Content</p>
      </Sheet>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders dialog when open', () => {
    render(
      <Sheet open onClose={() => {}} title="Add item">
        <p>Content</p>
      </Sheet>,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('dialog has aria-modal and aria-label', () => {
    render(
      <Sheet open onClose={() => {}} title="Add item">
        <p>Content</p>
      </Sheet>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', 'Add item')
  })

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Sheet open onClose={onClose} title="Sheet">
        <p>Content</p>
      </Sheet>,
    )
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when overlay is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Sheet open onClose={onClose} title="Sheet">
        <p>Content</p>
      </Sheet>,
    )
    await user.click(screen.getByTestId('sheet-overlay'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not call onClose when dialog content is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Sheet open onClose={onClose} title="Sheet">
        <p>Content</p>
      </Sheet>,
    )
    await user.click(screen.getByText('Content'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn()
    render(
      <Sheet open onClose={onClose} title="Sheet">
        <p>Content</p>
      </Sheet>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders children inside the dialog', () => {
    render(
      <Sheet open onClose={() => {}} title="Sheet">
        <p>My content</p>
      </Sheet>,
    )
    expect(screen.getByText('My content')).toBeInTheDocument()
  })
})
