// CI/CD identity — keyless GitHub Actions → GCP auth via Workload Identity
// Federation (M01.5 S5; PRD §6, §8.5). There is NO exported service-account key:
// GitHub's OIDC token is exchanged (STS) for short-lived credentials that
// impersonate a dedicated deployer service account. The pool's provider is
// locked to THIS repository, so no other repo can assume the identity.
//
// Privilege level (M01.6 follow-up): CI now runs a full `pulumi up` on main to
// reconcile infra automatically (so a merged config change — e.g. the Cloud Run
// CORS allowlist — goes live without a manual apply). A full reconcile touches
// project IAM, service accounts, Secret Manager and the WIF pool, so the deployer
// holds a broad project role (see the owner binding below) rather than the former
// least-privilege set. Deliberate tradeoff (owner decision): hands-off deploys at
// the cost of a high-privilege CI identity, bounded by repo-locked WIF + main-only
// jobs.

import * as gcp from '@pulumi/gcp'
import * as pulumi from '@pulumi/pulumi'
import { project } from './config'
import { iamApi } from './services'

const cfg = new pulumi.Config()

// The GitHub repository (owner/name) whose Actions may impersonate the deployer.
// Config-driven so a fork/rename is a config change, not a code edit.
const githubRepo = cfg.get('githubRepo') ?? 'gmestre98/khiimori'

// --- Workload Identity pool + GitHub OIDC provider -------------------------

/** Pool that federates external (GitHub) identities into GCP. */
const pool = new gcp.iam.WorkloadIdentityPool(
  'github-actions',
  {
    workloadIdentityPoolId: 'github-actions',
    displayName: 'GitHub Actions',
    description: 'Keyless OIDC federation for GitHub Actions (M01.5).',
  },
  { dependsOn: [iamApi] },
)

/** OIDC provider trusting GitHub's token issuer, scoped to this repo. */
const provider = new gcp.iam.WorkloadIdentityPoolProvider('github', {
  workloadIdentityPoolId: pool.workloadIdentityPoolId,
  workloadIdentityPoolProviderId: 'github',
  displayName: 'GitHub',
  oidc: { issuerUri: 'https://token.actions.githubusercontent.com' },
  // Map the GitHub OIDC claims we key authorization on.
  attributeMapping: {
    'google.subject': 'assertion.sub',
    'attribute.repository': 'assertion.repository',
    'attribute.repository_owner': 'assertion.repository_owner',
    'attribute.ref': 'assertion.ref',
  },
  // Hard gate: only tokens issued to THIS repository can be exchanged at all —
  // a first line of defence before the SA's principalSet binding below.
  attributeCondition: pulumi.interpolate`assertion.repository == "${githubRepo}"`,
})

// --- Least-privilege deployer service account ------------------------------

// account_id: 6–30 chars, lowercase letters/digits/hyphens.
const accountId = cfg.get('ciDeployerServiceAccountId') ?? 'khiimori-ci'

/** Identity GitHub Actions impersonates to push images + deploy. */
export const deployer = new gcp.serviceaccount.Account('ci-deployer', {
  accountId,
  displayName: 'Khiimori CI/CD deployer',
  description:
    'Least-privilege identity GitHub Actions impersonates via WIF to push images and deploy (M01.5).',
})

const deployerMember = pulumi.interpolate`serviceAccount:${deployer.email}`

// Allow Actions runs from this repo (any branch) to impersonate the deployer.
// Branch scoping for *deploys* is enforced at the workflow level (main-only
// jobs); the SA itself trusts the repo via the pool's repository attribute.
new gcp.serviceaccount.IAMMember('ci-deployer-wif', {
  serviceAccountId: deployer.name,
  role: 'roles/iam.workloadIdentityUser',
  member: pulumi.interpolate`principalSet://iam.googleapis.com/${pool.name}/attribute.repository/${githubRepo}`,
})

// Broad project role so CI can run a full `pulumi up` (reconciling project IAM
// bindings, service accounts, Secret Manager, the WIF pool, Cloud Run + its IAM,
// Artifact Registry, Storage and Firebase Hosting) AND the existing per-step work
// (push images, deploy/migrate Cloud Run, deploy Hosting, read the direct DB
// secret). `roles/owner` is used rather than enumerating a curated set so a new
// resource in the program doesn't silently fail the pipeline on a missing role.
//
// SECURITY: this makes the CI identity high-privilege — a compromised Actions run
// on this repo could rewrite the whole project. It is the accepted cost of
// hands-off `pulumi up`, mitigated by repo-locked WIF (above) and main-only
// deploy jobs. Bootstrapping note: the FIRST application of this binding must be
// a manual `pulumi up` by an owner — the former least-privilege CI identity
// cannot grant itself this role.
new gcp.projects.IAMMember('ci-deployer-owner', {
  project,
  role: 'roles/owner',
  member: deployerMember,
})

// --- Outputs CI consumes ---------------------------------------------------

/**
 * Full resource name of the WIF provider — the `workload_identity_provider`
 * input to google-github-actions/auth, e.g.
 * `projects/<num>/locations/global/workloadIdentityPools/github-actions/providers/github`.
 */
export const wifProvider = provider.name

/** Deployer SA email — the `service_account` CI impersonates. */
export const ciDeployerServiceAccount = deployer.email
