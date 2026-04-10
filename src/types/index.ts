export type LeadStage = 'new' | 'contacted' | 'proposal' | 'negotiating' | 'won' | 'lost';
export type OutreachType = 'call' | 'email' | 'text' | 'meeting' | 'other';
export type OutreachOutcome = 'positive' | 'neutral' | 'negative' | 'no_response';
export type PropertyStatus = 'active' | 'inactive' | 'onboarding';
export type LeadSource = 'referral' | 'website' | 'social' | 'cold_outreach' | 'event' | 'other';

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

export type View = 'dashboard' | 'pipeline' | 'owners' | 'owner-detail' | 'outreach' | 'settings';
