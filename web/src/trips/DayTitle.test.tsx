import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DayTitle } from './DayTitle'
import * as api from '../lib/api'

vi.mock('../lib/api', async (importOriginal) => {
  const orig = await importOriginal<typeof api>()
  return { ...orig, setDayTitle: vi.fn() }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderTitle(title = '', onSaved = vi.fn()) {
  render(
    <DayTitle tripId="trip-1" date="2026-11-19" title={title} place="Dakar" onSaved={onSaved} />,
  )
  return onSaved
}

describe('DayTitle', () => {
  it('shows the place when no custom title is set, and the title when it is', () => {
    renderTitle()
    expect(screen.getByRole('heading', { level: 1, name: 'Dakar' })).toBeInTheDocument()
    cleanup()
    renderTitle('Gorée and the corniche')
    expect(
      screen.getByRole('heading', { level: 1, name: 'Gorée and the corniche' }),
    ).toBeInTheDocument()
  })

  it('renames the day', async () => {
    const user = userEvent.setup()
    vi.mocked(api.setDayTitle).mockResolvedValue('Gorée and the corniche')
    const onSaved = renderTitle()
    await user.click(screen.getByRole('button', { name: 'Rename this day' }))
    const input = screen.getByLabelText('Day title')
    expect(input).toHaveValue('Dakar')
    await user.clear(input)
    await user.type(input, '  Gorée and the corniche {Enter}')
    await waitFor(() =>
      expect(api.setDayTitle).toHaveBeenCalledWith(
        'trip-1',
        '2026-11-19',
        'Gorée and the corniche',
      ),
    )
    expect(onSaved).toHaveBeenCalledWith('Gorée and the corniche')
    expect(screen.queryByLabelText('Day title')).not.toBeInTheDocument()
  })

  it('clearing the box goes back to the place name', async () => {
    const user = userEvent.setup()
    vi.mocked(api.setDayTitle).mockResolvedValue('')
    const onSaved = renderTitle('Gorée')
    await user.click(screen.getByRole('button', { name: 'Rename this day' }))
    await user.clear(screen.getByLabelText('Day title'))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.setDayTitle).toHaveBeenCalledWith('trip-1', '2026-11-19', ''))
    expect(onSaved).toHaveBeenCalledWith('')
  })

  it('does not save when nothing changed, and Escape cancels', async () => {
    const user = userEvent.setup()
    renderTitle()
    await user.click(screen.getByRole('button', { name: 'Rename this day' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(api.setDayTitle).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Rename this day' }))
    await user.type(screen.getByLabelText('Day title'), ' edited{Escape}')
    expect(screen.queryByLabelText('Day title')).not.toBeInTheDocument()
    expect(api.setDayTitle).not.toHaveBeenCalled()
  })

  it('shows an error and stays open when saving fails', async () => {
    const user = userEvent.setup()
    vi.mocked(api.setDayTitle).mockRejectedValue(new Error('API returned HTTP 500'))
    renderTitle()
    await user.click(screen.getByRole('button', { name: 'Rename this day' }))
    await user.type(screen.getByLabelText('Day title'), '!{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the title')
    expect(screen.getByLabelText('Day title')).toBeInTheDocument()
  })
})
