import { useEffect, useState } from 'react'

// useVisibleViewport follows the part of the screen the on-screen keyboard
// leaves visible, so a bottom sheet sits above the keyboard (with its buttons
// reachable) instead of behind it. Null where the browser can't tell.
export function useVisibleViewport(active: boolean): { top: number; height: number } | null {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null)
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!active || !vv) return
    const update = () => setBox({ top: vv.offsetTop, height: vv.height })
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      setBox(null)
    }
  }, [active])
  return box
}
