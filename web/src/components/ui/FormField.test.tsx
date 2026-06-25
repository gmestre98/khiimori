import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { FormField } from './FormField'
import { Input } from './Input'

afterEach(cleanup)

describe('FormField', () => {
  it('renders the label text', () => {
    render(
      <FormField label="Email">
        <Input aria-label="Email" />
      </FormField>,
    )
    expect(screen.getByText('Email')).toBeInTheDocument()
  })

  it('associates label with input via htmlFor', () => {
    render(
      <FormField label="Email" htmlFor="email">
        <Input id="email" />
      </FormField>,
    )
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('renders hint text', () => {
    render(
      <FormField label="Name" hint="Comma-separated">
        <Input aria-label="Name" />
      </FormField>,
    )
    expect(screen.getByText('Comma-separated')).toBeInTheDocument()
  })

  it('renders error with role=alert', () => {
    render(
      <FormField label="Name" error="Required">
        <Input aria-label="Name" />
      </FormField>,
    )
    const error = screen.getByRole('alert')
    expect(error).toHaveTextContent('Required')
    expect(error).toHaveClass('form-field-error')
  })

  it('renders no error element when error is null', () => {
    render(
      <FormField label="Name" error={null}>
        <Input aria-label="Name" />
      </FormField>,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
