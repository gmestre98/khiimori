// Eudaimonia infrastructure — Pulumi (TypeScript) entrypoint.
//
// This program defines all GCP infrastructure for the project. It is built up
// story-by-story across epic M01.4; this scaffold (S1) wires the GCP provider
// via stack config and declares no billable resources yet — `pulumi preview`
// is clean. Subsequent stories add Artifact Registry (S2), Cloud Storage (S3),
// Secret Manager (S4), a least-privilege service account (S5), the Cloud Run
// service (S6/S7/S9), and the Firebase Hosting site (S8).

import { project, region } from './config'
import { imagePathPrefix } from './artifactRegistry'
import { mediaBucketName } from './storage'
import { secretIds } from './secrets'
import { serviceAccountEmail } from './serviceAccount'
import { serviceUrl } from './cloudRun'
import { hostingSiteId, hostingUrl } from './hosting'

// Echo the resolved provider config as stack outputs. These are trivial (no
// resources created) and double as a smoke test that project + region are set.
export const gcpProject = project
export const gcpRegion = region

// Artifact Registry image-path prefix CI pushes to and Cloud Run deploys from.
export const artifactImagePrefix = imagePathPrefix

// Private Cloud Storage bucket for journal/media objects.
export const mediaBucket = mediaBucketName

// Secret Manager container ids (values supplied out-of-band) — for S7 to mount.
export const secrets = secretIds

// Least-privilege Cloud Run runtime service account — for S6 to attach.
export const cloudRunServiceAccount = serviceAccountEmail

// Cloud Run service URL — M01.6 web shell + CORS origin.
export const cloudRunUrl = serviceUrl

// Firebase Hosting site — deploy target (M01.5) and web origin (M01.6).
export const firebaseHostingSiteId = hostingSiteId
export const firebaseHostingUrl = hostingUrl
