// Typed stack-config surface for the Eudaimonia infrastructure.
//
// All cloud config is read here, once, and imported by the resource modules —
// no string keys scattered across the program. The GCP provider reads
// `gcp:project` / `gcp:region` natively; we additionally `require()` them so a
// missing value fails the program early (at `pulumi preview`) rather than
// surprising a resource mid-deploy. Later stories extend this surface with
// resource names and the scale tunables (S9).

import * as pulumi from '@pulumi/pulumi'

// The @pulumi/gcp provider's own config namespace. `gcp:project` and
// `gcp:region` configure the provider directly; reading them here gives the
// program a typed project id / region for resources that name them explicitly.
const gcp = new pulumi.Config('gcp')

/** Target GCP project id (author-provided, billing enabled — PRD §8.3). */
export const project = gcp.require('project')

/** Target GCP region (e.g. europe-west2, London — pairs with the Neon DB). */
export const region = gcp.require('region')
