// CI/CD identity — keyless GitHub Actions → GCP auth via Workload Identity
// Federation (M01.5 S5; PRD §6, §8.5). There is NO exported service-account key:
// GitHub's OIDC token is exchanged (STS) for short-lived credentials that
// impersonate a dedicated, least-privilege deployer service account. The pool's
// provider is locked to THIS repository, so no other repo can assume the
// identity, and the deployer SA holds only the roles CI needs to push images and
// deploy Cloud Run + Firebase Hosting.

import * as gcp from '@pulumi/gcp'
import * as pulumi from '@pulumi/pulumi'
import { project } from './config'
import { iamApi } from './services'
import { repository } from './artifactRegistry'
import { serviceAccount as runtimeServiceAccount } from './serviceAccount'

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

// Push images to the Artifact Registry repo — repo-scoped, not project-wide.
new gcp.artifactregistry.RepositoryIamMember('ci-deployer-ar-writer', {
  project: repository.project,
  location: repository.location,
  repository: repository.name,
  role: 'roles/artifactregistry.writer',
  member: deployerMember,
})

// Deploy/update the Cloud Run service. `developer` (not `admin`) — it rolls new
// revisions but cannot change the service's IAM policy (PRD §6).
new gcp.projects.IAMMember('ci-deployer-run', {
  project,
  role: 'roles/run.developer',
  member: deployerMember,
})

// actAs the runtime SA so a deploy can run the service as that identity (Cloud
// Run requires serviceAccountUser on the runtime SA). Scoped to that one SA.
new gcp.serviceaccount.IAMMember('ci-deployer-actas-runtime', {
  serviceAccountId: runtimeServiceAccount.name,
  role: 'roles/iam.serviceAccountUser',
  member: deployerMember,
})

// Deploy the web bundle to Firebase Hosting.
new gcp.projects.IAMMember('ci-deployer-hosting', {
  project,
  role: 'roles/firebasehosting.admin',
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
