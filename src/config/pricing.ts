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

/**
 * What it costs to unlock ONE customer request, building permit or government bid, by plan ("paid" is Featured), in US dollars.
 * Premium unlocks everything and pays nothing. The server charges functions/_lib/stripe.ts UNLOCK_CENTS: keep them the same.
 */
export const unlockPrice = {
  lead: { free: 10, paid: 5 },
  permit: { free: 10, paid: 5 },
  bid: { free: 100, paid: 50 },
} as const;

export const plans: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: { month: 0, year: 0 },
    blurb: "Get listed and see what is out there.",
    features: [
      "Directory listing with your business name, phone number and address",
      "About us, an emergency-service label, license badge and customer recommendations",
      "One Leads page with customer requests, building permits and government bids near you",
      "See a customer's first name and the problem; permits and bids show a short preview",
      "Save leads to My Leads and track your projects and bids",
      `Unlock the full details: $${unlockPrice.lead.free} per customer request, $${unlockPrice.permit.free} per permit, $${unlockPrice.bid.free} per government bid`,
    ],
    locked: ["Customer's full name", "List of services, service areas, opening hours and photos", "Verified by HVACHelp badge", "Google star rating and reviews"],
  },
  {
    id: "featured",
    name: "Featured",
    price: { month: 99, year: 990 },
    blurb: "Stand out in the directory and pay half as much to unlock.",
    highlight: true,
    features: [
      "Everything in Free",
      "See the customer's full name on every request",
      "Featured badge and placement above free listings",
      "Services, service areas, website and email shown on your directory listing",
      "Opening hours with an \"Open now\" label, photos and the Verified by HVACHelp badge",
      "Feature one recommendation and connect your Google reviews",
      "Customer requests are sent to paid listings first",
      `Unlock for half price: $${unlockPrice.lead.paid} per customer request, $${unlockPrice.permit.paid} per permit, $${unlockPrice.bid.paid} per government bid`,
    ],
  },
  {
    id: "premium",
    name: "Premium",
    price: { month: 49, year: 499 },
    blurb: "Every lead fully unlocked, with all the Featured benefits.",
    features: [
      "Everything in Featured",
      "Every customer request, building permit and government bid is fully unlocked: full details, phone, email and address, at no extra cost",
      "Unlimited unlocks, nothing to pay per lead",
      "Every Featured benefit on the directory",
    ],
  },
];

export const planName = (id: PlanId | undefined) => plans.find((p) => p.id === id)?.name ?? "Free";

/** What a contractor on this plan pays to unlock one lead of this kind (0 for Premium). */
export const unlockCost = (plan: PlanId, kind: keyof typeof unlockPrice): number => (plan === "premium" ? 0 : unlockPrice[kind][plan === "featured" ? "paid" : "free"]);

/** How much a year saves over twelve months, for a plan. */
export const yearlySavingFor = (id: PlanId) => {
  const p = plans.find((x) => x.id === id);
  return p ? Math.max(0, p.price.month * 12 - p.price.year) : 0;
};

export const pricingFaq: { question: string; answer: string }[] = [
  {
    question: "What do I see before I pay for a request?",
    answer: `The Free plan shows a customer's first name and the problem; Featured also shows the full name. Building permits and government bids show a short preview. To see the phone number, email, address and the rest, you unlock that lead: customer requests ${unlockPrice.lead.free} (Free) or ${unlockPrice.lead.paid} (Featured), building permits ${unlockPrice.permit.free} or ${unlockPrice.permit.paid}, government bids ${unlockPrice.bid.free} or ${unlockPrice.bid.paid}. Premium has every lead unlocked at no extra cost. You pay per lead, only for the ones you want.`,
  },
  {
    question: "Are customer requests guaranteed?",
    answer: "No. Requests come from people who use our service request form and depend on demand in your area. Each new request is sent automatically to up to three contractors near the customer (in their city, or within the travel distance the contractor sets), paid listings first and then in turn. We cannot promise any number of requests or jobs, and a request may be shared with other contractors.",
  },
  {
    question: "What does the Free plan show about my business?",
    answer: "Your business name, phone number, address, license number (if you add one), your About us, an emergency-service label if you offer it, and any customer recommendations you choose to show. Your list of services, service areas, opening hours, photos, website, email and Google star rating are only shown on the directory for paid (Featured) listings.",
  },
  {
    question: "What do the badges mean?",
    answer: "\"Verified by HVACHelp\" means you have a Featured plan and we confirmed that you manage the listing when we approved your claim. It does not mean we checked your licensing, insurance or work. \"License no. provided\" means you gave us a license number. It changes to \"License verified\" after we check the number with the state.",
  },
  {
    question: "How do recommendations work?",
    answer: "Customers write a recommendation on your listing page. It is saved, and you decide in your dashboard whether to show it. You cannot edit what a customer wrote, and your page says that the business chooses which recommendations to show. On the Featured plan you can feature one recommendation above About us. When email sending is set up, customers also confirm their email address, and the recommendation is marked \"Email confirmed\". We cannot confirm that the work was done.",
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
