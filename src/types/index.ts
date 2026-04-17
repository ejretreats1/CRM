export type LeadStage = 'new' | 'cold' | 'won';
export type OutreachType = 'call' | 'email' | 'text' | 'meeting' | 'other';
export type OutreachOutcome = 'positive' | 'neutral' | 'negative' | 'no_response';
export type PropertyStatus = 'active' | 'inactive' | 'onboarding';
export type LeadSource = 'referral' | 'website' | 'social' | 'cold_outreach' | 'facebook_outreach' | 'airbnb_outreach' | 'event' | 'other';

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  propertyAddress: string;
  propertyType: string;
  bedrooms: number;
  estimatedRevenue: number;
  stage: LeadStage;
  notes: string;
  source: LeadSource;
  scheduledCallAt?: string;
  scheduledCallLink?: string;
  createdAt: string;
  updatedAt: string;
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

export type View = 'dashboard' | 'pipeline' | 'owners' | 'owner-detail' | 'outreach' | 'settings' | 'va-hub' | 'drive';

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

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  projectId?: string;
  priority: Priority;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
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
