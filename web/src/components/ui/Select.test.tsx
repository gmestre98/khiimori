import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Select } from './Select'

afterEach(cleanup)

describe('Select', () => {
  it('applies form-select class', () => {
    render(
      <Select aria-label="Category">
        <option value="a">A</option>
      </Select>,
    )
    expect(screen.getByRole('combobox')).toHaveClass('form-select')
  })

  it('sets aria-invalid and invalid class when invalid prop is true', () => {
    render(
      <Select aria-label="Category" invalid>
        <option value="a">A</option>
      </Select>,
    )
    const select = screen.getByRole('combobox')
    expect(select).toHaveClass('form-select--invalid')
    expect(select).toHaveAttribute('aria-invalid', 'true')
  })

  it('does not set aria-invalid when invalid is false', () => {
    render(
      <Select aria-label="Category" invalid={false}>
        <option value="a">A</option>
      </Select>,
    )
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-invalid')
  })

  it('renders option children', () => {
    render(
      <Select aria-label="Category">
        <option value="food">Food</option>
        <option value="transport">Transport</option>
      </Select>,
    )
    expect(screen.getByRole('option', { name: 'Food' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Transport' })).toBeInTheDocument()
  })

  it('merges extra className', () => {
    render(
      <Select aria-label="Category" className="extra">
        <option value="a">A</option>
      </Select>,
    )
    expect(screen.getByRole('combobox')).toHaveClass('form-select', 'extra')
  })
})
