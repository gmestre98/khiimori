// GCP billing budget + threshold alerts (M01.8 S1).
//
// The single step the PRD calls out for preventing bill surprises (PRD §8.5):
// a monthly spending cap with 50/90/100% threshold notifications, reusing the
// M01.7 email alert channel so billing + error alerts land in the same inbox
// (mobile-reachable abroad — PRD §6, §8.6).
//
// Budget amount and thresholds are stack-config values — raise them with a
// single `pulumi config set` + `pulumi up` when intentionally scaling spend
// (PRD §8.6). The budget **alerts**; it does not auto-cap spend — hard caps
// for Maps live in mapsKey.ts (S2) and scale-to-zero defaults guard compute (S3).
//
// Requires `khiimori:billingAccount` to be set (the GCP billing account ID the
// project is linked to, e.g. XXXXXX-XXXXXX-XXXXXX). Find it: GCP Console →
// Billing → My billing accounts. If not set, the budget is skipped and a warning
// is logged — set the value and re-run `pulumi up` to provision it (PRD §8.3).

import * as gcp from '@pulumi/gcp'
import * as pulumi from '@pulumi/pulumi'
import { emailChannel } from './alerting'
import { billingBudgetsApi } from './services'

const cfg = new pulumi.Config()

// Billing account ID the GCP project is linked to (author-provided, PRD §8.3).
// Not a secret — it's visible in the GCP console under Billing.
// Set with: pulumi config set khiimori:billingAccount XXXXXX-XXXXXX-XXXXXX
const billingAccount = cfg.get('billingAccount')
if (!billingAccount) {
  pulumi.log.warn(
    'khiimori:billingAccount not set — billing budget NOT provisioned (M01.8 S1). ' +
      'Set it with: pulumi config set khiimori:billingAccount XXXXXX-XXXXXX-XXXXXX ' +
      '(find the ID in GCP Console → Billing → My billing accounts)',
  )
}

// Monthly budget amount in EUR (default €10 — PRD §8.5). Raise with:
//   pulumi config set khiimori:billingBudgetEur "20"
// then re-run `pulumi up`. See S4 / cost-guardrails-runbook.md for cost deltas.
const budgetEur = cfg.getNumber('billingBudgetEur') ?? 10

/**
 * Monthly billing budget with 50%/90%/100% email threshold alerts.
 * Undefined when `khiimori:billingAccount` is not configured.
 */
export const billingBudget = billingAccount
  ? new gcp.billing.Budget(
      'monthly-budget',
      {
        billingAccount,
        displayName: 'Khiimori — monthly budget',
        amount: {
          specifiedAmount: {
            currencyCode: 'EUR',
            // Budget API requires units as a string-encoded integer.
            units: String(Math.floor(budgetEur)),
          },
        },
        // Fire at 50%, 90%, and 100% of the monthly budget. The 50% alert is
        // the early-warning signal giving headroom to act; 100% means the budget
        // is fully consumed for the month.
        thresholdRules: [
          { thresholdPercent: 0.5 },
          { thresholdPercent: 0.9 },
          { thresholdPercent: 1.0 },
        ],
        allUpdatesRule: {
          // Route to the M01.7 email channel so billing + error alerts land in
          // the same mobile-reachable inbox (PRD §6, §8.6).
          monitoringNotificationChannels: [emailChannel.name],
          // Also notify the billing account's IAM billing admin roles (default GCP
          // behaviour). Set to true to suppress if the billing admin isn't the
          // right contact.
          disableDefaultIamRecipients: false,
        },
      },
      { dependsOn: [billingBudgetsApi, emailChannel] },
    )
  : undefined
