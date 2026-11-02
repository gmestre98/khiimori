import { useOutletContext } from 'react-router-dom'
import type { Trip } from '../lib/api'
import type { TripDaysState } from './tripDays'

// DayViewContext is the shape TripShell passes down via Outlet context.
// tripDays is the shell's cache-first load of every day in the trip (shared by
// the desktop day strip, the Days list, Journal and Map). It's optional so
// screens rendered outside the shell in tests can still supply just { trip }.
export interface DayViewContext {
  trip: Trip
  tripDays?: TripDaysState
}

// useTripShell is the typed outlet-context hook for components that render
// inside TripShell (DayView and the Milestone 04–07 surfaces).
export function useTripShell(): DayViewContext {
  return useOutletContext<DayViewContext>()
}
