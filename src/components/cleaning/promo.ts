// Welcome deal (pay for 5 cleans, cleans 6 and 7 free) — CRM-side mirror of the
// server rules in api/_billing.ts, so Properties / Jobs / Payments can show where
// a client stands. The server is the only thing that decides a job is free.
import type { CleaningJob, CleaningPropertyConfig } from '../../types/cleaning';

export const PROMO_WELCOME = 'welcome_5_2';

export interface PromoProgress {
  paidDone: number;
  paidRequired: number;
  freeUsed: number;
  freeTotal: number;
  nextIsFree: boolean;
  complete: boolean;
  /** Properties whose cleans count toward this deal (the whole promo group) */
  propertyIds: string[];
}

export function isTurnoverClean(job: CleaningJob): boolean {
  return (job.jobType ?? 'cleaning') === 'cleaning';
}

/** Charged on the card, or invoiced outside Stripe. */
export function isPaidClean(job: CleaningJob): boolean {
  return !!job.chargedAt || job.chargeStatus === 'external';
}

/** All configs that share a deal with `config` (its promo group, or just itself). */
export function promoGroupConfigs(config: CleaningPropertyConfig, configs: CleaningPropertyConfig[]): CleaningPropertyConfig[] {
  if (!config.promo) return [];
  const group = config.promo.group;
  if (!group) return [config];
  const members = configs.filter(c => c.promo && c.promo.group === group);
  return members.length ? members : [config];
}

export function promoProgressFor(config: CleaningPropertyConfig, configs: CleaningPropertyConfig[], jobs: CleaningJob[]): PromoProgress | null {
  if (!config.promo) return null;
  const members = promoGroupConfigs(config, configs);
  const paidRequired = Math.max(0, config.promo.paidCleans);
  const freeTotal = Math.max(0, config.promo.freeCleans);
  const startedAt = (config.promo.startedAt ?? '').slice(0, 10);
  const propertyIds = new Set<string>();
  for (const c of members) {
    propertyIds.add(c.propertyId);
    for (const sub of c.linkedPropertyIds ?? []) propertyIds.add(sub);
  }
  const counted = jobs.filter(j => propertyIds.has(j.propertyId) && j.status !== 'cancelled' && isTurnoverClean(j) && (!startedAt || j.checkoutDate >= startedAt));
  const paidDone = counted.filter(isPaidClean).length;
  const freeUsed = counted.filter(j => !!j.promoFree).length;
  return { paidDone, paidRequired, freeUsed, freeTotal, nextIsFree: paidDone >= paidRequired && freeUsed < freeTotal, complete: freeUsed >= freeTotal, propertyIds: [...propertyIds] };
}

/** Short status for badges: "3/5 paid · 2 free next", "1 of 2 free cleans used", "deal complete". */
export function promoLabel(p: PromoProgress): string {
  if (p.complete) return `Welcome deal complete (${p.freeTotal} free cleans used)`;
  if (p.nextIsFree) return `Next clean is FREE (${p.freeUsed + 1} of ${p.freeTotal})`;
  return `${Math.min(p.paidDone, p.paidRequired)}/${p.paidRequired} paid cleans · then ${p.freeTotal - p.freeUsed} free`;
}

export function newPromo(now = new Date().toISOString()): NonNullable<CleaningPropertyConfig['promo']> {
  return { type: PROMO_WELCOME, paidCleans: 5, freeCleans: 2, startedAt: now };
}
