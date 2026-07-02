// applyTheme sets (or clears) <html data-theme="..."> so tokens.css takes effect.
// 'light'/'dark' pin the theme; 'system' (or anything else) removes the attribute
// so @media (prefers-color-scheme) decides. Kept in its own module so both the
// ThemeProvider and the profile page (live preview) can import it without
// tripping react-refresh's component-only-export rule.
export function applyTheme(theme: string): void {
  const root = document.documentElement
  if (theme === 'light' || theme === 'dark') {
    root.setAttribute('data-theme', theme)
  } else {
    root.removeAttribute('data-theme')
  }
}
