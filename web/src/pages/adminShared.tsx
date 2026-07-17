import { useState } from 'react'

// Shared building blocks for the admin backoffice (M08.5 redesign): the avatar
// with an initial fallback and the deterministic tint that colours it. Kept in
// one place so the Users list, the Overview activity feed and the rail footer
// all render identical-looking avatars.

// initialsOf derives up to two uppercase letters from a name ("Maria Costa" →
// "MC"), falling back to the first character of the email/label.
export function initialsOf(name: string, fallback: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (fallback.trim()[0] ?? '?').toUpperCase()
}

// TINTS is a small palette of {bg, fg} token pairs from the design system. A
// user is assigned one deterministically from a seed, so the same person keeps
// the same colour across renders without storing anything.
const TINTS = [
  { bg: 'var(--accent-tint-2)', fg: 'var(--accent)' },
  { bg: 'var(--amber-tint)', fg: 'var(--amber)' },
  { bg: 'var(--accent-tint)', fg: 'var(--accent)' },
  { bg: 'var(--surface-3)', fg: 'var(--ink-2)' },
]

export function avatarTint(seed: string): { bg: string; fg: string } {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return TINTS[h % TINTS.length]
}

// AdminAvatar shows a profile picture, falling back to a tinted initial circle
// when there's no avatar URL or the image fails to load.
export function AdminAvatar({
  name,
  email,
  avatar,
  size = 32,
}: {
  name: string
  email: string
  avatar?: string
  size?: number
}) {
  const [imgOk, setImgOk] = useState(true)
  const seed = email || name
  if (avatar && imgOk) {
    return (
      <div className="admin-av" style={{ width: size, height: size }}>
        <img src={avatar} alt="" onError={() => setImgOk(false)} />
      </div>
    )
  }
  const tint = avatarTint(seed)
  return (
    <div
      className="admin-av"
      style={{ width: size, height: size, background: tint.bg, color: tint.fg }}
    >
      {initialsOf(name, email)}
    </div>
  )
}
