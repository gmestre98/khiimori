// Centralised GCP API enablement.
//
// Each resource depends on its API being enabled first; collecting the
// `gcp.projects.Service` resources here (rather than scattering them) keeps the
// dependency obvious and the enablement ordering handled by IaC, not manual
// console steps (epic AC5 / S10). The set grows as stories add resources.

import * as gcp from '@pulumi/gcp'

// Enable a project API. `disableOnDestroy` is false on purpose: a `pulumi
// destroy` should tear down *our* resources without disabling a project-level
// API that other stacks, services, or humans may still depend on.
function enableApi(name: string, service: string): gcp.projects.Service {
  return new gcp.projects.Service(name, {
    service,
    disableOnDestroy: false,
  })
}

/** Artifact Registry — Docker image repository for the service container. */
export const artifactRegistryApi = enableApi('artifactregistry', 'artifactregistry.googleapis.com')
