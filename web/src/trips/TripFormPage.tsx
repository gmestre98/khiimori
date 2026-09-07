import { useNavigate, useLocation, useParams, Navigate, Link } from 'react-router-dom'
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
    return <Navigate to="/" replace />
  }

  function handleSuccess() {
    navigate('/')
  }

  function handleCancel() {
    navigate(-1)
  }

  // Where "← back" returns to. In edit mode we came from the trip; step back into
  // it. In create mode the form is reached from the dashboard, so go there.
  const backTo = isEdit && existingTrip ? `/trips/${existingTrip.id}/plan` : '/'
  const backLabel = isEdit && existingTrip ? `← ${existingTrip.name}` : '← Trips'

  return (
    <section className="trip-form-page">
      <div className="trip-form-wrap">
        <Link
          to={backTo}
          state={isEdit ? { trip: existingTrip } : undefined}
          className="trip-form-back"
        >
          {backLabel}
        </Link>
        <TripForm trip={existingTrip} onSuccess={handleSuccess} onCancel={handleCancel} />
      </div>
    </section>
  )
}
