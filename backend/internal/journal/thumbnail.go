package journal

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/draw"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"

	xdraw "golang.org/x/image/draw"
	"golang.org/x/image/webp"
)

// thumbMaxDim is the maximum pixel dimension (width or height) for thumbnails.
// Images already smaller than this are stored as-is.
const thumbMaxDim = 320

// previewMaxDim is the maximum pixel dimension for the inline blur-up preview
// (LQIP). A ~24px JPEG at low quality is a few hundred bytes — small enough to
// inline as a base64 data URI in the photo JSON and render instantly, blurred,
// while the real thumbnail loads.
const previewMaxDim = 24

// generateThumbnail decodes the image from r, scales it so neither dimension
// exceeds thumbMaxDim (preserving aspect ratio), and encodes it as JPEG.
// The returned bytes and MIME type are ready to be stored via MediaStore.Put.
//
// Supported input types: image/jpeg, image/png, image/webp, image/gif.
//
// Scale-up lever: if photo volume grows and inline thumbnailing causes P99
// latency issues, move this call to an async Cloud Run Job triggered by
// Pub/Sub — the interface is identical, only the call site moves (PRD §8.6).
func generateThumbnail(r io.Reader, contentType string) ([]byte, error) {
	src, err := decodeImage(r, contentType)
	if err != nil {
		return nil, fmt.Errorf("thumbnail: decode: %w", err)
	}

	dst := scaledImageTo(src, thumbMaxDim)

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: 80}); err != nil {
		return nil, fmt.Errorf("thumbnail: encode jpeg: %w", err)
	}
	return buf.Bytes(), nil
}

// generatePreview decodes the image from r, scales it down to at most
// previewMaxDim, encodes it as a low-quality JPEG, and returns it as a
// "data:image/jpeg;base64,..." data URI ready to inline in the photo JSON.
// The result is intentionally tiny and shown blurred in the UI (see the frontend
// PhotoGrid); it exists only to bridge the gap before the real thumbnail loads.
func generatePreview(r io.Reader, contentType string) (string, error) {
	src, err := decodeImage(r, contentType)
	if err != nil {
		return "", fmt.Errorf("preview: decode: %w", err)
	}

	dst := scaledImageTo(src, previewMaxDim)

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: 35}); err != nil {
		return "", fmt.Errorf("preview: encode jpeg: %w", err)
	}
	return "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(buf.Bytes()), nil
}

// decodeImage decodes a single frame from r based on contentType.
func decodeImage(r io.Reader, contentType string) (image.Image, error) {
	switch contentType {
	case "image/jpeg":
		return jpeg.Decode(r)
	case "image/png":
		return png.Decode(r)
	case "image/gif":
		img, err := gif.Decode(r)
		if err != nil {
			return nil, err
		}
		return img, nil
	case "image/webp":
		return webp.Decode(r)
	default:
		return nil, fmt.Errorf("unsupported content type %q", contentType)
	}
}

// scaledImageTo returns a new image scaled so neither dimension exceeds maxDim.
// Returns src unchanged if it already fits within maxDim.
func scaledImageTo(src image.Image, maxDim int) image.Image {
	srcW := src.Bounds().Dx()
	srcH := src.Bounds().Dy()

	if srcW <= maxDim && srcH <= maxDim {
		return src
	}

	var dstW, dstH int
	if srcW >= srcH {
		dstW = maxDim
		dstH = (srcH * maxDim) / srcW
		if dstH < 1 {
			dstH = 1
		}
	} else {
		dstH = maxDim
		dstW = (srcW * maxDim) / srcH
		if dstW < 1 {
			dstW = 1
		}
	}

	dst := image.NewRGBA(image.Rect(0, 0, dstW, dstH))
	xdraw.BiLinear.Scale(dst, dst.Bounds(), src, src.Bounds(), draw.Over, nil)
	return dst
}
