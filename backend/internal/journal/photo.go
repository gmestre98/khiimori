package journal

import (
	"errors"
	"fmt"
	"time"
)

// Photo is a photo attached to a journal entry, backed by a Cloud Storage object.
// IsThumbnail distinguishes generated thumbnail variants from original uploads;
// only originals (IsThumbnail = false) count toward the per-trip 1 GB cap.
type Photo struct {
	ID             string
	JournalEntryID string
	StorageURL     string // gs:// URI returned by MediaStore.Put
	Caption        string // optional
	SizeBytes      int64
	IsThumbnail    bool
	CreatedAt      time.Time
}

// ErrPhotoNotFound is returned when an operation targets a non-existent photo.
var ErrPhotoNotFound = errors.New("journal: photo not found")

// Upload validation limits. Epic 03 adds the per-trip 1 GB cap on top of these.
const (
	maxUploadBytes = 10 << 20 // 10 MB per photo
)

// allowedContentTypes lists MIME types accepted for upload.
var allowedContentTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/webp": true,
	"image/gif":  true,
}

// validateUpload checks that the content type and size are acceptable.
func validateUpload(contentType string, size int64) error {
	if !allowedContentTypes[contentType] {
		return fmt.Errorf("journal: unsupported content type %q (want image/jpeg, image/png, image/webp, or image/gif)", contentType)
	}
	if size <= 0 {
		return errors.New("journal: file is empty")
	}
	if size > maxUploadBytes {
		return fmt.Errorf("journal: file too large (%d bytes, max %d)", size, maxUploadBytes)
	}
	return nil
}
