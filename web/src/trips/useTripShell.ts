import { useOutletContext } from 'react-router-dom'
import type { Trip } from '../lib/api'

// DayViewContext is the shape TripShell passes down via Outlet context.
export interface DayViewContext {
  trip: Trip
}

// useTripShell is the typed outlet-context hook for components that render
// inside TripShell (DayView and the Milestone 04–07 surfaces).
export function useTripShell(): DayViewContext {
  return useOutletContext<DayViewContext>()
}
