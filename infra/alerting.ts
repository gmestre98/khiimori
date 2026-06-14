// Cloud Monitoring alerting — error alert policy + mobile-reachable notification
// channel (M01.7 S4). When the 5xx error rate on khiimori-api is sustained for
// more than 3 minutes, an alert fires to the configured email address (Gmail is
// accessible on mobile everywhere — PRD §6, §8.6).
//
// Channel choice: email to Gmail. Gmail push notifications arrive on mobile
// abroad with no extra setup. If a second channel is needed later (PagerDuty,
// Cloud Monitoring mobile app, etc.) add another NotificationChannel and append
// its name to the policy's notificationChannels list.
//
// Threshold rationale: `rate(5xx) > 0 for 180 s` means at least one 5xx error
// every 60-second alignment window for three consecutive windows before the alert
// fires. A single transient error doesn't satisfy the 3-minute duration — only
// sustained errors page. PRD §6 / S4 AC.

import * as gcp from '@pulumi/gcp'
import * as pulumi from '@pulumi/pulumi'
import { monitoringApi } from './services'

const cfg = new pulumi.Config()
const serviceName = cfg.get('serviceName') ?? 'khiimori-api'

// Alert recipient email. Must be reachable on mobile abroad. Configurable via
// khiimori:alertEmail stack config; defaults to the author's Gmail address.
const alertEmail = cfg.get('alertEmail') ?? 'goncalo.mestre1998@gmail.com'

/** Email notification channel — receives alert notifications. */
export const emailChannel = new gcp.monitoring.NotificationChannel(
  'api-alert-email',
  {
    displayName: 'Khiimori API — error alerts (email)',
    type: 'email',
    labels: { email_address: alertEmail },
  },
  { dependsOn: [monitoringApi] },
)

// The 5xx error rate filter — identical to the S3 dashboard panel so the alert
// fires on exactly what you see there.
const fivexxFilter =
  `metric.type="run.googleapis.com/request_count"` +
  ` resource.type="cloud_run_revision"` +
  ` resource.labels.service_name="${serviceName}"` +
  ` metric.labels.response_code_class="5xx"`

/** Alert policy: fire when 5xx rate > 0 is sustained for > 3 minutes. */
export const alertPolicy = new gcp.monitoring.AlertPolicy(
  'api-5xx-alert',
  {
    displayName: 'Khiimori API — 5xx error rate elevated',
    combiner: 'OR',
    conditions: [
      {
        displayName: '5xx errors sustained for 3 min',
        conditionThreshold: {
          filter: fivexxFilter,
          aggregations: [
            {
              alignmentPeriod: '60s',
              perSeriesAligner: 'ALIGN_RATE',
              crossSeriesReducer: 'REDUCE_SUM',
            },
          ],
          comparison: 'COMPARISON_GT',
          // Any 5xx rate above zero. One transient error doesn't satisfy the
          // 180 s duration; only a sustained rate pages.
          thresholdValue: 0,
          duration: '180s',
        },
      },
    ],
    notificationChannels: [emailChannel.name],
    alertStrategy: {
      // Auto-close an incident after 7 days so stale open incidents don't
      // accumulate if an alert was never explicitly resolved.
      autoClose: '604800s',
    },
    documentation: {
      content: [
        '## khiimori-api — 5xx error rate elevated',
        '',
        'The `khiimori-api` Cloud Run service has been returning 5xx responses',
        'for more than 3 minutes. Check Cloud Logging for ERROR entries:',
        '',
        '```',
        'resource.type="cloud_run_revision"',
        'resource.labels.service_name="khiimori-api"',
        'severity>=ERROR',
        '```',
        '',
        'For per-request detail, filter by request_id from a client error.',
        'See the observability runbook (docs/…/observability-runbook.md).',
      ].join('\n'),
      mimeType: 'text/markdown',
    },
  },
  { dependsOn: [monitoringApi, emailChannel] },
)
