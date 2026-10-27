export const HVAC_ISSUES = [
  "AC Not Cooling",
  "AC Not Turning On",
  "Furnace Not Heating",
  "No Heating or Cooling",
  "HVAC Making Strange Noises",
  "Water Leaking From HVAC",
  "Thermostat Problem",
  "Emergency Heating Repair",
  "Emergency AC Repair",
  "Commercial HVAC Problem",
  "Other",
] as const;
export type HvacIssue = (typeof HVAC_ISSUES)[number];

export const URGENCY_OPTIONS = ["Immediately", "As soon as possible", "Flexible timing"] as const;

export type ServiceIcon =
  | "snowflake"
  | "flame"
  | "wrench"
  | "fan"
  | "power"
  | "thermometer"
  | "droplets"
  | "building";

export interface ServiceCategory {
  id: string;
  name: string;
  description: string;
  icon: ServiceIcon;
  /** Issue preselected in the lead form when the card CTA is used. */
  issue: HvacIssue;
  /** Slug of the guide page for this service (see serviceContent.ts). */
  pageSlug?: string;
}

export const services: ServiceCategory[] = [
  { id: "emergency-ac", pageSlug: "emergency-ac-repair", name: "Emergency AC Repair", icon: "snowflake", issue: "Emergency AC Repair",
    description: "Cooling has stopped or is failing during hot weather." },
  { id: "emergency-furnace", pageSlug: "furnace-repair", name: "Emergency Furnace Repair", icon: "flame", issue: "Furnace Not Heating",
    description: "Your furnace won't produce heat when you need it." },
  { id: "heating-repair", pageSlug: "heat-pump-repair", name: "Heating System Repair", icon: "wrench", issue: "Emergency Heating Repair",
    description: "Heat pumps, boilers and other heating equipment that isn't working properly." },
  { id: "ac-repair", pageSlug: "ac-repair", name: "Air Conditioning Repair", icon: "fan", issue: "AC Not Cooling",
    description: "Weak airflow, warm air or a system that won't cool the space." },
  { id: "breakdown", name: "HVAC System Breakdown", icon: "power", issue: "No Heating or Cooling",
    description: "The whole system is down, won't start or keeps shutting off." },
  { id: "thermostat", name: "Thermostat Problems", icon: "thermometer", issue: "Thermostat Problem",
    description: "Blank screens, wrong readings or controls that don't respond." },
  { id: "leaks", pageSlug: "ac-repair", name: "HVAC Leak Problems", icon: "droplets", issue: "Water Leaking From HVAC",
    description: "Water pooling around your indoor or outdoor unit." },
  { id: "commercial", pageSlug: "commercial-hvac-repair", name: "Commercial HVAC Repair", icon: "building", issue: "Commercial HVAC Problem",
    description: "Heating or cooling failures at offices, shops and other commercial properties." },
];
