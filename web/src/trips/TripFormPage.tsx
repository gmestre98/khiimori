import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { TripForm } from './TripForm'
import type { Trip } from '../lib/api'

// TripFormPage renders the create or edit form inside the app shell.
// For edit, the existing trip object is passed via router location state
// (set by TripsDashboard when the user clicks "Edit") — no separate GET /trips/:id
// call is needed since the dashboard already has all trip data.
export function TripFormPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams<{ id: string }>()

  const existingTrip = (location.state as { trip?: Trip } | null)?.trip

  const isEdit = id !== undefined

  // If we're in edit mode but have no trip data (e.g. direct URL navigation),
  // redirect back to the dashboard.
  if (isEdit && !existingTrip) {
    navigate('/', { replace: true })
    return null
  }

  function handleSuccess() {
    navigate('/')
  }

  function handleCancel() {
    navigate(-1)
  }

  return (
    <section className="trip-form-page">
      <h2 className="trip-form-page-title">{isEdit ? 'Edit trip' : 'New trip'}</h2>
      <TripForm trip={existingTrip} onSuccess={handleSuccess} onCancel={handleCancel} />
    </section>
  )
}
