import { useEffect, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { applyTheme } from './theme'

// ThemeProvider reads the user's saved theme preference from the auth context and
// applies it app-wide. When the preference is 'system' (or the user is not yet
// loaded), the attribute is removed and @media prefers-color-scheme handles it.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const theme = user?.theme ?? 'system'

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  return <>{children}</>
}
