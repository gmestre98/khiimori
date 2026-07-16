import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TripSharingPage } from './TripSharingPage'
import { TripShellRoute } from './TripShell'
import * as api from '../lib/api'
import type { Trip } from '../lib/api'
import { AuthContext, type AuthContextValue } from '../auth/AuthContext'

const mockTrip: Trip = {
  id: 'trip-1',
  owner_id: 'user-owner',
  name: 'Test Trip',
  destinations: [],
  start_date: '2026-06-01',
  end_date: '2026-06-05',
  base_currency: 'EUR',
  cover: '',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  is_current: false,
}

const ownerProfile: api.Profile = {
  id: 'user-owner',
  name: 'Owner',
  email: 'owner@example.com',
  avatar: '',
  home_base: '',
  theme: 'light',
  default_currency: 'EUR',
  is_admin: false,
}

const viewerProfile: api.Profile = {
  id: 'user-viewer',
  name: 'Viewer',
  email: 'viewer@example.com',
  avatar: '',
  home_base: '',
  theme: 'light',
  default_currency: 'EUR',
  is_admin: false,
}

const mockSharingData: api.SharingData = {
  members: [
    { id: 'mem-1', trip_id: 'trip-1', user_id: 'user-owner', role: 'owner' },
    { id: 'mem-2', trip_id: 'trip-1', user_id: 'user-viewer', role: 'viewer' },
  ],
  invitations: [
    {
      id: 'inv-1',
      trip_id: 'trip-1',
      email: 'friend@example.com',
      role: 'editor',
      status: 'sent',
    },
  ],
}

vi.mock('../lib/api', async (importOriginal) => {
  const orig = await importOriginal<typeof api>()
  return {
    ...orig,
    fetchTrips: vi.fn(),
    fetchSharingData: vi.fn(),
    sendInvitation: vi.fn(),
    revokeInvitation: vi.fn(),
    changeMemberRole: vi.fn(),
    revokeMember: vi.fn(),
  }
})

function makeAuthCtx(profile: api.Profile): AuthContextValue {
  return {
    status: 'authenticated',
    user: profile,
    signIn: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    setProfile: vi.fn(),
  }
}

