// Cloud Run service — the Go service runs here (PRD §7.8), giving scale-to-zero
// on the free tier (PRD §8.1, §8.6). It runs the container from Artifact
// Registry (S2) as the least-privilege SA (S5), with health probes on the
// M01.2 endpoints. Secret injection is S7; scale tunables are S9 — this story
// stands up the service with safe defaults (scale-to-zero by default).

import * as gcp from '@pulumi/gcp'
import * as pulumi from '@pulumi/pulumi'
import { region } from './config'
import { cloudRunApi } from './services'
import { serviceAccount } from './serviceAccount'

const cfg = new pulumi.Config()

const serviceName = cfg.get('serviceName') ?? 'eudaimonia-api'

// Container image. Defaults to Google's public Cloud Run sample so a *fresh*
// stack stands up with no pre-pushed image (S10 reproducibility — Cloud Run
// validates the image exists at deploy time). CI (M01.5) overrides this with
// the real image from the S2 Artifact Registry, e.g. <imagePrefix>/api:<sha>.
const image = cfg.get('serviceImage') ?? 'us-docker.pkg.dev/cloudrun/container/hello'

// Container port the app listens on. Cloud Run injects $PORT matching this; the
// app's config layer (M01.2 S1) reads PORT from the environment. PORT itself is
// reserved by Cloud Run and must not be set as an env var here.
const port = cfg.getNumber('servicePort') ?? 8080

// v1's SPA (M01.6) calls this API from the browser, so the service must be
// invokable without IAM auth — the app does Google SSO itself (PRD §6). Toggle
// off to make the service private (e.g. if fronted by an authenticated proxy).
const allowUnauthenticated = cfg.getBoolean('allowUnauthenticated') ?? true

/** The Cloud Run (v2) service running the Go API as the least-privilege SA. */
export const service = new gcp.cloudrunv2.Service(
  'api',
  {
    name: serviceName,
    location: region,
    ingress: 'INGRESS_TRAFFIC_ALL',
    // Let `pulumi destroy` remove the service (S10 teardown); the provider
    // defaults this to true on newer versions.
    deletionProtection: false,
    template: {
      // Run as the dedicated SA from S5, never the default compute SA.
      serviceAccount: serviceAccount.email,
      // Scale-to-zero by default: min instances is left unset here (defaults to
      // 0) and wired to config in S9 — no warm instances pinned in this story.
      containers: [
        {
          image,
          ports: { containerPort: port },
          // Non-secret runtime config. Secret-backed env (DB URL, OAuth, Maps)
          // is added in S7. ENV/LOG_LEVEL/DB_POOLED match the app config layer.
          envs: [
            { name: 'ENV', value: cfg.get('serviceEnv') ?? 'prod' },
            { name: 'LOG_LEVEL', value: cfg.get('logLevel') ?? 'error' },
            { name: 'DB_POOLED', value: 'true' },
          ],
          // Liveness: dependency-free /healthz — restart only if the process
          // itself wedges, never because a dependency is down.
          livenessProbe: {
            httpGet: { path: '/healthz', port },
          },
          // Startup gate: /readyz (which pings the DB). Cloud Run v2 has no
          // separate readiness probe, so the startup probe doubles as the
          // readiness gate — traffic isn't served until the app reports ready,
          // matching the app's fail-fast "refuse to boot without the DB" design
          // (M01.3). Generous window covers cold start + Neon wake.
          startupProbe: {
            httpGet: { path: '/readyz', port },
            periodSeconds: 5,
            timeoutSeconds: 3,
            failureThreshold: 12,
          },
        },
      ],
    },
  },
  { dependsOn: [cloudRunApi] },
)

// Public invocation binding (see allowUnauthenticated above).
if (allowUnauthenticated) {
  new gcp.cloudrunv2.ServiceIamMember('api-public-invoker', {
    name: service.name,
    location: service.location,
    role: 'roles/run.invoker',
    member: 'allUsers',
  })
}

/** Service URL — exported for the M01.6 web shell + CORS origin. */
export const serviceUrl = service.uri
