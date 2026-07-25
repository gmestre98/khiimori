package export

import (
	"context"
	"errors"
	"strings"
	"testing"
)

// fakeFetcher returns canned bytes per ref and records the refs it was asked for.
type fakeFetcher struct {
	byRef map[string]fetchResult
	calls []string
}
type fetchResult struct {
	ct   string
	data []byte
	err  error
}

func (f *fakeFetcher) FetchImage(_ context.Context, ref string) (string, []byte, error) {
	f.calls = append(f.calls, ref)
	r, ok := f.byRef[ref]
	if !ok {
		return "", nil, errors.New("not found")
	}
	return r.ct, r.data, r.err
}

// modelWithPhotos builds a model with one journal day holding the given photos.
func modelWithPhotos(photos ...Photo) *Model {
	return &Model{Days: []Day{{ID: "d1", Journal: &Journal{Photos: photos}}}}
}

func TestEmbedPhotos_InlinesAsDataURI(t *testing.T) {
	m := modelWithPhotos(Photo{ThumbnailURL: "thumb-1", Caption: "River"})
	f := &fakeFetcher{byRef: map[string]fetchResult{"thumb-1": {ct: "image/png", data: []byte("PNGDATA")}}}

	EmbedPhotos(context.Background(), m, f, EmbedOptions{Include: true})

	got := m.Days[0].Journal.Photos[0].Data
	if !strings.HasPrefix(got, "data:image/png;base64,") {
		t.Errorf("Data = %q, want a png data URI", got)
	}
	if m.PhotosOmitted != 0 {
		t.Errorf("PhotosOmitted = %d, want 0", m.PhotosOmitted)
	}
}

func TestEmbedPhotos_ExcludedDoesNotFetch(t *testing.T) {
	m := modelWithPhotos(Photo{ThumbnailURL: "thumb-1"})
	f := &fakeFetcher{byRef: map[string]fetchResult{"thumb-1": {ct: "image/png", data: []byte("x")}}}

	EmbedPhotos(context.Background(), m, f, EmbedOptions{Include: false})

	if len(f.calls) != 0 {
		t.Errorf("fetched %v, want no fetches when photos excluded", f.calls)
	}
	if m.Days[0].Journal.Photos[0].Data != "" {
		t.Error("no Data should be set when excluded")
	}
	if m.PhotosOmitted != 0 {
		t.Errorf("PhotosOmitted = %d, want 0 (text-only is deliberate)", m.PhotosOmitted)
	}
}

func TestEmbedPhotos_ByteCapOmitsOverflow(t *testing.T) {
	m := modelWithPhotos(
		Photo{ThumbnailURL: "a"},
		Photo{ThumbnailURL: "b"},
		Photo{ThumbnailURL: "c"},
	)
	f := &fakeFetcher{byRef: map[string]fetchResult{
		"a": {ct: "image/jpeg", data: make([]byte, 6)},
		"b": {ct: "image/jpeg", data: make([]byte, 6)},
		"c": {ct: "image/jpeg", data: make([]byte, 6)},
	}}
	// Budget fits only the first photo (6 bytes); the next overflows.
	EmbedPhotos(context.Background(), m, f, EmbedOptions{Include: true, MaxTotalBytes: 10})

	ps := m.Days[0].Journal.Photos
	if ps[0].Data == "" {
		t.Error("first photo should be embedded")
	}
	if ps[1].Data != "" || ps[2].Data != "" {
		t.Error("photos past the budget should not be embedded")
	}
	if m.PhotosOmitted != 2 {
		t.Errorf("PhotosOmitted = %d, want 2", m.PhotosOmitted)
	}
	// Once full, we must not keep fetching the remaining photos.
	if len(f.calls) != 2 { // a (fits) + b (overflow) → c not fetched
		t.Errorf("fetched %v, want to stop after the overflow", f.calls)
	}
}

func TestEmbedPhotos_FetchErrorSkipsButContinues(t *testing.T) {
	m := modelWithPhotos(
		Photo{ThumbnailURL: "bad"},
		Photo{ThumbnailURL: "good"},
	)
	f := &fakeFetcher{byRef: map[string]fetchResult{
		"bad":  {err: errors.New("gcs down")},
		"good": {ct: "image/jpeg", data: []byte("JPG")},
	}}
	EmbedPhotos(context.Background(), m, f, EmbedOptions{Include: true})

	ps := m.Days[0].Journal.Photos
	if ps[0].Data != "" {
		t.Error("failed photo should have no Data")
	}
	if ps[1].Data == "" {
		t.Error("a fetch error on one photo must not stop the others")
	}
	if m.PhotosOmitted != 1 {
		t.Errorf("PhotosOmitted = %d, want 1", m.PhotosOmitted)
	}
}

func TestEmbedPhotos_ConstrainsContentType(t *testing.T) {
	m := modelWithPhotos(Photo{ThumbnailURL: "x"})
	f := &fakeFetcher{byRef: map[string]fetchResult{"x": {ct: "text/html", data: []byte("<b>")}}}
	EmbedPhotos(context.Background(), m, f, EmbedOptions{Include: true})
	if !strings.HasPrefix(m.Days[0].Journal.Photos[0].Data, "data:image/jpeg;base64,") {
		t.Errorf("a non-image content type must be coerced to image/jpeg, got %q",
			m.Days[0].Journal.Photos[0].Data)
	}
}

func TestRender_EmbedsPhotoImgAndOmittedNote(t *testing.T) {
	m := sampleModel()
	m.Days[0].Journal.Photos = []Photo{
		{Caption: "River at dusk", Data: "data:image/png;base64,QUJD"},
	}
	m.PhotosOmitted = 2
	out, err := Render(m)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	html := string(out)
	// The data: URI must survive as a real src — not be rewritten to #ZgotmplZ.
	if !strings.Contains(html, `src="data:image/png;base64,QUJD"`) {
		t.Errorf("photo data URI not rendered as src (html/template may have filtered it)")
	}
	if strings.Contains(html, "ZgotmplZ") {
		t.Error("data URI was rewritten to #ZgotmplZ — safeURL not applied")
	}
	if !strings.Contains(html, "River at dusk") {
		t.Error("caption not rendered")
	}
	if !strings.Contains(html, "2 photo(s) were left out") {
		t.Error("omitted-photos note not rendered")
	}
}
