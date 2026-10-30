import type { PlanId } from "@/lib/types";

export interface Plan {
  id: PlanId;
  name: string;
  /** US dollars per month, for display only. The amount actually charged is the price you create in Stripe: keep them the same. */
  price: number;
  blurb: string;
  features: string[];
  highlight?: boolean;
}

// PLACEHOLDER PRICES: change these to your real pricing (and create matching Stripe prices; see the README).
export const plans: Plan[] = [
  {
    id: "free",
    name: "Basic",
    price: 0,
    blurb: "A free listing in the directory.",
    features: [
      "Listing page with your contact details and services",
      "Appears in the directory and on service-area pages",
      "Contractor login to edit your profile",
    ],
  },
  {
    id: "featured",
    name: "Featured",
    price: 49,
    blurb: "Stand out in the directory.",
    highlight: true,
    features: [
      "Everything in Basic",
      "Featured badge and placement above Basic listings",
      "Show your Google star rating and review link",
      "Longer description and highlighted services",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    price: 99,
    blurb: "Top placement plus customer referrals.",
    features: [
      "Everything in Featured",
      "Top-of-list placement ahead of Featured listings",
      "Eligible for customer requests, shown in your dashboard",
      "Mark leads contacted, won or lost and keep notes",
    ],
  },
];

export const planName = (id: PlanId | undefined) => plans.find((p) => p.id === id)?.name ?? "Basic";

export const pricingFaq: { question: string; answer: string }[] = [
  {
    question: "Are customer requests guaranteed?",
    answer: "No. Requests come from people who use our service request form and depend on demand in your area. We assign requests to eligible Premium contractors at our discretion, and we cannot promise any number of requests or jobs.",
  },
  {
    question: "Is Featured placement advertising?",
    answer: "Yes. Featured and Premium listings are paid placements and are labeled that way. They do not mean we have checked a contractor's licence, insurance or work quality.",
  },
  {
    question: "Where does the star rating come from?",
    answer: "You enter the rating and review count shown on your own Google Business Profile and link to it. We label it as reported by the business and show when it was last updated. We do not verify it automatically.",
  },
  {
    question: "Can I cancel?",
    answer: "Yes. Manage or cancel your subscription any time from the Billing page in your dashboard. Your plan stays active until the end of the period you paid for.",
  },
  {
    question: "How do I get a contractor login?",
    answer: "Create an account, then claim your existing listing or add your business. We review every claim before you can edit a listing, so no one can take over a business that is not theirs.",
  },
];
