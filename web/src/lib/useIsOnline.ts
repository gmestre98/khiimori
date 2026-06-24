import { useEffect, useState } from 'react'

// useIsOnline returns true when the browser reports a network connection.
// It tracks window 'online'/'offline' events so components re-render on change.
export function useIsOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const setOn = () => setOnline(true)
    const setOff = () => setOnline(false)
    window.addEventListener('online', setOn)
    window.addEventListener('offline', setOff)
    return () => {
      window.removeEventListener('online', setOn)
      window.removeEventListener('offline', setOff)
    }
  }, [])
  return online
}
