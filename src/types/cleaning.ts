export type CleaningJobStatus = 'pending' | 'dispatched' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
export type CleaningJobSource = 'uplisting' | 'hostaway' | 'manual' | 'ical';

export interface Cleaner {
  id: string;
  name: string;
  email: string;
  phone?: string;
  photoUrl?: string;
  stripeAccountId?: string;
  stripeConnectStatus?: 'pending' | 'active';
  agreementSignedAt?: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface AssignedCleaner {
  id: string;
  payout: number;
}

export interface IcalUrl {
  platform: string;
  url: string;
  lastSyncedAt?: string;
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
}

export interface CleaningPortalData {
  checklist: Record<string, boolean>;
  photos: string[];
  damageNotes?: string;
  submittedAt: string;
}

export interface CleaningJob {
  id: string;
  reservationId?: string;
  propertyId: string;
  propertyName: string;
  guestName?: string;
  checkoutDate: string;
  checkinDate?: string;
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
  notes?: string;
  portalData?: CleaningPortalData;
  source: CleaningJobSource;
  createdAt: string;
  updatedAt: string;
}
