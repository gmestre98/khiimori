import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'

afterEach(cleanup)

describe('Button', () => {
  it('renders with default primary variant', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: 'Click me' })).toHaveClass('btn-primary')
  })

  it('applies secondary variant class', () => {
    render(<Button variant="secondary">Cancel</Button>)
    expect(screen.getByRole('button')).toHaveClass('btn-secondary')
  })

  it('applies destructive variant class', () => {
    render(<Button variant="destructive">Delete</Button>)
    expect(screen.getByRole('button')).toHaveClass('btn-danger')
  })

  it('applies ghost variant class', () => {
    render(<Button variant="ghost">Edit</Button>)
    expect(screen.getByRole('button')).toHaveClass('btn-ghost')
  })

  it('applies ghost-danger variant class', () => {
    render(<Button variant="ghost-danger">Remove</Button>)
    expect(screen.getByRole('button')).toHaveClass('btn-ghost-danger')
  })

  it('applies sm size class', () => {
    render(<Button size="sm">Small</Button>)
    expect(screen.getByRole('button')).toHaveClass('btn-sm')
  })

  it('defaults to type=button so it does not submit forms accidentally', () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('passes type=submit when specified', () => {
    render(<Button type="submit">Submit</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  it('is disabled when disabled prop is set', () => {
    render(<Button disabled>Disabled</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Click</Button>)
    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not call onClick when disabled', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Disabled
      </Button>,
    )
    await user.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('merges extra className', () => {
    render(<Button className="my-extra">Label</Button>)
    const btn = screen.getByRole('button')
    expect(btn).toHaveClass('btn-primary')
    expect(btn).toHaveClass('my-extra')
  })
})
