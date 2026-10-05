export type CleaningJobStatus = 'pending' | 'dispatched' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
export type CleaningJobSource = 'uplisting' | 'hostaway' | 'manual' | 'ical';
export type CleaningJobType = 'cleaning' | 'handyman' | 'lawncare';

export interface Cleaner {
  id: string;
  name: string;
  email: string;
  phone?: string;
  photoUrl?: string;
  stripeAccountId?: string;
  stripeConnectStatus?: 'pending' | 'active';
  agreementSignedAt?: string;
  /** pending = onboarding (agreement and/or Stripe payouts not done yet); never dispatched */
  status: 'active' | 'inactive' | 'pending';
  createdAt: string;
  dashboardToken?: string;
  skills?: CleaningJobType[];
  payoutInfo?: string;
}

export interface AssignedCleaner {
  id: string;
  payout: number;
}

export interface IcalUrl {
  platform: string;
  url: string;
  lastSyncedAt?: string;
  unitName?: string;
}

export interface CleaningPropertyConfig {
  id: string;
  propertyId: string;
  propertyName: string;
  cleaningFee: number;
  assignedCleaners: AssignedCleaner[]; // priority order, each with their own negotiated payout
  enrolledAt: string;
  stripeCustomerId?: string;
  stripePaymentMethodId?: string;
  clientEmail?: string;
  clientName?: string;
  onboardedAt?: string;
  doorCode?: string;
  address?: string;
  checkoutTime?: string;
  checkinTime?: string;
  photoUrl?: string;
  stagingPhotoUrls?: string[];
  icalUrls?: IcalUrl[];
  laundromatAddress?: string;
  linkedPropertyIds?: string[];
  clientPhone?: string;
  /** Free-form details the client supplied at enrollment (wifi, trash, supplies, parking…) */
  clientNotes?: string;
  /** stripe (default): charge the card on file after each clean. external: client pays E&J outside Stripe; the cleaner is still paid via Stripe after each report. */
  billingMode?: 'stripe' | 'external';
}

/** A link sent to a client so they can enroll their own property details. */
export interface CleaningEnrollmentLink {
  id: string;
  token: string;
  clientName?: string;
  clientEmail: string;
  clientPhone?: string;
  status: 'pending' | 'submitted';
  propertyConfigIds: string[];
  createdAt: string;
  expiresAt?: string;
  submittedAt?: string;
}

export interface CleaningPortalData {
  checklist: Record<string, boolean>;
  photos: string[];
  damageNotes?: string;
  damageMedia?: string[];
  suppliesNotes?: string;
  submittedAt: string;
  /** The office waived the cleaner's report (e.g. portal outage); billing proceeds without one */
  waived?: boolean;
  waivedNote?: string;
}

export interface CleaningExpense {
  id: string;
  date: string;
  amount: number;
  description: string;
  category: 'laundry' | 'supplies' | 'other';
  createdAt: string;
}

export interface CleaningJob {
  id: string;
  reservationId?: string;
  propertyId: string;
  propertyName: string;
  guestName?: string;
  checkoutDate: string;
  /** Next guest's check-in (server-computed from the booking calendar) */
  checkinDate?: string;
  /** Uplisting sub-listing / iCal unit the booking belongs to, for multi-unit properties */
  unitId?: string;
  /** Next guest arrives the same day the clean happens */
  sameDay?: boolean;
  rescheduleCount?: number;
  status: CleaningJobStatus;
  assignedCleanerId?: string;
  assignedCleanerName?: string;
  cleaningFee: number;
  cleanerPayout: number;
  dispatchedAt?: string;
  acceptedAt?: string;
  completedAt?: string;
  chargedAt?: string;
  stripeChargeId?: string;
  payoutSentAt?: string;
  stripeTransferId?: string;
  /** processing | charged | failed — set by the server billing flow */
  /** external = client is invoiced outside Stripe; nothing was charged in the CRM */
  chargeStatus?: 'processing' | 'charged' | 'failed' | 'external';
  chargeAttempts?: number;
  lastChargeError?: string;
  nextChargeAttemptAt?: string;
  /** processing | sent | sent_manual | manual_due | failed */
  payoutStatus?: 'processing' | 'sent' | 'sent_manual' | 'manual_due' | 'failed';
  payoutError?: string;
  payoutMethod?: string;
  payoutReference?: string;
  /** When the cleaner's payout is scheduled to be sent (2 days after the report) */
  payoutDueAt?: string;
  /** The offer email to the current cleaner failed (server-set) */
  dispatchEmailError?: string;
  morningSmsSentAt?: string;
  receiptSentAt?: string;
  notes?: string;
  jobType?: CleaningJobType;
  portalData?: CleaningPortalData;
  source: CleaningJobSource;
  createdAt: string;
  updatedAt: string;
}
