package journal

import (
	"bytes"
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

	dst := scaledImage(src)

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: 80}); err != nil {
		return nil, fmt.Errorf("thumbnail: encode jpeg: %w", err)
	}
	return buf.Bytes(), nil
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

// scaledImage returns a new image scaled so neither dimension exceeds thumbMaxDim.
// Returns src unchanged if it already fits within thumbMaxDim.
func scaledImage(src image.Image) image.Image {
	srcW := src.Bounds().Dx()
	srcH := src.Bounds().Dy()

	if srcW <= thumbMaxDim && srcH <= thumbMaxDim {
		return src
	}

	var dstW, dstH int
	if srcW >= srcH {
		dstW = thumbMaxDim
		dstH = (srcH * thumbMaxDim) / srcW
		if dstH < 1 {
			dstH = 1
		}
	} else {
		dstH = thumbMaxDim
		dstW = (srcW * thumbMaxDim) / srcH
		if dstW < 1 {
			dstW = 1
		}
	}

	dst := image.NewRGBA(image.Rect(0, 0, dstW, dstH))
	xdraw.BiLinear.Scale(dst, dst.Bounds(), src, src.Bounds(), draw.Over, nil)
	return dst
}
