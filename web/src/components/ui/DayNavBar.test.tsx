import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DayNavBar } from './DayNavBar'

afterEach(cleanup)

const dates = ['2026-06-01', '2026-06-02', '2026-06-03']

describe('DayNavBar', () => {
  it('renders a navigation landmark', () => {
    render(<DayNavBar dates={dates} currentDate={dates[0]} onDateChange={() => {}} />)
    expect(screen.getByRole('navigation', { name: 'Day navigation' })).toBeInTheDocument()
  })

  it('renders prev and next buttons', () => {
    render(<DayNavBar dates={dates} currentDate={dates[1]} onDateChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Previous day' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next day' })).toBeInTheDocument()
  })

  it('disables prev button on first date', () => {
    render(<DayNavBar dates={dates} currentDate={dates[0]} onDateChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Previous day' })).toBeDisabled()
  })

  it('disables next button on last date', () => {
    render(<DayNavBar dates={dates} currentDate={dates[2]} onDateChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled()
  })

  it('enables both buttons on middle dates', () => {
    render(<DayNavBar dates={dates} currentDate={dates[1]} onDateChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Previous day' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next day' })).not.toBeDisabled()
  })

  it('calls onDateChange with previous date when prev is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DayNavBar dates={dates} currentDate={dates[1]} onDateChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Previous day' }))
    expect(onChange).toHaveBeenCalledWith(dates[0])
  })

  it('calls onDateChange with next date when next is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DayNavBar dates={dates} currentDate={dates[1]} onDateChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Next day' }))
    expect(onChange).toHaveBeenCalledWith(dates[2])
  })

  it('calls onDateChange when select changes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DayNavBar dates={dates} currentDate={dates[0]} onDateChange={onChange} />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Select day' }), dates[2])
    expect(onChange).toHaveBeenCalledWith(dates[2])
  })

  it('renders an option for each date', () => {
    render(<DayNavBar dates={dates} currentDate={dates[0]} onDateChange={() => {}} />)
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })
})
