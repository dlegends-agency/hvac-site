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
      "Customer requests from your area sent to you automatically",
      "Contact customers and track each request as contacted, won or lost, with notes",
      "Your Google star rating and review count, shown live on your listing and in the directory",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    price: 99,
    blurb: "Top placement and first in line for requests.",
    features: [
      "Everything in Featured",
      "Top-of-list placement ahead of Featured listings",
      "First in line when a request is shared between contractors",
    ],
  },
];

export const planName = (id: PlanId | undefined) => plans.find((p) => p.id === id)?.name ?? "Basic";

export const pricingFaq: { question: string; answer: string }[] = [
  {
    question: "Are customer requests guaranteed?",
    answer: "No. Requests come from people who use our service request form and depend on demand in your area. Each new request is sent automatically to Featured and Premium contractors that serve the customer's city, up to three of them, Premium first and then in turn. We cannot promise any number of requests or jobs, and a request may be shared with other contractors.",
  },
  {
    question: "Is Featured placement advertising?",
    answer: "Yes. Featured and Premium listings are paid placements and are labeled that way. They do not mean we have checked a contractor's licence, insurance or work quality.",
  },
  {
    question: "Where does the star rating come from?",
    answer: "You connect your own Google listing by choosing it from Google's search results. We then show its current star rating and review count, fetched from Google when someone views your listing page. You never type the numbers in, and we don't change them.",
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
