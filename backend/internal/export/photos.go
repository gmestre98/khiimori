package export

import (
	"context"
	"encoding/base64"
	"strings"
)

// defaultMaxEmbedBytes bounds the total size of inlined photo bytes so a
// photo-heavy trip can't produce an unwieldy document. ~15 MiB of thumbnails is
// plenty for a travelogue while staying well within a synchronous request.
const defaultMaxEmbedBytes int64 = 15 << 20

// allowedImageTypes is the set of content types we will inline. Anything else is
// coerced to image/jpeg so a stray/hostile content-type can't shape the data URI.
var allowedImageTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/webp": true,
	"image/gif":  true,
}

// ImageFetcher fetches a photo's bytes by reference (its thumbnail URL/key). The
// composition root satisfies it over the media store; the export package never
// talks to storage directly. An error means "skip this photo".
type ImageFetcher interface {
	FetchImage(ctx context.Context, ref string) (contentType string, data []byte, err error)
}

// EmbedOptions controls photo embedding.
type EmbedOptions struct {
	// Include gates embedding entirely: false → a text-only document (no fetches).
	Include bool
	// MaxTotalBytes caps the total inlined image bytes; <= 0 uses the default.
	MaxTotalBytes int64
}

// EmbedPhotos inlines each journal photo as a data: URI on Photo.Data, preferring
// the thumbnail reference, until the total would exceed the byte budget. Photos
// it can't embed — budget exhausted or a fetch error — are left without Data and
// counted in Model.PhotosOmitted (only when Include is true; an excluded run
// leaves the count at zero since text-only is a deliberate choice). It never
// fails: a fetch error skips one photo, it doesn't abort the export.
func EmbedPhotos(ctx context.Context, m *Model, fetcher ImageFetcher, opts EmbedOptions) {
	if m == nil {
		return
	}
	if !opts.Include || fetcher == nil {
		return // text-only: leave every Photo.Data empty; the renderer omits them
	}
	budget := opts.MaxTotalBytes
	if budget <= 0 {
		budget = defaultMaxEmbedBytes
	}

	var used int64
	omitted := 0
	full := false // set once a photo overflows the budget

	for di := range m.Days {
		j := m.Days[di].Journal
		if j == nil {
			continue
		}
		for pi := range j.Photos {
			p := &j.Photos[pi]
			ref := p.ThumbnailURL
			if ref == "" {
				ref = p.StorageURL
			}
			if ref == "" {
				continue // nothing to fetch
			}
			if full {
				omitted++
				continue // budget already exhausted — don't waste a fetch
			}
			ct, data, err := fetcher.FetchImage(ctx, ref)
			if err != nil || len(data) == 0 {
				omitted++
				continue // best-effort: skip a photo we couldn't read
			}
			if used+int64(len(data)) > budget {
				omitted++
				full = true
				continue
			}
			p.Data = dataURI(ct, data)
			used += int64(len(data))
		}
	}
	m.PhotosOmitted = omitted
}

// dataURI builds a base64 data: URI, constraining the content type to a known
// image type so it can be safely emitted into an <img src> (see safeURL).
func dataURI(contentType string, data []byte) string {
	ct := strings.ToLower(strings.TrimSpace(contentType))
	if !allowedImageTypes[ct] {
		ct = "image/jpeg"
	}
	return "data:" + ct + ";base64," + base64.StdEncoding.EncodeToString(data)
}