function renderPage(profile: api.Profile = ownerProfile) {
  return render(
    <AuthContext.Provider value={makeAuthCtx(profile)}>
      <MemoryRouter
        initialEntries={[{ pathname: '/trips/trip-1/sharing', state: { trip: mockTrip } }]}
      >
        <Routes>
          <Route path="/trips/:tripId" element={<TripShellRoute />}>
            <Route path="sharing" element={<TripSharingPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

beforeEach(() => {
  vi.mocked(api.fetchTrips).mockResolvedValue({ current: [], upcoming: [], past: [] })
  vi.mocked(api.fetchSharingData).mockResolvedValue(mockSharingData)
  vi.mocked(api.sendInvitation).mockResolvedValue({
    id: 'inv-new',
    trip_id: 'trip-1',
    email: 'new@example.com',
    role: 'viewer',
    status: 'sent',
  })
  vi.mocked(api.revokeInvitation).mockResolvedValue(undefined)
  vi.mocked(api.changeMemberRole).mockResolvedValue(undefined)
  vi.mocked(api.revokeMember).mockResolvedValue(undefined)
})

describe('TripSharingPage', () => {
  it('shows the Sharing heading', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Sharing' })).toBeInTheDocument(),
    )
  })

  it('lists current members', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('user-owner')).toBeInTheDocument())
    expect(screen.getByText('user-viewer')).toBeInTheDocument()
  })

  it('shows invite form for owner', async () => {
    renderPage(ownerProfile)
    await waitFor(() => expect(screen.getByLabelText('Email address')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Send Invite' })).toBeInTheDocument()
  })

  it('hides invite form for non-owner', async () => {
    renderPage(viewerProfile)
    await waitFor(() => expect(screen.getByText('user-owner')).toBeInTheDocument())
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument()
  })

  it('shows pending invitations for owner', async () => {
    renderPage(ownerProfile)
    await waitFor(() => expect(screen.getByText('friend@example.com')).toBeInTheDocument())
  })

  it('owner can submit invite form', async () => {
    const user = userEvent.setup()
    renderPage(ownerProfile)
    await waitFor(() => expect(screen.getByLabelText('Email address')).toBeInTheDocument())

    await user.type(screen.getByLabelText('Email address'), 'new@example.com')
    await user.click(screen.getByRole('button', { name: 'Send Invite' }))

    await waitFor(() =>
      expect(api.sendInvitation).toHaveBeenCalledWith('trip-1', 'new@example.com', 'viewer'),
    )
  })

  it('flags a malformed email on blur and blocks send', async () => {
    const user = userEvent.setup()
    renderPage(ownerProfile)
    await waitFor(() => expect(screen.getByLabelText('Email address')).toBeInTheDocument())

    const field = screen.getByLabelText('Email address')
    await user.type(field, 'not-an-email')
    await user.tab() // blur

    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/valid email address/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send Invite' })).toBeDisabled()
    expect(api.sendInvitation).not.toHaveBeenCalled()
  })

  it('clears the malformed-email flag once the address becomes valid', async () => {
    const user = userEvent.setup()
    renderPage(ownerProfile)
    await waitFor(() => expect(screen.getByLabelText('Email address')).toBeInTheDocument())

    const field = screen.getByLabelText('Email address')
    await user.type(field, 'bad')
    await user.tab()
    expect(field).toHaveAttribute('aria-invalid', 'true')

    await user.type(field, '@example.com')
    expect(field).not.toHaveAttribute('aria-invalid')
    expect(screen.getByRole('button', { name: 'Send Invite' })).toBeEnabled()
  })

  it('enables native email autocomplete on the invite field', async () => {
    renderPage(ownerProfile)
    await waitFor(() => expect(screen.getByLabelText('Email address')).toBeInTheDocument())
    expect(screen.getByLabelText('Email address')).toHaveAttribute('autocomplete', 'email')
  })

  it('shows error when invite fails', async () => {
    vi.mocked(api.sendInvitation).mockRejectedValue(new Error('rate limited'))
    const user = userEvent.setup()
    renderPage(ownerProfile)
    await waitFor(() => expect(screen.getByLabelText('Email address')).toBeInTheDocument())

    await user.type(screen.getByLabelText('Email address'), 'fail@example.com')
    await user.click(screen.getByRole('button', { name: 'Send Invite' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('rate limited'))
  })

  it('owner can open revoke-member modal and confirm', async () => {
    const user = userEvent.setup()
    renderPage(ownerProfile)
    await waitFor(() => expect(screen.getByText('user-viewer')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Revoke access for user-viewer/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Revoke' }))
    await waitFor(() => expect(api.revokeMember).toHaveBeenCalledWith('trip-1', 'user-viewer'))
  })

  it('owner can change a member role via the dropdown', async () => {
    const user = userEvent.setup()
    renderPage(ownerProfile)
    await waitFor(() => expect(screen.getByText('user-viewer')).toBeInTheDocument())

    const select = screen.getByRole('combobox', { name: /Change role for user-viewer/i })
    await user.selectOptions(select, 'editor')

    await waitFor(() =>
      expect(api.changeMemberRole).toHaveBeenCalledWith('trip-1', 'user-viewer', 'editor'),
    )
  })

  it('revoke-member modal can be cancelled', async () => {
    const user = userEvent.setup()
    renderPage(ownerProfile)
    await waitFor(() => expect(screen.getByText('user-viewer')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Revoke access for user-viewer/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.revokeMember).not.toHaveBeenCalled()
  })

  it('owner can revoke a pending invitation', async () => {
    const user = userEvent.setup()
    renderPage(ownerProfile)
    await waitFor(() => expect(screen.getByText('friend@example.com')).toBeInTheDocument())

    await user.click(
      screen.getByRole('button', { name: /Revoke invitation for friend@example.com/i }),
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Revoke' }))
    await waitFor(() => expect(api.revokeInvitation).toHaveBeenCalledWith('trip-1', 'inv-1'))
  })

  it('non-owner cannot see revoke or role-change controls', async () => {
    renderPage(viewerProfile)
    await waitFor(() => expect(screen.getByText('user-owner')).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: /Revoke/i })).not.toBeInTheDocument()
    // The DayNav select is present in TripShell; ensure no role-change select exists.
    expect(screen.queryByRole('combobox', { name: /Change role/i })).not.toBeInTheDocument()
  })

  it('shows members by name/email with an avatar, not the raw id', async () => {
    vi.mocked(api.fetchSharingData).mockResolvedValue({
      members: [
        {
          id: 'mem-1',
          trip_id: 'trip-1',
          user_id: 'user-owner',
          role: 'owner',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          avatar: 'https://example.com/ada.png',
        },
      ],
      invitations: [],
    })
    renderPage()

    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument())
    // Email shown as secondary line; raw user id never rendered.
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
    expect(screen.queryByText('user-owner')).not.toBeInTheDocument()
    // Avatar renders the profile picture.
    const avatar = document.querySelector('img.avatar') as HTMLImageElement | null
    expect(avatar?.src).toBe('https://example.com/ada.png')
  })
})
