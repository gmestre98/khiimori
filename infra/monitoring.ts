// Cloud Monitoring dashboard — request rate, latency, and error rate for the
// khiimori-api Cloud Run service (M01.7 S3). Uses Cloud Run's built-in request
// metrics (no custom instrumentation or exporter), all within the free
// Monitoring allowance (PRD §8.1).
//
// The 5xx error-rate panel is the signal the S4 alert policy fires on: the
// same metric (run.googleapis.com/request_count filtered to response_code_class
// "5xx") drives both the dashboard and the alert, so what you see here is what
// triggered the page.

import * as gcp from '@pulumi/gcp'
import * as pulumi from '@pulumi/pulumi'
import { project } from './config'
import { monitoringApi } from './services'

const cfg = new pulumi.Config()
const serviceName = cfg.get('serviceName') ?? 'khiimori-api'

// Base filter selecting this Cloud Run service's metrics across all revisions.
const svcFilter = `resource.type="cloud_run_revision" resource.labels.service_name="${serviceName}"`

// Helper: build a minimal xyChart widget.
function xyChart(title: string, dataSets: object[], yLabel: string): object {
  return {
    title,
    xyChart: {
      dataSets,
      yAxis: { label: yLabel, scale: 'LINEAR' },
      chartOptions: { mode: 'COLOR' },
    },
  }
}

// Helper: build a timeSeriesFilter dataSet entry.
function filterDataSet(
  filter: string,
  aligner: string,
  reducer: string,
  groupBy: string[],
  plotType: string,
  legendTemplate: string,
): object {
  return {
    timeSeriesQuery: {
      timeSeriesFilter: {
        filter,
        aggregation: {
          alignmentPeriod: '60s',
          perSeriesAligner: aligner,
          crossSeriesReducer: reducer,
          groupByFields: groupBy,
        },
      },
    },
    plotType,
    legendTemplate,
  }
}

// Panel 1 — request rate (req/s), broken down by HTTP response class (2xx/5xx
// …) so healthy vs erroring traffic is visible at a glance.
const requestRateWidget = xyChart(
  'Request rate (req/s)',
  [
    filterDataSet(
      `metric.type="run.googleapis.com/request_count" ${svcFilter}`,
      'ALIGN_RATE',
      'REDUCE_SUM',
      ['metric.labels.response_code_class'],
      'LINE',
      '${metric.labels.response_code_class}',
    ),
  ],
  'Requests / s',
)

// Panel 2 — request latency p50 and p95. Cloud Run's request_latencies is a
// distribution metric; ALIGN_PERCENTILE_50/99 extract the percentile per series.
const latencyP50DataSet = filterDataSet(
  `metric.type="run.googleapis.com/request_latencies" ${svcFilter}`,
  'ALIGN_PERCENTILE_50',
  'REDUCE_MEAN',
  [],
  'LINE',
  'p50',
)
const latencyP95DataSet = filterDataSet(
  `metric.type="run.googleapis.com/request_latencies" ${svcFilter}`,
  'ALIGN_PERCENTILE_95',
  'REDUCE_MEAN',
  [],
  'LINE',
  'p95',
)
const latencyWidget = xyChart(
  'Request latency (ms) — p50 / p95',
  [latencyP50DataSet, latencyP95DataSet],
  'Latency (ms)',
)

// Panel 3 — 5xx error rate (req/s). This is the signal the S4 alert policy
// fires on; the filter here is the same one used in alerting.ts so what you
// see on this panel is exactly what triggers a page.
const errorRateWidget = xyChart(
  '5xx error rate (req/s)',
  [
    filterDataSet(
      `metric.type="run.googleapis.com/request_count" ${svcFilter} metric.labels.response_code_class="5xx"`,
      'ALIGN_RATE',
      'REDUCE_SUM',
      [],
      'LINE',
      '5xx / s',
    ),
  ],
  'Errors / s',
)

const dashboardJson = JSON.stringify({
  displayName: 'Khiimori API — Request Metrics',
  // 2-column grid: rate | latency, then 5xx error rate spans full width.
  gridLayout: {
    columns: '2',
    widgets: [requestRateWidget, latencyWidget, errorRateWidget],
  },
})

/** Cloud Monitoring dashboard with rate/latency/error-rate panels. */
export const dashboard = new gcp.monitoring.Dashboard(
  'api-request-metrics',
  { dashboardJson },
  { dependsOn: [monitoringApi] },
)

// Build the console URL from the resource id, which the GCP provider sets to
// the full dashboard path "projects/{project}/dashboards/{dashboardId}".
export const dashboardUrl = pulumi.interpolate`https://console.cloud.google.com/monitoring/dashboards/custom/${dashboard.id.apply((id: string) => id.split('/').pop())}?project=${project}`
