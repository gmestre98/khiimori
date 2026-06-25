import { useEffect, useRef, useState } from 'react'
import {
  PhotoCapExceededError,
  UnauthorizedError,
  deletePhoto,
  listPhotos,
  uploadPhoto,
  type Photo,
} from '../lib/api'
import { enqueue } from '../lib/mutationQueue'
import { useIsOnline } from '../lib/useIsOnline'

// PhotoLightbox renders a single photo full-screen with caption.
function PhotoLightbox({ photo, onClose }: { photo: Photo; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="photo-lightbox-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Photo"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="photo-lightbox">
        <button
          type="button"
          className="photo-lightbox-close"
          aria-label="Close photo"
          onClick={onClose}
        >
          ✕
        </button>
        <img
          src={photo.storage_url}
          alt={photo.caption || 'Photo'}
          className="photo-lightbox-img"
        />
        {photo.caption && <p className="photo-lightbox-caption">{photo.caption}</p>}
      </div>
    </div>
  )
}

// PhotoThumb renders a single thumbnail tile in the grid.
function PhotoThumb({
  photo,
  onOpen,
  onDelete,
  readOnly,
}: {
  photo: Photo
  onOpen: () => void
  onDelete: () => void
  readOnly: boolean
}) {
  const src = photo.thumbnail_url || photo.storage_url

  return (
    <div className="photo-thumb">
      <button
        type="button"
        className="photo-thumb-btn"
        aria-label={photo.caption ? `View photo: ${photo.caption}` : 'View photo'}
        onClick={onOpen}
      >
        <img src={src} alt={photo.caption || ''} className="photo-thumb-img" loading="lazy" />
        {photo.caption && <span className="photo-thumb-caption">{photo.caption}</span>}
      </button>
      {!readOnly && (
        <button
          type="button"
          className="photo-thumb-delete"
          aria-label="Delete photo"
          onClick={onDelete}
        >
          ✕
        </button>
      )}
    </div>
  )
}

interface UploadItem {
  id: string // client-generated temporary id
  file: File
  caption: string
  progress: 'uploading' | 'queued' | 'done' | 'error'
  errorMsg?: string
}

interface PhotoGridProps {
  tripId: string
  dayId: string
  /** Called before each upload so JournalEditor can ensure the entry row exists first. */
  onBeforeUpload?: () => Promise<void>
  /** Called after a successful upload or delete so the usage bar can refresh. */
  onPhotoChange?: () => void
  readOnly?: boolean
}

export function PhotoGrid({
  tripId,
  dayId,
  onBeforeUpload,
  onPhotoChange,
  readOnly = false,
}: PhotoGridProps) {
  const online = useIsOnline()
  const [photos, setPhotos] = useState<Photo[]>([])
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [lightbox, setLightbox] = useState<Photo | null>(null)
  const [capError, setCapError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load photos when dayId changes.
  useEffect(() => {
    const controller = new AbortController()
    listPhotos(tripId, dayId, controller.signal)
      .then((ps) => setPhotos(ps))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (err instanceof UnauthorizedError) return
        // silently ignore other load errors — the grid just stays empty
      })
    return () => controller.abort()
  }, [tripId, dayId])

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setCapError(null)

    for (const file of Array.from(files)) {
      const uploadId = crypto.randomUUID()
      const item: UploadItem = {
        id: uploadId,
        file,
        caption: '',
        progress: 'uploading',
      }
      setUploads((prev) => [...prev, item])

      try {
        if (onBeforeUpload) await onBeforeUpload()
        if (!online) {
          // Offline: queue the binary upload; File is structured-cloneable so
          // it persists in IndexedDB and replays when connectivity returns.
          await enqueue('uploadPhoto', { tripId, dayId, file })
          setUploads((prev) =>
            prev.map((u) => (u.id === uploadId ? { ...u, progress: 'queued' } : u)),
          )
          continue
        }
        const photo = await uploadPhoto(tripId, dayId, file)
        setPhotos((prev) => [...prev, photo])
        setUploads((prev) => prev.filter((u) => u.id !== uploadId))
        onPhotoChange?.()
      } catch (err) {
        if (err instanceof PhotoCapExceededError) {
          setCapError(err.serverMessage)
          setUploads((prev) => prev.filter((u) => u.id !== uploadId))
          break
        }
        setUploads((prev) =>
          prev.map((u) =>
            u.id === uploadId ? { ...u, progress: 'error', errorMsg: 'Upload failed' } : u,
          ),
        )
      }
    }
  }

  async function handleDelete(photo: Photo) {
    // Optimistically remove from list.
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
    try {
      await deletePhoto(tripId, dayId, photo.id)
      onPhotoChange?.()
    } catch {
      // Restore on failure.
      setPhotos((prev) => [...prev, photo])
    }
  }

  const hasContent = photos.length > 0 || uploads.length > 0

  return (
    <div className="photo-grid-section">
      {capError && (
        <p role="alert" className="photo-cap-error">
          {capError}
        </p>
      )}

      {hasContent && (
        <div className="photo-grid">
          {photos.map((p) => (
            <PhotoThumb
              key={p.id}
              photo={p}
              onOpen={() => setLightbox(p)}
              onDelete={() => void handleDelete(p)}
              readOnly={readOnly}
            />
          ))}
          {uploads.map((u) => (
            <div key={u.id} className="photo-thumb photo-thumb--uploading">
              <div className="photo-thumb-progress">
                {u.progress === 'uploading' && (
                  <span className="photo-upload-spinner" aria-label="Uploading…" />
                )}
                {u.progress === 'queued' && (
                  <span className="photo-upload-queued" aria-live="polite">
                    Queued
                  </span>
                )}
                {u.progress === 'error' && (
                  <span className="photo-upload-error" aria-live="polite">
                    {u.errorMsg ?? 'Failed'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="photo-file-input"
            aria-label="Attach photos"
            onChange={(e) => void handleFiles(e.target.files)}
          />
          <button
            type="button"
            className="photo-attach-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            + Attach photos
          </button>
        </>
      )}

      {lightbox && <PhotoLightbox photo={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}
