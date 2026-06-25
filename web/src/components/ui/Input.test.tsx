import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Input } from './Input'

afterEach(cleanup)

describe('Input', () => {
  it('renders an input element', () => {
    render(<Input aria-label="Name" />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('applies form-input class', () => {
    render(<Input aria-label="Name" />)
    expect(screen.getByRole('textbox')).toHaveClass('form-input')
  })

  it('sets aria-invalid and invalid class when invalid prop is true', () => {
    render(<Input aria-label="Name" invalid />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveClass('form-input--invalid')
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('does not set aria-invalid when invalid is false', () => {
    render(<Input aria-label="Name" invalid={false} />)
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-invalid')
  })

  it('passes through type prop', () => {
    render(<Input aria-label="Date" type="date" />)
    expect(screen.getByLabelText('Date')).toHaveAttribute('type', 'date')
  })

  it('merges extra className', () => {
    render(<Input aria-label="Name" className="extra" />)
    expect(screen.getByRole('textbox')).toHaveClass('form-input', 'extra')
  })
})
