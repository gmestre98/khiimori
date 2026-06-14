// Least-privilege service account for the Cloud Run service (PRD §6). The
// service runs as *this* identity (S6), not the default compute SA, and is
// granted only what it needs at runtime: read the S4 secrets and read/write
// objects in the S3 bucket. Bindings target the named resources — no
// project-wide or primitive (Owner/Editor) roles, and no key file is generated
// (Cloud Run uses the attached identity).

import * as gcp from '@pulumi/gcp'
import * as pulumi from '@pulumi/pulumi'
import { databaseUrlSecret, mapsApiKeySecret, oauthClientSecret, sessionSecret } from './secrets'
import { mediaBucket } from './storage'

const cfg = new pulumi.Config()

// account_id: 6–30 chars, lowercase letters/digits/hyphens. Config-driven.
const accountId = cfg.get('cloudRunServiceAccountId') ?? 'khiimori-run'

/** Dedicated runtime identity for the Cloud Run service (attached in S6). */
export const serviceAccount = new gcp.serviceaccount.Account('cloud-run', {
  accountId,
  displayName: 'Khiimori Cloud Run runtime',
  description: 'Least-privilege identity for the Cloud Run service (epic M01.4).',
})

const member = pulumi.interpolate`serviceAccount:${serviceAccount.email}`

// secretAccessor on each *specific* secret — never project-wide. Named per
// secret so the grants have stable resource addresses.
const secretsByName = {
  'database-url': databaseUrlSecret,
  'oauth-client-secret': oauthClientSecret,
  'maps-api-key': mapsApiKeySecret,
  'session-secret': sessionSecret,
}
for (const [name, secret] of Object.entries(secretsByName)) {
  new gcp.secretmanager.SecretIamMember(`run-access-${name}`, {
    secretId: secret.id,
    role: 'roles/secretmanager.secretAccessor',
    member,
  })
}

// Object read/write/delete on the *specific* bucket only — objectUser is the
// least-privilege role for app object access (no bucket administration).
export const bucketAccess = new gcp.storage.BucketIAMMember('run-bucket-access', {
  bucket: mediaBucket.name,
  role: 'roles/storage.objectUser',
  member,
})

/** SA email — exported for S6 to attach to the Cloud Run service. */
export const serviceAccountEmail = serviceAccount.email
