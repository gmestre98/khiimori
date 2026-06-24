package journal

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"strings"
	"testing"
)

// fakeMediaStore is an in-memory MediaStore for unit tests.
type fakeMediaStore struct {
	objects map[string][]byte // key → content
	putErr  error
	delErr  error
}

func newFakeMediaStore() *fakeMediaStore {
	return &fakeMediaStore{objects: map[string][]byte{}}
}

func (f *fakeMediaStore) Put(_ context.Context, key, _ string, _ int64, r io.Reader) (string, error) {
	if f.putErr != nil {
		return "", f.putErr
	}
	data, err := io.ReadAll(r)
	if err != nil {
		return "", err
	}
	f.objects[key] = data
	return "gs://test-bucket/" + key, nil
}

func (f *fakeMediaStore) Delete(_ context.Context, url string) error {
	if f.delErr != nil {
		return f.delErr
	}
	key := strings.TrimPrefix(url, "gs://test-bucket/")
	delete(f.objects, key)
	return nil
}

// --- tests ---

func TestFakeMediaStore_Put(t *testing.T) {
	t.Parallel()
	ms := newFakeMediaStore()
	content := []byte("fake-image-bytes")
	url, err := ms.Put(context.Background(), "trips/t1/p1.jpg", "image/jpeg", int64(len(content)), bytes.NewReader(content))
	if err != nil {
		t.Fatalf("put: %v", err)
	}
	if url != "gs://test-bucket/trips/t1/p1.jpg" {
		t.Errorf("url: got %q", url)
	}
	if _, ok := ms.objects["trips/t1/p1.jpg"]; !ok {
		t.Error("object not stored")
	}
}

func TestFakeMediaStore_Delete(t *testing.T) {
	t.Parallel()
	ms := newFakeMediaStore()
	content := []byte("fake-image-bytes")
	url, _ := ms.Put(context.Background(), "trips/t1/p1.jpg", "image/jpeg", int64(len(content)), bytes.NewReader(content))

	if err := ms.Delete(context.Background(), url); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, ok := ms.objects["trips/t1/p1.jpg"]; ok {
		t.Error("object still present after delete")
	}
}

func TestFakeMediaStore_PutError(t *testing.T) {
	t.Parallel()
	ms := newFakeMediaStore()
	ms.putErr = fmt.Errorf("storage unavailable")
	_, err := ms.Put(context.Background(), "k", "image/jpeg", 0, bytes.NewReader(nil))
	if err == nil {
		t.Fatal("expected error from Put")
	}
}

func TestKeyFromURL(t *testing.T) {
	t.Parallel()
	key, err := keyFromURL("my-bucket", "gs://my-bucket/trips/t1/p.jpg")
	if err != nil {
		t.Fatalf("keyFromURL: %v", err)
	}
	if key != "trips/t1/p.jpg" {
		t.Errorf("key: got %q", key)
	}
}

func TestKeyFromURL_WrongBucket(t *testing.T) {
	t.Parallel()
	_, err := keyFromURL("my-bucket", "gs://other-bucket/trips/t1/p.jpg")
	if err == nil {
		t.Fatal("expected error for wrong bucket")
	}
}

// Compile-time check that fakeMediaStore satisfies MediaStore.
var _ MediaStore = (*fakeMediaStore)(nil)
