export type CleaningJobStatus = 'pending' | 'dispatched' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
export type CleaningJobSource = 'uplisting' | 'hostaway' | 'manual';

export interface Cleaner {
  id: string;
  name: string;
  email: string;
  phone?: string;
  stripeAccountId?: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface CleaningPropertyConfig {
  id: string;
  propertyId: string;
  propertyName: string;
  cleaningFee: number;
  cleanerPayout: number;
  assignedCleanerIds: string[];
  enrolledAt: string;
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
  notes?: string;
  source: CleaningJobSource;
  createdAt: string;
  updatedAt: string;
}
