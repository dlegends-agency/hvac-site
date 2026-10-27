export interface ServiceLocation {
  slug: string;
  name: string;
  state: string;
  type: "state" | "city";
  /** Future landing page path. These pages are NOT built yet. */
  path: string;
  /** Flip to true only once contractor coverage is confirmed. */
  coverageConfirmed: boolean;
}

// Examples only. Coverage has not been confirmed for any location.
export const locations: ServiceLocation[] = [
  { slug: "texas", name: "Texas", state: "Texas", type: "state", path: "/hvac-repair-texas", coverageConfirmed: false },
  { slug: "austin", name: "Austin", state: "Texas", type: "city", path: "/hvac-repair-austin", coverageConfirmed: false },
  { slug: "dallas", name: "Dallas", state: "Texas", type: "city", path: "/hvac-repair-dallas", coverageConfirmed: false },
  { slug: "houston", name: "Houston", state: "Texas", type: "city", path: "/hvac-repair-houston", coverageConfirmed: false },
  { slug: "san-antonio", name: "San Antonio", state: "Texas", type: "city", path: "/hvac-repair-san-antonio", coverageConfirmed: false },
];

/** Set to true once the location landing pages exist; the cards then link to them. */
export const locationPagesPublished = false;
