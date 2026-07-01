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

/** Cloud Storage — private bucket for journal/media objects. */
export const storageApi = enableApi('storage', 'storage.googleapis.com')

/** Secret Manager — runtime secret containers (DB URL, OAuth, Maps key). */
export const secretManagerApi = enableApi('secretmanager', 'secretmanager.googleapis.com')

/** Cloud Run — the service that runs the Go container. */
export const cloudRunApi = enableApi('run', 'run.googleapis.com')

/** Firebase Management — needed to manage the Hosting site on the project. */
export const firebaseApi = enableApi('firebase', 'firebase.googleapis.com')

/** Firebase Hosting — the web app's CDN-backed static host. */
export const firebaseHostingApi = enableApi('firebasehosting', 'firebasehosting.googleapis.com')

/** IAM — Workload Identity Federation pool/provider + service accounts (M01.5). */
export const iamApi = enableApi('iam', 'iam.googleapis.com')

/** STS — OIDC token exchange for Workload Identity Federation (M01.5). */
export const stsApi = enableApi('sts', 'sts.googleapis.com')

/** IAM Credentials — short-lived credential minting for SA impersonation (M01.5). */
export const iamCredentialsApi = enableApi('iamcredentials', 'iamcredentials.googleapis.com')

/** Cloud Monitoring — dashboards and alert policies (M01.7). */
export const monitoringApi = enableApi('monitoring', 'monitoring.googleapis.com')

/** Cloud Billing Budget API — billing budget + threshold alerts (M01.8 S1). */
export const billingBudgetsApi = enableApi('billingbudgets', 'billingbudgets.googleapis.com')

/**
 * Geocoding API — server-side location → LatLng resolution for the day map and
 * the plan form's live "Found / couldn't place this" check (geo proxy). Enabled
 * here so a fresh stack stands the feature up without a manual console step.
 */
export const geocodingApi = enableApi('geocoding', 'geocoding-backend.googleapis.com')

/**
 * Places API — server-side location autocomplete for the plan form (geo proxy
 * `GET /geo/autocomplete`). Billed per request; the field debounces and requires
 * 3+ chars. Enabled here for reproducibility (khiimori#391 follow-up).
 */
export const placesApi = enableApi('places', 'places-backend.googleapis.com')
