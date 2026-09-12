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

// looksLikeUrl guards the optional cover image: only real image sources (http,
// root-relative, data, or blob: object URLs — the latter for an unsaved local
// preview while creating a trip) are used; anything else falls back to the scene.
function looksLikeUrl(s: string): boolean {
  return /^(https?:\/\/|\/|data:image\/|blob:)/.test(s)
}

// HeroScene paints a calm golden-hour silhouette. Purely decorative
// (aria-hidden); position it with the passed className (callers fill their
// container). When `image` is a real image URL (e.g. a trip's cover, once the
// backend sets one) it's used instead of the generated scene — same slot, so
// call sites don't change when photos arrive. The gradient/scene is chosen
// deterministically from `seed`.
//
// `fit` controls how a cover photo fills the slot. 'cover' (default) crops to
// fill — right for the small trip-card thumbnails. 'contain' shows the WHOLE
// photo (never re-cropping what the user framed) over a blurred, enlarged copy
// of itself that fills the rest of the slot — right for the wide day hero, where
// a plain cover-crop would show only a thin middle strip of a landscape photo.
export function HeroScene({
  seed,
  image,
  className = '',
  fit = 'cover',
}: {
  seed: string
  image?: string
  className?: string
  fit?: 'cover' | 'contain'
}) {
  if (image && looksLikeUrl(image)) {
    if (fit === 'contain') {
      const url = `url("${image}")`
      return (
        <div
          className={['hero-scene', 'hero-scene--framed', className].filter(Boolean).join(' ')}
          aria-hidden="true"
        >
          {/* Blurred, enlarged fill so the wide slot is never empty beside the
              photo; the scale hides the blur's soft edges. */}
          <div className="hero-scene-fill" style={{ backgroundImage: url }} />
          {/* The whole cover, uncropped. */}
          <div className="hero-scene-photo" style={{ backgroundImage: url }} />
        </div>
      )
    }
    return (
      <div
        className={['hero-scene', className].filter(Boolean).join(' ')}
        style={{
          backgroundImage: `url("${image}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
        aria-hidden="true"
      />
    )
  }
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
