// Shared destination "scene" used behind day headers and trip-card panels
// (Direction B). With no backend photo field yet, each place gets a stable,
// intentional-feeling golden-hour silhouette chosen by a hash of its name —
// variety without a network image. Swap this for real photography later without
// touching call sites.

// HERO_PALETTES are the gradient stops (top → mid → bottom) for the scene.
const HERO_PALETTES: Array<[string, string, string]> = [
  ['#f6b26b', '#e58b52', '#b65a3f'], // sunset
  ['#e6c493', '#cf9f5f', '#a87b3c'], // sand
  ['#7aa0c4', '#5f7fae', '#3f5680'], // dusk blue
  ['#9ab97e', '#5f8a5a', '#356f57'], // forest
  ['#d69bb0', '#b06a86', '#6d4a6a'], // plum dusk
]

// hashString is a small stable string hash used to pick a palette per place.
function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// HeroScene paints a calm golden-hour silhouette. Purely decorative
// (aria-hidden); position it with the passed className (callers fill their
// container). The gradient is chosen deterministically from `seed`.
export function HeroScene({ seed, className = '' }: { seed: string; className?: string }) {
  const [a, b, c] = HERO_PALETTES[hashString(seed) % HERO_PALETTES.length]
  const gid = `hero-${hashString(seed)}`
  return (
    <svg
      className={['hero-scene', className].filter(Boolean).join(' ')}
      viewBox="0 0 1000 240"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="0.55" stopColor={b} />
          <stop offset="1" stopColor={c} />
        </linearGradient>
      </defs>
      <rect width="1000" height="240" fill={`url(#${gid})`} />
      <circle cx="770" cy="74" r="34" fill="#ffe6bd" opacity="0.85" />
      <path
        d="M0 160 L120 128 L240 152 L360 116 L480 148 L600 112 L740 146 L860 116 L1000 148 V240 H0 Z"
        fill="#3a2018"
        opacity="0.35"
      />
      <path
        d="M0 184 L160 160 L320 182 L500 154 L680 184 L860 160 L1000 178 V240 H0 Z"
        fill="#2a1610"
        opacity="0.5"
      />
    </svg>
  )
}
