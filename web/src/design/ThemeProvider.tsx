import { useEffect, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'

// ThemeProvider reads the user's theme preference from the auth context and
// applies it to <html data-theme="..."> so tokens.css [data-theme] selectors
// take effect. When preference is 'system' (or the user is not yet loaded),
// the attribute is removed and @media prefers-color-scheme handles it.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const theme = user?.theme ?? 'system'

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'light' || theme === 'dark') {
      root.setAttribute('data-theme', theme)
    } else {
      root.removeAttribute('data-theme')
    }
  }, [theme])

  return <>{children}</>
}
