import type { CleaningJob, CleaningPropertyConfig, CleaningExpense } from '../../types/cleaning';

export interface MonthRow {
  key: string;
  label: string;
  /** Completed cleans — supplies, lawn care and handyman work are billed, not cleaned */
  cleans: number;
  revenue: number;
  payouts: number;
  expenses: number;
  profit: number;
  /** Still to come this month */
  scheduled: number;
  /** Cleans whose charge went through Stripe */
  viaStripe: number;
  /** Cleans billed outside the CRM — invoiced by us, so no Stripe charge is coming */
  outside: number;
  /** Cleans finished, meant to be charged, and not charged yet */
  unpaid: number;
  /** Free cleans under the welcome deal (no revenue, cleaner still paid) */
  free: number;
  /** Fees waived for those free cleans */
  freeValue: number;
}

/** Property config by property id, including each one's linked sub-units. */
export function configIndex(configs: CleaningPropertyConfig[]): Map<string, CleaningPropertyConfig> {
  const byProperty = new Map<string, CleaningPropertyConfig>();
  for (const c of configs) {
    byProperty.set(c.propertyId, c);
    for (const sub of c.linkedPropertyIds ?? []) if (!byProperty.has(sub)) byProperty.set(sub, c);
  }
  return byProperty;
}

/** A job's fee, falling back to the property's current one (older rows were created before fees were copied onto jobs). */
export function jobFee(job: CleaningJob, byProperty: Map<string, CleaningPropertyConfig>): number {
  return job.cleaningFee > 0 ? job.cleaningFee : (byProperty.get(job.propertyId)?.cleaningFee ?? 0);
}

/** Free under the welcome deal: nothing is owed for this clean. */
export function isPromoFreeJob(job: CleaningJob): boolean {
  return !!job.promoFree || job.chargeStatus === 'promo_free';
}

/** Billed outside Stripe: the client is invoiced by us, so no charge is coming. */
export function isExternalJob(job: CleaningJob, byProperty: Map<string, CleaningPropertyConfig>): boolean {
  return job.chargeStatus === 'external' || byProperty.get(job.propertyId)?.billingMode === 'external';
}

/**
 * Month by month, newest first.
 *
 * Every completed job counts toward revenue at its fee however the client pays
 * — through Stripe, invoiced outside the CRM, or not collected yet — because
 * the work was done and the cleaner was paid for it either way. The Stripe /
 * outside / unpaid split says which of those a month's cleans actually were,
 * so money still owed doesn't hide inside "paid some other way".
 */
export function monthRows(
  jobs: CleaningJob[],
  configs: CleaningPropertyConfig[],
  expenses: CleaningExpense[],
  now: Date,
  todayStr: string,
  monthsBack = 12,
): MonthRow[] {
  const byProperty = configIndex(configs);
  const rows: MonthRow[] = [];
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const done = jobs.filter(j => j.checkoutDate.startsWith(key) && j.status === 'completed');
    const cleans = done.filter(j => (j.jobType ?? 'cleaning') === 'cleaning');
    const scheduled = jobs.filter(j =>
      j.checkoutDate.startsWith(key) && j.status !== 'completed' && j.status !== 'cancelled' && j.checkoutDate >= todayStr,
    ).length;
    // Free welcome-deal cleans were done and the cleaner was paid, but no money is owed for them.
    const revenue = done.reduce((s, j) => s + (isPromoFreeJob(j) ? 0 : jobFee(j, byProperty)), 0);
    const payouts = done.reduce((s, j) => s + (j.cleanerPayout || 0), 0);
    const exp = expenses.filter(e => e.date.startsWith(key)).reduce((s, e) => s + e.amount, 0);
    const viaStripe = cleans.filter(j => !!j.chargedAt).length;
    const free = cleans.filter(j => !j.chargedAt && isPromoFreeJob(j)).length;
    const freeValue = cleans.filter(j => !j.chargedAt && isPromoFreeJob(j)).reduce((s, j) => s + jobFee(j, byProperty), 0);
    const outside = cleans.filter(j => !j.chargedAt && !isPromoFreeJob(j) && isExternalJob(j, byProperty)).length;
    rows.push({
      key,
      label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      cleans: cleans.length,
      revenue,
      payouts,
      expenses: exp,
      profit: revenue - payouts - exp,
      scheduled,
      viaStripe,
      outside,
      unpaid: cleans.length - viaStripe - outside - free,
      free,
      freeValue,
    });
  }
  return rows;
}
