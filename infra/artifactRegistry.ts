// Artifact Registry — the Docker repository CI pushes the service image to and
// Cloud Run (S6) deploys from (PRD §7.8). A single repo is enough for v1 — no
// per-service sprawl (PRD §7.0).

import * as gcp from '@pulumi/gcp'
import * as pulumi from '@pulumi/pulumi'
import { project, region } from './config'
import { artifactRegistryApi } from './services'

const cfg = new pulumi.Config()

// Repository id (the last path segment of the image prefix). Config-driven with
// a sensible default so a fresh stack needs only gcp:project to stand up.
const repositoryId = cfg.get('artifactRepoId') ?? 'khiimori'

/** Docker repository for the service container images. */
export const repository = new gcp.artifactregistry.Repository(
  'docker',
  {
    repositoryId,
    location: region,
    format: 'DOCKER',
    description:
      'Khiimori service container images — pushed by CI (M01.5), deployed by Cloud Run.',
  },
  { dependsOn: [artifactRegistryApi] },
)

/**
 * Image-path prefix CI pushes to and Cloud Run pulls from, e.g.
 * `europe-west2-docker.pkg.dev/<project>/khiimori`. A tagged image lives at
 * `<imagePathPrefix>/<image>:<tag>`.
 */
export const imagePathPrefix = pulumi.interpolate`${region}-docker.pkg.dev/${project}/${repository.repositoryId}`
