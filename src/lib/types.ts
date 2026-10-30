export const LEAD_STATUSES = ["new", "contacted", "closed", "spam"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface Lead {
  id: string;
  created_at: string;
  status: LeadStatus;
  notes: string | null;
  source: string | null;
  issue: string;
  urgency: string;
  country: string;
  state: string;
  city: string;
  postal_code: string;
  street: string;
  unit: string | null;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  contact_method: string;
  description: string | null;
  property_type: string;
  property_status: string;
  preferred_contact_time: string | null;
  referral_acknowledgment: boolean;
  marketing_consent: boolean;
  assigned_listing_id?: string | null;
  assigned_at?: string | null;
  contractor_status?: ContractorLeadStatus;
}

export const CONTRACTOR_LEAD_STATUSES = ["new", "contacted", "won", "lost"] as const;
export type ContractorLeadStatus = (typeof CONTRACTOR_LEAD_STATUSES)[number];

/** A lead as a contractor sees it (returned by the my_leads() database function). */
export interface ContractorLead {
  id: string;
  created_at: string;
  assigned_at: string | null;
  issue: string;
  urgency: string;
  city: string;
  state: string;
  postal_code: string;
  street: string;
  unit: string | null;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  contact_method: string;
  description: string | null;
  property_type: string;
  property_status: string;
  preferred_contact_time: string | null;
  contractor_status: ContractorLeadStatus;
  contractor_notes: string | null;
}

export interface Post {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  meta_description: string | null;
  content: string;
  cover_image: string | null;
  status: "draft" | "published";
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PageView {
  created_at: string;
  path: string;
  referrer_host: string | null;
  utm_source: string | null;
  device: "mobile" | "tablet" | "desktop" | null;
  session_id: string | null;
}

export const LISTING_STATUSES = ["pending", "published", "hidden"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export interface Listing {
  id: string;
  created_at: string;
  updated_at: string;
  slug: string;
  status: ListingStatus;
  business_name: string;
  description: string | null;
  services: string[];
  emergency_service: boolean;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string;
  state: string;
  postal_code: string | null;
  service_areas: string | null;
  source?: "submitted" | "seed" | "agent" | "manual";
  source_url?: string | null;
  attribution?: string | null;
  plan?: PlanId;
  plan_until?: string | null;
  google_reviews_url?: string | null;
}

export type PlanId = "free" | "featured" | "premium";

export interface ListingClaim {
  id: string;
  created_at: string;
  user_id: string;
  user_email: string | null;
  listing_id: string;
  contact_name: string;
  contact_phone: string | null;
  note: string | null;
  status: "pending" | "approved" | "rejected";
}

export interface ListingBilling {
  listing_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: string | null;
  status: string | null;
  current_period_end: string | null;
}

/** Admin-only details stored in a separate table. */
export interface ListingPrivate {
  listing_id: string;
  submitter_name: string | null;
  submitter_email: string | null;
  admin_notes: string | null;
}

export interface DiscoveryJob {
  id: string;
  created_at: string;
  label: string;
  query: string;
  location: string;
  max_results: number;
  frequency: "daily" | "weekly" | "manual";
  enabled: boolean;
  run_requested: boolean;
  last_run_at: string | null;
  last_status: string | null;
  last_found: number | null;
}

export interface ListingCandidate {
  id: string;
  fetched_at: string;
  job_id: string | null;
  external_id: string;
  origin: "web" | "osm";
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  phone: string | null;
  website: string | null;
  source_url: string | null;
  services: string[];
  emergency: boolean;
  verified: boolean;
  confidence: number;
  notes: string | null;
}

export interface DiscoveryRun {
  id: string;
  job_id: string | null;
  started_at: string;
  finished_at: string | null;
  status: string | null;
  found: number;
  log: string[];
}
