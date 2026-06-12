// Cloud Storage — the private bucket for journal/media objects (a later
// milestone). Provisioned now as part of the IaC foundation (PRD §7.8) with
// safe defaults so feature work just writes to it behind a thin interface
// (PRD §7.0). Access goes through the service, never public links (PRD §6).

import * as gcp from '@pulumi/gcp'
import * as pulumi from '@pulumi/pulumi'
import { project, region } from './config'
import { storageApi } from './services'

const cfg = new pulumi.Config()

// Bucket names are globally unique; default to a project-scoped name so a fresh
// stack stands up with only gcp:project set.
const bucketName = cfg.get('mediaBucketName') ?? `${project}-media`

// Allow `pulumi destroy` to remove a non-empty bucket only when explicitly
// opted in (e.g. ephemeral test stacks). Default false so a real environment's
// objects are never deleted by a teardown by accident.
const forceDestroy = cfg.getBoolean('mediaBucketForceDestroy') ?? false

/** Private bucket for user media. Uniform access + public access prevention. */
export const mediaBucket = new gcp.storage.Bucket(
  'media',
  {
    name: bucketName,
    location: region,
    // Uniform bucket-level access: IAM only, no per-object ACLs (PRD §6, §8.5).
    uniformBucketLevelAccess: true,
    // Belt-and-braces: refuse any public (allUsers/allAuthenticatedUsers) grant.
    publicAccessPrevention: 'enforced',
    forceDestroy,
    // Cost hygiene: drop abandoned multipart uploads rather than paying to store
    // them. Object versioning is intentionally OFF — media is large and the
    // app is the source of truth, so versioning would add storage cost for no
    // v1 benefit (PRD §8.1); flip it on here if soft-delete is ever needed.
    lifecycleRules: [
      {
        action: { type: 'AbortIncompleteMultipartUpload' },
        condition: { age: 7 },
      },
    ],
  },
  { dependsOn: [storageApi] },
)

/** Bucket name — consumed by the Cloud Run service account grant (S5). */
export const mediaBucketName = mediaBucket.name
