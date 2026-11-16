// Catches the address mistakes that stop a business receiving the requests, permits and bids near it: a state typed into the city box,
// a state that is not a US state, or no ZIP code (which the distance matching needs). Used on the contractor's Business profile and in the
// admin listing editor. Nothing is blocked: it only tells the person what to fix.

const STATES: [string, string][] = [
  ["Alabama", "AL"], ["Alaska", "AK"], ["Arizona", "AZ"], ["Arkansas", "AR"], ["California", "CA"], ["Colorado", "CO"], ["Connecticut", "CT"],
  ["Delaware", "DE"], ["District of Columbia", "DC"], ["Florida", "FL"], ["Georgia", "GA"], ["Hawaii", "HI"], ["Idaho", "ID"], ["Illinois", "IL"],
  ["Indiana", "IN"], ["Iowa", "IA"], ["Kansas", "KS"], ["Kentucky", "KY"], ["Louisiana", "LA"], ["Maine", "ME"], ["Maryland", "MD"],
  ["Massachusetts", "MA"], ["Michigan", "MI"], ["Minnesota", "MN"], ["Mississippi", "MS"], ["Missouri", "MO"], ["Montana", "MT"], ["Nebraska", "NE"],
  ["Nevada", "NV"], ["New Hampshire", "NH"], ["New Jersey", "NJ"], ["New Mexico", "NM"], ["New York", "NY"], ["North Carolina", "NC"],
  ["North Dakota", "ND"], ["Ohio", "OH"], ["Oklahoma", "OK"], ["Oregon", "OR"], ["Pennsylvania", "PA"], ["Rhode Island", "RI"],
  ["South Carolina", "SC"], ["South Dakota", "SD"], ["Tennessee", "TN"], ["Texas", "TX"], ["Utah", "UT"], ["Vermont", "VT"], ["Virginia", "VA"],
  ["Washington", "WA"], ["West Virginia", "WV"], ["Wisconsin", "WI"], ["Wyoming", "WY"],
];
const NAMES = new Set(STATES.map(([n]) => n.toLowerCase()));
const CODES = new Set(STATES.map(([, c]) => c.toLowerCase()));

/** Cities that really are called after a state (so a business there is not flagged): "Washington", "New York", "Indiana" (PA), "Oklahoma City" is not a state. */
const REAL_CITY_ALSO_STATE = new Set(["new york", "washington", "kansas"]);

export interface AddressLike {
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
}

/** What is wrong with this address for matching, in plain words. Empty when it looks fine. */
export function addressProblems(a: AddressLike): string[] {
  const out: string[] = [];
  const city = (a.city ?? "").trim().toLowerCase();
  const state = (a.state ?? "").trim().toLowerCase();
  const zip = (a.postal_code ?? "").replace(/[^0-9]/g, "");
  if (!city) out.push("Add the city.");
  else if ((NAMES.has(city) || CODES.has(city)) && !REAL_CITY_ALSO_STATE.has(city)) {
    out.push(`The city is "${(a.city ?? "").trim()}", which is a state, not a city. Put the real city (for example Bethlehem) in the city box and the state in the state box.`);
  }
  if (!state) out.push("Add the state.");
  else if (!NAMES.has(state) && !CODES.has(state)) out.push(`"${(a.state ?? "").trim()}" is not a US state. Use the full name (Pennsylvania) or the two letters (PA).`);
  if (zip.length < 5) out.push("Add the 5-digit ZIP code: nearby requests, permits and bids are matched by distance from it.");
  return out;
}
