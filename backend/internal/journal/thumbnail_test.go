package journal

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"strings"
	"testing"
)

// makeTestJPEG returns a minimal JPEG-encoded image of the given dimensions.
func makeTestJPEG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := range h {
		for x := range w {
			img.Set(x, y, color.RGBA{R: 100, G: 150, B: 200, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, nil); err != nil {
		t.Fatalf("encode jpeg fixture: %v", err)
	}
	return buf.Bytes()
}

// makeTestPNG returns a minimal PNG-encoded image of the given dimensions.
func makeTestPNG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode png fixture: %v", err)
	}
	return buf.Bytes()
}

// TestGenerateThumbnail_LargeJPEG verifies that a large JPEG is reduced to
// at most thumbMaxDim on the longest side.
func TestGenerateThumbnail_LargeJPEG(t *testing.T) {
	t.Parallel()
	src := makeTestJPEG(t, 800, 600)
	out, err := generateThumbnail(bytes.NewReader(src), "image/jpeg")
	if err != nil {
		t.Fatalf("generateThumbnail: %v", err)
	}
	img, err := jpeg.Decode(bytes.NewReader(out))
	if err != nil {
		t.Fatalf("decode thumbnail: %v", err)
	}
	if img.Bounds().Dx() > thumbMaxDim || img.Bounds().Dy() > thumbMaxDim {
		t.Errorf("thumbnail too large: %dx%d (max %d)", img.Bounds().Dx(), img.Bounds().Dy(), thumbMaxDim)
	}
	if len(out) >= len(src) {
		t.Errorf("thumbnail (%d bytes) should be smaller than original (%d bytes)", len(out), len(src))
	}
}

// TestGenerateThumbnail_SmallImage verifies that an already-small image is
// not enlarged (dimensions stay within thumbMaxDim).
func TestGenerateThumbnail_SmallImage(t *testing.T) {
	t.Parallel()
	src := makeTestJPEG(t, 100, 80) // already within thumbMaxDim
	out, err := generateThumbnail(bytes.NewReader(src), "image/jpeg")
	if err != nil {
		t.Fatalf("generateThumbnail: %v", err)
	}
	img, err := jpeg.Decode(bytes.NewReader(out))
	if err != nil {
		t.Fatalf("decode thumbnail: %v", err)
	}
	if img.Bounds().Dx() > 100 || img.Bounds().Dy() > 80 {
		t.Errorf("small image was enlarged: %dx%d", img.Bounds().Dx(), img.Bounds().Dy())
	}
}

// TestGenerateThumbnail_PNG verifies PNG input is accepted.
func TestGenerateThumbnail_PNG(t *testing.T) {
	t.Parallel()
	src := makeTestPNG(t, 400, 300)
	out, err := generateThumbnail(bytes.NewReader(src), "image/png")
	if err != nil {
		t.Fatalf("generateThumbnail: %v", err)
	}
	img, err := jpeg.Decode(bytes.NewReader(out))
	if err != nil {
		t.Fatalf("decode thumbnail (should be jpeg): %v", err)
	}
	if img.Bounds().Dx() > thumbMaxDim || img.Bounds().Dy() > thumbMaxDim {
		t.Errorf("thumbnail too large: %dx%d", img.Bounds().Dx(), img.Bounds().Dy())
	}
}

// TestGeneratePreview_DataURI verifies a preview is a decodable JPEG data URI
// scaled down to at most previewMaxDim.
func TestGeneratePreview_DataURI(t *testing.T) {
	t.Parallel()
	src := makeTestJPEG(t, 800, 600)
	out, err := generatePreview(bytes.NewReader(src), "image/jpeg")
	if err != nil {
		t.Fatalf("generatePreview: %v", err)
	}

	const prefix = "data:image/jpeg;base64,"
	if !strings.HasPrefix(out, prefix) {
		t.Fatalf("preview missing data URI prefix: %q", out[:min(len(out), 32)])
	}

	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(out, prefix))
	if err != nil {
		t.Fatalf("decode base64: %v", err)
	}
	img, err := jpeg.Decode(bytes.NewReader(raw))
	if err != nil {
		t.Fatalf("decode preview jpeg: %v", err)
	}
	if img.Bounds().Dx() > previewMaxDim || img.Bounds().Dy() > previewMaxDim {
		t.Errorf("preview too large: %dx%d (max %d)", img.Bounds().Dx(), img.Bounds().Dy(), previewMaxDim)
	}
}

// TestGeneratePreview_UnsupportedType verifies an unknown content type errors.
func TestGeneratePreview_UnsupportedType(t *testing.T) {
	t.Parallel()
	if _, err := generatePreview(bytes.NewReader([]byte("nope")), "application/pdf"); err == nil {
		t.Fatal("expected error for unsupported content type, got nil")
	}
}

// TestGenerateThumbnail_AspectRatio verifies aspect ratio is preserved on scale-down.
func TestGenerateThumbnail_AspectRatio(t *testing.T) {
	t.Parallel()
	// 640×480 → longest side (640) should scale to thumbMaxDim=320
	// so 480 should scale to 480*320/640 = 240
	src := makeTestJPEG(t, 640, 480)
	out, err := generateThumbnail(bytes.NewReader(src), "image/jpeg")
	if err != nil {
		t.Fatalf("generateThumbnail: %v", err)
	}
	img, err := jpeg.Decode(bytes.NewReader(out))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	w, h := img.Bounds().Dx(), img.Bounds().Dy()
	if w != thumbMaxDim {
		t.Errorf("width: got %d, want %d", w, thumbMaxDim)
	}
	if h != 240 {
		t.Errorf("height: got %d, want 240", h)
	}
}
