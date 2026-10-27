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
}

export interface Post {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  meta_description: string | null;
  content: string;
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
