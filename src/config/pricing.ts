import type { PlanId } from "@/lib/types";

export interface Plan {
  id: PlanId;
  name: string;
  /** US dollars. The amount actually charged is the price you create in Stripe: keep them the same. */
  price: { month: number; year: number };
  blurb: string;
  features: string[];
  /** Things this plan does not include (shown with a lock). */
  locked?: string[];
  highlight?: boolean;
}

/**
 * What a contractor pays to unlock ONE customer's full details (phone, email, address, description), in US dollars.
 * The server charges functions/_lib/stripe.ts LEAD_PRICE_CENTS: keep them the same (npm run test:unlock checks this).
 */
export const leadPrice = { free: 10, paid: 5 } as const;

export const plans: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: { month: 0, year: 0 },
    blurb: "Get listed in the directory.",
    features: [
      "Directory listing with your business name, phone number and address",
      "Customer requests near you: you see the customer's name and the problem",
      `Unlock a customer's full details for $${leadPrice.free} per request`,
      "Contractor login and dashboard",
    ],
    locked: ["About us", "List of services", "Service areas", "Google star rating and reviews"],
  },
  {
    id: "featured",
    name: "Featured",
    price: { month: 10, year: 99 },
    blurb: "Stand out and get more from every request.",
    highlight: true,
    features: [
      "Everything in Free",
      "Featured badge and placement above free listings",
      "About us, services and service areas shown on your directory listing",
      "Connect your Google reviews: star rating and review count shown live",
      `Unlock a customer's full details for just $${leadPrice.paid} per request`,
      "Customer requests are sent to paid listings first",
    ],
  },
];

export const planName = (id: PlanId | undefined) => plans.find((p) => p.id === id)?.name ?? "Free";

export const yearlySaving = plans.find((p) => p.id === "featured")!.price.month * 12 - plans.find((p) => p.id === "featured")!.price.year;

export const pricingFaq: { question: string; answer: string }[] = [
  {
    question: "What do I see before I pay for a request?",
    answer: `Only the customer's name and the problem they described. To see their phone number, email, address and the rest of their message you unlock that request: $${leadPrice.free} on the Free plan or $${leadPrice.paid} on the Featured plan. You pay per request, only for the ones you want.`,
  },
  {
    question: "Are customer requests guaranteed?",
    answer: "No. Requests come from people who use our service request form and depend on demand in your area. Each new request is sent automatically to up to three contractors near the customer (in their city, or within the travel distance the contractor sets), paid listings first and then in turn. We cannot promise any number of requests or jobs, and a request may be shared with other contractors.",
  },
  {
    question: "What does the Free plan show about my business?",
    answer: "Your business name, phone number and address. About us, your list of services, your service areas and your Google star rating are only shown on the directory for paid (Featured) listings.",
  },
  {
    question: "Is Featured placement advertising?",
    answer: "Yes. Featured listings are paid placements and are labeled that way. They do not mean we have checked a contractor's licence, insurance or work quality.",
  },
  {
    question: "Where does the star rating come from?",
    answer: "You connect your own Google listing by choosing it from Google's search results. We then show its current star rating and review count, fetched from Google when someone views your listing. You never type the numbers in, and we don't change them. This is available on the Featured plan.",
  },
  {
    question: "Can I cancel?",
    answer: "Yes. Manage or cancel your subscription any time from your dashboard. Your plan stays active until the end of the period you paid for, and you can switch between monthly and yearly. Requests you have already unlocked stay unlocked.",
  },
  {
    question: "Can I get a refund on a request I unlocked?",
    answer: "Unlocked requests are not refundable, because the customer's details are shown as soon as you pay. If a request looks like spam or a duplicate, contact us and we will look at it.",
  },
  {
    question: "How do I get a contractor login?",
    answer: "Create an account, then claim your existing listing or add your business. We review every claim before you can edit a listing, so no one can take over a business that is not theirs.",
  },
];
