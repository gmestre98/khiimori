// Secret Manager — the runtime secret *containers*. The service reads its
// secrets at runtime from Secret Manager; nothing here is committed or shipped
// to the client (PRD §6, §8.5). This story provisions the containers and
// exports their ids; S5 grants the Cloud Run SA access, S7 mounts the versions.
//
// Three containers, matching the runtime's secret needs (PRD §7.0 — minimal):
//   - database-url        the Neon pooled DSN (see the app_rw note below)
//   - oauth-client-secret the Google OAuth client *secret* (the sensitive half;
//                          the client *id* is non-secret config, supplied in M02)
//   - maps-api-key        the Google Maps API key
//
// Secret VALUES are never committed. They are supplied out-of-band — either via
// the CLI/console after `pulumi up`, or by setting Pulumi *secret* config
// (encrypted in state), which this program reads if present. See infra/README.

import * as gcp from '@pulumi/gcp'
import * as pulumi from '@pulumi/pulumi'
import { secretManagerApi } from './services'

const cfg = new pulumi.Config()

// Versions created from Pulumi secret config (if any). The Cloud Run service
// (S7) depends on these so that, when values are supplied via config, the
// version exists before the service tries to mount it in the same `pulumi up`.
const versions: gcp.secretmanager.SecretVersion[] = []

/**
 * Create a Secret Manager container, and — only if a Pulumi *secret* config
 * value is provided — an initial version from it. When no config value is set
 * the container is created empty and the operator adds the first version
 * out-of-band; either way no plaintext lives in the program or git.
 */
function managedSecret(
  name: string,
  secretId: string,
  valueConfigKey: string,
): gcp.secretmanager.Secret {
  const secret = new gcp.secretmanager.Secret(
    name,
    {
      secretId,
      // Automatic replication — Google manages location; cheapest/simplest.
      replication: { auto: {} },
    },
    { dependsOn: [secretManagerApi] },
  )

  // getSecret() yields a secret-tracked Output, so the value stays encrypted in
  // Pulumi state and never appears in plaintext in diffs or logs (PRD §8.5).
  const value = cfg.getSecret(valueConfigKey)
  if (value) {
    versions.push(
      new gcp.secretmanager.SecretVersion(name, {
        secret: secret.id,
        secretData: value,
      }),
    )
  }

  return secret
}

/**
 * DB connection URL (Neon pooled DSN). The value supplied out-of-band MUST use
 * the dedicated least-privilege Neon role **app_rw**, not neondb_owner —
 * closing the M01.3 S1 follow-up (role SQL in backend/docs/database.md).
 */
export const databaseUrlSecret = managedSecret(
  'database-url',
  'khiimori-database-url',
  'databaseUrl',
)

/** Google OAuth client secret (the client id is non-secret, supplied in M02). */
export const oauthClientSecret = managedSecret(
  'oauth-client-secret',
  'khiimori-oauth-client-secret',
  'oauthClientSecret',
)

/** Google Maps API key. */
export const mapsApiKeySecret = managedSecret(
  'maps-api-key',
  'khiimori-maps-api-key',
  'mapsApiKey',
)

/**
 * Direct (un-pooled) DB DSN used by CI to run migrations at deploy time (M01.5
 * S7). Migrations need the OWNER role via the direct endpoint — DDL must bypass
 * the pgBouncer pooler (backend/docs/database.md). This is NOT mounted to the
 * runtime service (which uses the pooled app_rw `database-url`); only the CI
 * deployer SA is granted access to it (infra/cicd.ts).
 */
export const databaseUrlDirectSecret = managedSecret(
  'database-url-direct',
  'khiimori-database-url-direct',
  'databaseUrlDirect',
)

/** All managed secrets — S5 grants the Cloud Run SA accessor on each. */
export const allSecrets = [databaseUrlSecret, oauthClientSecret, mapsApiKeySecret]

/**
 * Secret versions created from Pulumi config this run (empty when values are
 * supplied out-of-band). The Cloud Run service depends on these so the version
 * exists before it mounts the secret (S7 ordering).
 */
export const secretVersions = versions

/** Secret ids (short names) — exported for S7 to mount the versions. */
export const secretIds = {
  databaseUrl: databaseUrlSecret.secretId,
  oauthClientSecret: oauthClientSecret.secretId,
  mapsApiKey: mapsApiKeySecret.secretId,
}
