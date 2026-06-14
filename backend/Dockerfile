# syntax=docker/dockerfile:1

# Container image for the Khiimori API (PRD §7.8). A pinned Go toolchain compiles
# a statically-linked binary in the build stage; the runtime stage is a minimal
# distroless/static image with no shell or package manager, running as a non-root
# user. Secrets are NEVER baked in — they arrive from Secret Manager at runtime
# (M01.4 S7, PRD §8.5); the final image contains only the binary.

# ---- build stage ----------------------------------------------------------
# Pinned to the repo's Go major version (kept in sync with backend/go.mod — bump
# both together; go.mod went to 1.25 in M02.1 for the go-oidc dependency).
# Building from source keeps the toolchain explicit and reproducible.
FROM golang:1.25-bookworm AS build
WORKDIR /src

# Resolve modules first so this layer is cached unless go.mod/go.sum change.
COPY go.mod go.sum ./
RUN go mod download

# Compile the API. CGO disabled => a static binary with no libc dependency, so it
# runs on distroless/static. -trimpath and -mod=readonly keep the build
# reproducible; -s -w drop debug info to shrink the binary.
COPY . .
ENV CGO_ENABLED=0 GOOS=linux GOFLAGS=-mod=readonly
RUN go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

# ---- runtime stage --------------------------------------------------------
# distroless/static: no shell, no package manager — minimal attack surface
# (PRD §7.0, §6). The ":nonroot" variant runs as uid 65532, satisfying the
# non-root requirement without creating a user ourselves. Pinned by digest (the
# tag is rolling/unversioned) so the deployed image is reproducible; the tag is
# kept alongside for readability. Refresh the digest when intentionally updating.
FROM gcr.io/distroless/static-debian12:nonroot@sha256:d093aa3e30dbadd3efe1310db061a14da60299baff8450a17fe0ccc514a16639
WORKDIR /
COPY --from=build /out/api /api

# Documentation only — the app binds to $PORT, which Cloud Run injects at runtime
# (M01.2 S1). Defaults to 8080 in dev.
EXPOSE 8080

USER nonroot:nonroot
ENTRYPOINT ["/api"]
