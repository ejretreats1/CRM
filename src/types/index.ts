export type LeadStage = 'new' | 'contacted' | 'cold' | 'won';
export type OutreachType = 'call' | 'email' | 'text' | 'meeting' | 'other';
export type OutreachOutcome = 'positive' | 'neutral' | 'negative' | 'no_response';
export type PropertyStatus = 'active' | 'inactive' | 'onboarding';
export type LeadSource = 'referral' | 'website' | 'social' | 'cold_outreach' | 'facebook_outreach' | 'meta_ads' | 'airbnb_outreach' | 'event' | 'other';

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  propertyAddress: string;
  propertyType: string;
  bedrooms: number;
  bathrooms?: number;
  estimatedRevenue: number;
  stage: LeadStage;
  notes: string;
  source: LeadSource;
  scheduledCallAt?: string;
  scheduledCallLink?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyInfo {
  doorCode?: string;
  lockboxCode?: string;
  gateCode?: string;
  garageCode?: string;
  parkingNotes?: string;
  wifiNetwork?: string;
  wifiPassword?: string;
  checkInTime?: string;
  checkOutTime?: string;
  checkInInstructions?: string;
  checkOutInstructions?: string;
  thermostatNotes?: string;
  breakerLocation?: string;
  waterShutoffLocation?: string;
  gasShutoffLocation?: string;
  alarmCode?: string;
  alarmCompany?: string;
  trashPickupDays?: string;
  trashBinLocation?: string;
  trashNotes?: string;
  quietHours?: string;
  petPolicy?: string;
  smokingPolicy?: string;
  houseRulesNotes?: string;
  applianceNotes?: string;
  generalNotes?: string;
  onboardingChecklist?: Record<string, boolean>;
  onboardingCustomItems?: { id: string; label: string }[];
}

export interface Property {
  id: string;
  address: string;
  city: string;
  state: string;
  type: string;
  bedrooms: number;
  bathrooms: number;
  maxGuests: number;
  monthlyRevenue: number;
  occupancyRate: number;
  platforms: string[];
  status: PropertyStatus;
  joinedAt: string;
  photoUrl?: string;
  linkedListingIds?: string[];
  propertyInfo?: PropertyInfo;
}

export interface Vendor {
  id: string;
  name: string;
  role: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export interface Owner {
  id: string;
  name: string;
  email: string;
  phone: string;
  properties: Property[];
  notes: string;
  source: LeadSource;
  createdAt: string;
  vendors?: Vendor[];
}

export interface OutreachEntry {
  id: string;
  leadId?: string;
  ownerId?: string;
  contactName: string;
  contactType: 'lead' | 'owner';
  type: OutreachType;
  subject: string;
  notes: string;
  date: string;
  outcome: OutreachOutcome;
  followUpDate?: string;
}

export type View = 'dashboard' | 'pipeline' | 'owners' | 'owner-detail' | 'outreach' | 'settings' | 'va-hub' | 'drive' | 'revenue-reports' | 'listing-optimizer' | 'newsletter' | 'guest-marketing' | 'quarterly-reports' | 'properties' | 'property-portal' | 'calendar-intel';

export interface RevenueReport {
  id: string;
  createdAt: string;
  propertyAddress: string;
  leadId?: string;
  ownerId?: string;
  reportType?: 'str' | 'mtr';
  reportData?: Record<string, unknown>;
  airdnaProjectedRevenue?: number;
  airdnaOccupancyRate?: number;
  airdnaAdr?: number;
  airdnaRevpar?: number;
  ownerActualRevenue?: number;
  ownerNotes?: string;
  claudeNarrative?: string;
  keyFindings?: string[];
  opportunityScore?: number;
  reportTitle?: string;
}

export type ProjectStatus = 'pending' | 'in_progress' | 'approved' | 'completed';
export type Priority = 'low' | 'medium' | 'high';

export interface Project {
  id: string;
  title: string;
  description: string;
  status: ProjectStatus;
  priority: Priority;
  assignedTo: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type TodoAssignee = 'ethan' | 'jess' | 'va';

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  inProgress?: boolean;
  assignedTo?: TodoAssignee;
  projectId?: string;
  priority: Priority;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  linkedOwnerId?: string;
  linkedPropertyId?: string;
}

export type SignatureRequestStatus = 'pending' | 'signed' | 'expired';

export interface SignatureRequest {
  id: string;
  ownerId: string;
  documentName: string;
  documentUrl: string;
  signedDocumentUrl?: string;
  status: SignatureRequestStatus;
  token: string;
  sentToEmail: string;
  sentAt: string;
  signedAt?: string;
  expiresAt: string;
  sigX?: number;
  sigY?: number;
  dateX?: number;
  dateY?: number;
}
