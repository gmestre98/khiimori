package journal

import (
	"context"
	"fmt"
	"io"
	"strings"

	"cloud.google.com/go/storage"
)

// MediaStore is the storage seam for journal photo objects.
// Callers depend only on this interface; the Cloud Storage backend can be
// swapped (or faked in tests) without touching upload or attach logic.
//
// Object keys must be namespaced per trip so Epic 03's per-trip quota
// accounting can efficiently sum stored bytes (e.g. "trips/{tripID}/{photoID}").
type MediaStore interface {
	// Put stores r under key in the backing store, returning the canonical
	// URL for the stored object. size is the byte length of the content
	// (written to the object metadata and used by Epic 03's quota tracking).
	// contentType is the MIME type (e.g. "image/jpeg").
	// The quota-check seam for Epic 03 sits in front of this call in the
	// upload pipeline — see handleUploadPhoto.
	Put(ctx context.Context, key, contentType string, size int64, r io.Reader) (url string, err error)

	// Delete removes the object identified by url from the backing store.
	// url is the value previously returned by Put.
	Delete(ctx context.Context, url string) error
}

// gcsMediaStore implements MediaStore over Google Cloud Storage.
type gcsMediaStore struct {
	client *storage.Client
	bucket string
}

// NewGCSMediaStore returns a MediaStore backed by the named GCS bucket.
// client must be initialised with credentials that have write access to the
// bucket (on Cloud Run the runtime service account is used via ADC).
func NewGCSMediaStore(client *storage.Client, bucket string) MediaStore {
	return &gcsMediaStore{client: client, bucket: bucket}
}

// Put uploads r to GCS under key and returns a gs:// URI.
func (s *gcsMediaStore) Put(ctx context.Context, key, contentType string, size int64, r io.Reader) (string, error) {
	obj := s.client.Bucket(s.bucket).Object(key)
	w := obj.NewWriter(ctx)
	w.ContentType = contentType
	w.Size = size

	if _, err := io.Copy(w, r); err != nil {
		_ = w.Close()
		return "", fmt.Errorf("mediastore: write object %q: %w", key, err)
	}
	if err := w.Close(); err != nil {
		return "", fmt.Errorf("mediastore: close object writer %q: %w", key, err)
	}
	return "gs://" + s.bucket + "/" + key, nil
}

// Delete removes the object at url from GCS. url must be a gs:// URI returned
// by Put.
func (s *gcsMediaStore) Delete(ctx context.Context, url string) error {
	key, err := keyFromURL(s.bucket, url)
	if err != nil {
		return err
	}
	if err := s.client.Bucket(s.bucket).Object(key).Delete(ctx); err != nil {
		return fmt.Errorf("mediastore: delete object %q: %w", key, err)
	}
	return nil
}

// keyFromURL extracts the object key from a gs://{bucket}/{key} URL.
func keyFromURL(bucket, url string) (string, error) {
	prefix := "gs://" + bucket + "/"
	if !strings.HasPrefix(url, prefix) {
		return "", fmt.Errorf("mediastore: url %q does not belong to bucket %q", url, bucket)
	}
	return strings.TrimPrefix(url, prefix), nil
}
