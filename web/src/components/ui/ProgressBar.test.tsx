import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ProgressBar } from './ProgressBar'

afterEach(cleanup)

describe('ProgressBar', () => {
  it('renders a progressbar role', () => {
    render(<ProgressBar value={0.5} label="Budget" />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('sets aria-label', () => {
    render(<ProgressBar value={0.5} label="Accommodation budget" />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-label', 'Accommodation budget')
  })

  it('sets aria-valuenow to rounded percentage', () => {
    render(<ProgressBar value={0.75} label="Budget" />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75')
  })

  it('clamps value above 1 to 100%', () => {
    render(<ProgressBar value={1.5} label="Budget" />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  it('clamps negative value to 0%', () => {
    render(<ProgressBar value={-0.2} label="Budget" />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })

  it('applies over variant class', () => {
    render(<ProgressBar value={1.2} label="Budget" variant="over" />)
    expect(document.querySelector('.progress-bar-fill--over')).toBeInTheDocument()
  })

  it('applies warning variant class', () => {
    render(<ProgressBar value={0.8} label="Budget" variant="warning" />)
    expect(document.querySelector('.progress-bar-fill--warning')).toBeInTheDocument()
  })

  it('renders caption when provided', () => {
    render(<ProgressBar value={0.5} label="Budget" caption="Food: €50 / €100" />)
    expect(screen.getByText('Food: €50 / €100')).toBeInTheDocument()
  })

  it('omits caption element when not provided', () => {
    render(<ProgressBar value={0.5} label="Budget" />)
    expect(document.querySelector('.progress-bar-caption')).not.toBeInTheDocument()
  })
})
