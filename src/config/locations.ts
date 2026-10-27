export interface ServiceLocation {
  slug: string;
  name: string;
  state: string;
  type: "state" | "city";
  /** Landing page path, e.g. "/hvac-contractor-austin". */
  path: string;
  /** Short, factual local context used on the landing page. Keep it general and accurate. */
  context: string;
  /** Slugs of related locations for internal linking. */
  nearby: string[];
  /** Flip to true only once contractor coverage is confirmed. */
  coverageConfirmed: boolean;
}

const path = (slug: string) => `/hvac-contractor-${slug}`;

// Example locations. Contractor coverage has not been confirmed for any of them.
export const locations: ServiceLocation[] = [
  {
    slug: "texas", name: "Texas", state: "Texas", type: "state", path: path("texas"), coverageConfirmed: false,
    context: "Texas homes and businesses rely heavily on air conditioning through long, hot summers, while heating still matters during cold snaps. Climate varies a lot from the Gulf Coast to the Panhandle, so the right equipment and service needs differ by region.",
    nearby: ["austin", "dallas", "houston", "san-antonio"],
  },
  {
    slug: "austin", name: "Austin", state: "Texas", type: "city", path: path("austin"), coverageConfirmed: false,
    context: "Central Texas has long, hot cooling seasons, so air conditioners in Austin often run for months at a time. Winters are milder, but furnaces and heat pumps still need to work during cold snaps.",
    nearby: ["san-antonio", "dallas", "houston", "texas"],
  },
  {
    slug: "dallas", name: "Dallas", state: "Texas", type: "city", path: path("dallas"), coverageConfirmed: false,
    context: "North Texas has hot summers and winters that can swing between mild and freezing, so both cooling and heating equipment see regular use. Systems that work hard in both seasons can wear out in different ways.",
    nearby: ["austin", "houston", "san-antonio", "texas"],
  },
  {
    slug: "houston", name: "Houston", state: "Texas", type: "city", path: path("houston"), coverageConfirmed: false,
    context: "Houston combines heat with high humidity, which puts extra demand on air conditioners and can make moisture-related problems, such as clogged condensate drains, more noticeable.",
    nearby: ["austin", "san-antonio", "dallas", "texas"],
  },
  {
    slug: "san-antonio", name: "San Antonio", state: "Texas", type: "city", path: path("san-antonio"), coverageConfirmed: false,
    context: "South Central Texas has a long cooling season, so air conditioning is the system most households and businesses depend on. Heating needs are lighter, but equipment should still be ready for cold spells.",
    nearby: ["austin", "houston", "dallas", "texas"],
  },
];

/** Location pages are live. */
export const locationPagesPublished = true;

export const getLocation = (slug: string | undefined) => locations.find((l) => l.slug === slug);

/** "Austin, Texas" for cities; "Texas" for states. */
export const locationLabel = (l: ServiceLocation) => (l.type === "city" ? `${l.name}, ${l.state}` : l.name);
