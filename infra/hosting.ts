// Firebase Hosting — the web app deploys to Firebase Hosting + CDN (PRD §7.8).
// This provisions the Hosting *site* via IaC so M01.6 can deploy the app shell
// to it and M01.5 can deploy from CI. Free-tier Hosting + CDN (PRD §8.1).
//
// Manual prerequisite (cannot be expressed reliably in IaC): the GCP project
// must already have **Firebase enabled** (a one-time link — `firebase
// projects:addfirebase <project>` or the Firebase console). The epic lists a
// "Firebase project" as author-provided; this story manages only the Hosting
// site on top of it. Custom-domain attachment is documented in M01.6.

import * as gcp from '@pulumi/gcp'
import * as pulumi from '@pulumi/pulumi'
import { project } from './config'
import { firebaseApi, firebaseHostingApi } from './services'

const cfg = new pulumi.Config()

// The Firebase project — defaults to the GCP project (the common case where
// Firebase is enabled on the same project).
const firebaseProject = cfg.get('firebaseProject') ?? project

// Dedicated, IaC-managed Hosting site. siteId is globally unique, lowercase,
// <=30 chars. A named site (rather than the project's auto-created default)
// keeps the site fully Pulumi-managed. The web app deploys here.
const siteId = cfg.get('hostingSiteId') ?? `${project}-web`

/** The Firebase Hosting site for the web app. */
export const hostingSite = new gcp.firebase.HostingSite(
  'web',
  {
    project: firebaseProject,
    siteId,
  },
  { dependsOn: [firebaseApi, firebaseHostingApi] },
)

/** Hosting site id — for M01.5 (deploy target) and M01.6. */
export const hostingSiteId = hostingSite.siteId

/** Default Hosting origin URL — M01.6 web shell + the API's CORS origin. */
export const hostingUrl = hostingSite.defaultUrl
