/** One conversation (a request plus a business) as the inbox lists it, for either side. */
export interface Conversation {
  lead_id: string;
  listing_id: string;
  /** What to call the other side: the business name for a customer, the customer's first name (or "Customer") for a business. */
  title: string;
  /** The request, e.g. "AC Not Cooling". */
  issue: string;
  place?: string;
  can_send: boolean;
  last_body: string | null;
  last_sender: "business" | "customer" | null;
  last_at: string | null;
  unread: number;
}

export interface ChatMessage {
  id: number;
  created_at: string;
  sender: "business" | "customer";
  /** The business name, or the customer's email address. */
  sender_name: string;
  body: string;
  mine: boolean;
  read_at: string | null;
}

export type Role = "customer" | "business";

export const MAX_MESSAGE = 2000;

/** The words for a customer's request log. */
export function requestLogLabel(kind: string, business: string | null): string {
  const b = business ?? "A business";
  switch (kind) {
    case "received": return "We received your request";
    case "no_match": return "No business near you yet. We keep looking";
    case "sent": return `Sent to ${b}`;
    case "contacted": return `${b} has been in touch`;
    case "closed": return "Your request was closed";
    case "message_in": return `${b} sent you a message`;
    case "message_out": return `You sent ${b} a message`;
    default: return kind;
  }
}

/** A short line for the inbox: who spoke last, and a clipped start of it. */
export function preview(c: Pick<Conversation, "last_body" | "last_sender">, role: Role): string {
  if (!c.last_body) return "No messages yet";
  const mine = c.last_sender === (role === "customer" ? "customer" : "business");
  const text = c.last_body.replace(/\s+/g, " ").trim();
  return `${mine ? "You: " : ""}${text.length > 70 ? `${text.slice(0, 67)}…` : text}`;
}

/** Turns what the database says went wrong into a sentence for a person. */
export function sendError(message: string | undefined): string {
  const m = message ?? "";
  if (/Unlock/i.test(m)) return "Messaging opens once the business has unlocked this request.";
  if (/Too many/i.test(m)) return "You've sent a lot of messages. Please wait a little before sending more.";
  if (/1 to 2000/.test(m)) return `A message must be between 1 and ${MAX_MESSAGE} characters.`;
  if (/Sign in/i.test(m)) return "Please sign in again.";
  return "We couldn't send that. Please try again.";
}
