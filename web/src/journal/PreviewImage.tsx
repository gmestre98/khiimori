import { useEffect, useRef, useState } from 'react'

interface PreviewImageProps {
  src: string
  /** Tiny inline base64 data URI (LQIP) shown blurred until the image loads. */
  preview?: string
  alt: string
  /** Class for the blurred preview layer painted behind the image. */
  previewClassName: string
  /** Base class for the <img>. */
  imgClassName: string
  /** Class added to the <img> once it has loaded (drives the fade-in). */
  loadedClassName: string
}

// PreviewImage shows a tiny inline blur-up preview instantly (it arrives with the
// photo JSON, so there is no fetch), then fades the real image in over it once it
// loads. When no preview is supplied (older photos, pre-backfill), the surrounding
// tile's muted background shows through instead. Shared by the journal photo grid
// and the trip travelogue so the load behaviour stays in one place.
export function PreviewImage({
  src,
  preview,
  alt,
  previewClassName,
  imgClassName,
  loadedClassName,
}: PreviewImageProps) {
  const [loaded, setLoaded] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  // A cached image can finish loading before React binds onLoad, which would
  // strand the fade at opacity 0. On mount, adopt the element's completed state.
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) setLoaded(true)
  }, [src])

  return (
    <>
      {preview && (
        <span
          className={previewClassName}
          aria-hidden="true"
          style={{ backgroundImage: `url("${preview}")` }}
        />
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className={`${imgClassName}${loaded ? ` ${loadedClassName}` : ''}`}
        loading="lazy"
        onLoad={() => setLoaded(true)}
      />
    </>
  )
}
