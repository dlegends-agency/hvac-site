import type { HvacIssue } from "@/config/services";
import type { FaqItem } from "@/config/faq";

export interface ContentSection {
  id: string;
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface ServicePageContent {
  slug: string;
  /** Short name used in links and breadcrumbs. */
  name: string;
  /** Issue preselected in the request form from this page. */
  issue: HvacIssue;
  /** <title>, kept near 60 characters. */
  title: string;
  /** Meta description, kept near 155 characters. */
  metaDescription: string;
  h1: string;
  intro: string;
  sections: ContentSection[];
  faqs: FaqItem[];
  related: string[];
  /** Keyword-plan IDs this page targets (see docs/keyword-map.md). */
  keywordIds: string[];
}

const REFERRAL = "We're a referral service, not a contractor. We can help you look for independent local contractors, but we can't promise availability, pricing or response times.";

export const servicePages: ServicePageContent[] = [
  {
    slug: "mini-split-installation", name: "Mini-Split Installation", issue: "Other", keywordIds: ["HV-001", "HV-002", "HV-004", "HV-005", "HV-022"],
    title: "Mini-Split Installation: Brands, Costs, Comparison",
    metaDescription: "Thinking about a ductless mini-split? Learn how installation works, what affects cost, how it compares with central air, and what to ask contractors.",
    h1: "Mini-Split Installation: What to Know Before You Hire",
    intro: "Ductless mini-split systems cool (and often heat) individual rooms or zones without ductwork. This guide explains how installation works, what affects the price, and the questions worth asking before you choose a contractor.",
    sections: [
      { id: "how-it-works", heading: "How mini-split installation works", paragraphs: [
        "A mini-split has an outdoor unit connected to one or more indoor air handlers by a small bundle of refrigerant lines, power and a condensate drain. Installers drill a small opening through the wall, mount the indoor unit, set the outdoor unit on a pad or bracket, connect and test the lines, and commission the system.",
        "Because there is no ductwork, mini-splits are often used for additions, garages, sunrooms and older homes without ducts. Proper sizing and placement matter, because a unit that is too large or too small can run inefficiently or leave hot and cold spots." ] },
      { id: "brands", heading: "Mitsubishi, Daikin and other mini-split brands", paragraphs: [
        "Several manufacturers make ductless equipment, including Mitsubishi, Daikin, Fujitsu, LG, Carrier and others. Differences include efficiency ratings, noise levels, warranty terms, controls and the availability of parts and trained installers in your area.",
        "Some manufacturers have authorized or certified installer programs, and warranty coverage can depend on correct installation. If you want a specific brand, ask any contractor whether they are authorized or certified for it and ask for proof. We can't verify a contractor's brand certifications." ] },
      { id: "cost", heading: "What affects mini-split installation cost", paragraphs: [
        "Prices vary widely by location and project, so be wary of any single number. Ask contractors to itemize their quotes so you can compare like with like.",
      ], bullets: [
        "Number of zones (indoor units) and the capacity of each",
        "Equipment brand, efficiency level and features",
        "Distance between indoor and outdoor units, and how hard the wall and refrigerant-line routing is",
        "Electrical work such as a dedicated circuit or panel upgrade",
        "Condensate drainage, mounting hardware and any permits required locally",
        "Warranty terms for equipment and labor" ] },
      { id: "vs-central-air", heading: "Mini-split vs central air", paragraphs: [
        "Central air distributes cooled air through ducts to the whole house and usually suits homes that already have good ductwork. Mini-splits suit homes without ducts, additions, and spaces where you want separate temperature control by room.",
        "Ducts can lose energy if they are leaky or poorly insulated, and ductless systems avoid that loss. On the other hand, covering a whole house may require several indoor units, and some people prefer the look of vents to wall-mounted units. A load calculation from a qualified contractor can help you compare options for your home." ] },
      { id: "garage-sunroom", heading: "Mini-splits for a garage, sunroom or home addition", paragraphs: [
        "These spaces are often poorly served by existing ducts, and extending ductwork can be costly or impractical. A single-zone mini-split can condition one space independently.",
        "Insulation, windows and how the space is used affect the right size. A contractor should assess the room instead of choosing a unit from square footage alone." ] },
      { id: "questions", heading: "Questions to ask before you hire", paragraphs: [REFERRAL], bullets: [
        "Are you licensed in my state or city, and can you share the license number?",
        "Are you authorized or certified to install the brand I'm considering?",
        "Will you perform a load calculation and place the units based on it?",
        "What is included in the quote, and what is the labor and equipment warranty?",
        "Who pulls permits, and who handles any electrical work?" ] },
    ],
    faqs: [
      { question: "How long does a mini-split installation take?", answer: "It depends on the number of zones and the complexity of the routing. A simple single-zone installation can sometimes be completed in a day, while multi-zone projects usually take longer. Ask your contractor for an estimate." },
      { question: "Do mini-splits provide heating as well as cooling?", answer: "Many mini-splits are heat pumps and provide both. Cold-climate performance varies by model, so ask about the heating capacity at your local winter temperatures." },
      { question: "Can I install a mini-split myself?", answer: "Installation involves refrigerant handling and electrical work, which require proper tools and qualifications, and improper installation can void warranties. We recommend using a qualified, licensed professional." },
      { question: "How do I find a mini-split installer near me?", answer: "You can submit a request and we'll help you look for suitable independent contractors where available, or browse our directory. Always verify credentials yourself." },
    ],
    related: ["heat-pump-installation", "ac-replacement", "hvac-financing"],
  },
  {
    slug: "heat-pump-installation", name: "Heat Pump Installation", issue: "Other", keywordIds: ["HV-003", "HV-006", "HV-020"],
    title: "Heat Pump Installation: Heat Pump vs Furnace Guide",
    metaDescription: "Compare heat pumps and furnaces, understand what affects heat pump installation, and learn how to check for rebates and incentives in your area.",
    h1: "Heat Pump Installation and Heat Pump vs Furnace",
    intro: "A heat pump moves heat instead of burning fuel to create it, and it can heat and cool your home with one system. Whether it beats a furnace for you depends on your climate, existing equipment and energy costs.",
    sections: [
      { id: "heat-pump-or-furnace", heading: "Heat pump or furnace: how to decide", paragraphs: [
        "Heat pumps are often a good fit in moderate climates, and modern cold-climate models perform better in low temperatures than older designs. Furnaces burn gas, oil or use electric resistance and can be a better fit in very cold regions or where fuel is inexpensive.",
        "Other factors include your current ductwork, whether you already have a gas line, the age of your equipment, local electricity and fuel prices, and whether you want one system for heating and cooling. A contractor should compare options for your home instead of recommending one by default." ] },
      { id: "brands", heading: "Trane and other heat pump brands", paragraphs: [
        "Many manufacturers, including Trane, Carrier, Lennox, Rheem, Goodman, Daikin and Mitsubishi, make heat pumps. Compare efficiency ratings (SEER2 and HSPF2), noise, features, warranties and the availability of local service.",
        "If you want a particular brand, ask whether the contractor installs it and holds any manufacturer authorization. Dealer and manufacturer sites will not tell you about installer quality, so check reviews and references too." ] },
      { id: "installation", heading: "What installation involves", paragraphs: [
        "A typical replacement includes removing old equipment, setting the new outdoor and indoor units, connecting refrigerant lines, electrical and drain connections, checking duct sizing and airflow, and commissioning the system. Some homes need electrical upgrades or duct modifications.",
        "Ask what is included in the quote, including permits, thermostat, disposal of old equipment and warranty terms." ] },
      { id: "rebates", heading: "Heat pump rebates and incentives", paragraphs: [
        "Utilities, states and federal programs have offered rebates and tax incentives for efficient equipment, but programs, amounts and eligibility change often. Some end or run out of funding.",
        "Check current details with your electric or gas utility, your state energy office and current IRS guidance, or use a program database such as DSIRE. Ask your contractor which programs apply to the specific equipment they quote, and get any claim in writing. We can't confirm what incentives are available to you." ] },
    ],
    faqs: [
      { question: "Do heat pumps work in cold weather?", answer: "Many modern models do, but performance depends on the model and how cold it gets. Cold-climate heat pumps are designed for low temperatures. Ask for the rated heating capacity at your typical winter lows." },
      { question: "Will a heat pump lower my energy bills?", answer: "It can, but savings depend on your current system, climate, energy prices and usage. Be cautious of any guarantee of specific savings." },
      { question: "Do I need new ductwork for a heat pump?", answer: "Not always. A contractor should check whether your existing ducts are properly sized and in good condition." },
    ],
    related: ["heat-pump-repair", "mini-split-installation", "hvac-financing"],
  },
  {
    slug: "ac-repair", name: "AC Repair", issue: "AC Not Cooling", keywordIds: ["HV-007", "HV-008", "HV-009", "HV-010", "HV-011", "HV-012"],
    title: "AC Repair Help: Freezing, Leaks, Not Turning On",
    metaDescription: "AC freezing up, leaking water, not turning on or low on refrigerant? Learn common causes, safe checks, repair vs replace and when to call a pro.",
    h1: "Air Conditioning Repair: Common Problems and What to Do",
    intro: "When your air conditioner stops working, the symptom often points to the cause. Below are common AC problems, safe checks you can make, and signs that it's time to call a professional.",
    sections: [
      { id: "freezing", heading: "AC freezing up", paragraphs: [
        "Ice on the indoor coil or refrigerant lines usually means airflow is restricted or the system has a refrigerant problem. Common causes are a dirty filter, blocked vents, a failing blower or low refrigerant caused by a leak.",
        "Turn the system off at the thermostat and let the ice melt before calling a technician. Running a frozen system can damage the compressor." ] },
      { id: "leaking-water", heading: "AC leaking water inside the house", paragraphs: [
        "Air conditioners remove moisture as they cool, and that water normally drains away through a condensate line. A clogged line, a cracked drain pan, a failed condensate pump or a frozen coil can cause water to leak indoors.",
        "Turn the system off, mop up water, and check the filter. If leaks continue, or water is near electrical equipment, call a professional. Water can damage ceilings and floors quickly." ] },
      { id: "not-turning-on", heading: "AC unit not turning on", paragraphs: [
        "Start with the simple checks: thermostat mode and batteries, a tripped breaker, and the service switch near the unit. If those are fine, the cause could be a failed capacitor, contactor, control board, safety switch or transformer.",
        "If a breaker keeps tripping, don't keep resetting it. That can indicate an electrical fault that needs a professional." ] },
      { id: "capacitor", heading: "AC capacitor replacement", paragraphs: [
        "Capacitors help motors start and run. When one weakens, the outdoor fan or compressor may hum, struggle or fail to start. Replacement is often a faster, lower-cost repair than other failures, but capacitors store electricity and should only be handled by a qualified technician." ] },
      { id: "refrigerant-leak", heading: "AC refrigerant leak repair", paragraphs: [
        "An air conditioner's refrigerant isn't used up, so low refrigerant means there is a leak. A professional should find and repair the leak instead of just adding refrigerant, and refrigerant handling requires certification in many places.",
        "Signs include weak cooling, ice on the coil, hissing sounds or rising energy bills." ] },
      { id: "compressor", heading: "Compressor problems: repair or replace?", paragraphs: [
        "The compressor is the most expensive component of an air conditioner. When it fails, the choice between repairing and replacing the unit depends on its age, warranty, the cost of the repair and the condition of the rest of the system.",
        "Ask for a written estimate for repair and for replacement, and see our guide on AC repair versus replacement. Prices vary by region and equipment, so compare more than one quote." ] },
      { id: "when-to-call", heading: "When to call a professional", paragraphs: [REFERRAL], bullets: [
        "Ice, water or burning smells that continue after basic checks",
        "Repeated breaker trips or electrical odors",
        "Grinding, squealing or banging noises",
        "Weak cooling that doesn't improve with a clean filter" ] },
    ],
    faqs: [
      { question: "Is it safe to keep running a frozen AC?", answer: "No. Turn the system off at the thermostat so the ice can melt, then have the cause diagnosed." },
      { question: "Can I add refrigerant myself?", answer: "No. Refrigerant handling requires training and certification in many places, and a low charge usually means a leak that needs repair." },
      { question: "Why does my AC run but not cool?", answer: "Possible causes include a dirty filter, a frozen coil, low refrigerant, a failed outdoor fan or compressor, or dirty coils. A technician can diagnose which." },
    ],
    related: ["ac-replacement", "emergency-ac-repair", "heat-pump-repair"],
  },
  {
    slug: "ac-replacement", name: "AC Replacement", issue: "Other", keywordIds: ["HV-013", "HV-014"],
    title: "AC Repair vs Replacement: How to Decide",
    metaDescription: "Should you repair or replace your air conditioner? Factors to weigh, refrigerant changes such as R-410A, and questions to ask before you decide.",
    h1: "AC Repair or Replacement: How to Decide",
    intro: "A major air conditioner repair on an older system raises a big question: fix it or replace it? These are the factors that matter and the questions worth asking contractors.",
    sections: [
      { id: "factors", heading: "Factors to weigh", paragraphs: [
        "There is no single rule, but these points help frame the decision." ], bullets: [
        "Age and condition of the equipment, and whether the compressor or coil is failing",
        "Repair history and how often the system breaks down",
        "Repair cost compared with the cost of replacement, using written estimates for both",
        "Efficiency and comfort, including uneven temperatures and noise",
        "Whether the existing ductwork and electrical supply suit new equipment",
        "Remaining warranty coverage" ] },
      { id: "r410a", heading: "R-410A and refrigerant changes", paragraphs: [
        "Many systems use R-410A refrigerant, and regulations are moving the industry toward newer refrigerants. This can affect which equipment is sold and, over time, the availability and cost of servicing older systems.",
        "Rules and timelines change, so ask your contractor what applies to your equipment and region now before you decide, and verify with current regulations." ] },
      { id: "compare", heading: "Get comparable quotes", paragraphs: [
        "When you request replacement quotes, make sure each one lists the equipment model and efficiency rating, what is included, the warranty and the schedule. Comparing price alone can be misleading." ] },
      { id: "second-opinion", heading: "Consider a second opinion", paragraphs: [
        "For a major repair or replacement recommendation, an additional assessment can give you more confidence. " + REFERRAL ] },
    ],
    faqs: [
      { question: "How long do air conditioners usually last?", answer: "Lifespan varies with equipment quality, usage, climate and maintenance. Ask a technician how the age and condition of your unit affect the decision." },
      { question: "Will a new AC lower my bills?", answer: "A more efficient system may reduce energy use, but results depend on your home and habits. Be skeptical of guaranteed savings." },
    ],
    related: ["ac-repair", "heat-pump-installation", "hvac-financing"],
  },
  {
    slug: "heat-pump-repair", name: "Heat Pump Repair", issue: "Emergency Heating Repair", keywordIds: ["HV-015"],
    title: "Heat Pump Not Heating? Causes and Repair Help",
    metaDescription: "Heat pump not heating your home? Learn common causes, safe checks, what defrost mode is, and when to call a professional for repair.",
    h1: "Heat Pump Not Heating: Causes and When to Call for Repair",
    intro: "A heat pump that blows cool air or struggles to heat in cold weather can have a simple or a serious cause. Here are the usual suspects and what you can safely check.",
    sections: [
      { id: "safe-checks", heading: "Safe checks first", paragraphs: [
        "Confirm the thermostat is set to Heat with a target above the room temperature, check the air filter, make sure vents are open and look for snow, ice or debris blocking the outdoor unit. If the unit is iced over, turn it off rather than chipping at the ice." ] },
      { id: "defrost", heading: "Defrost mode can be normal", paragraphs: [
        "In cold, damp weather heat pumps periodically run a defrost cycle, which may briefly blow cooler air and produce steam from the outdoor unit. That can be normal. Long or frequent defrost cycles, or heavy ice buildup, are worth having checked." ] },
      { id: "causes", heading: "Common causes of poor heating", paragraphs: [
        "Possible issues include low refrigerant from a leak, a failing reversing valve, dirty coils, a bad sensor or control, a failed capacitor or fan motor, and airflow problems. Many of these need a trained technician." ] },
      { id: "emergency-heat", heading: "Emergency or auxiliary heat", paragraphs: [
        "Some systems have backup electric heat. If it runs constantly, your bill may rise. If your thermostat shows emergency heat and you're unsure why, have it checked." ] },
    ],
    faqs: [
      { question: "Why is my heat pump blowing cold air?", answer: "It may be in defrost mode, set incorrectly, low on refrigerant or have a component problem. If it continues, call a professional." },
      { question: "Should I prepare my heat pump before winter?", answer: "Replace filters, keep the outdoor unit clear of debris and test heating early in the season. A professional tune-up can also help." },
    ],
    related: ["heat-pump-installation", "furnace-repair", "ac-repair"],
  },
  {
    slug: "furnace-repair", name: "Furnace Repair", issue: "Furnace Not Heating", keywordIds: ["HV-016", "HV-017"],
    title: "Furnace Blowing Cold Air? Causes and Repair Help",
    metaDescription: "Furnace blowing cold air or not igniting? Common causes, safe checks, igniter problems and warning signs that need a professional right away.",
    h1: "Furnace Blowing Cold Air or Not Igniting: Repair Help",
    intro: "When a furnace runs but blows cold air, or won't light at all, the cause is often one of a few common problems. Some are simple, and some involve gas and combustion, which only professionals should handle.",
    sections: [
      { id: "cold-air", heading: "Why a furnace blows cold air", paragraphs: [
        "Common causes include a thermostat fan setting on On instead of Auto, a dirty filter that triggers overheating shutdowns, a failed igniter or flame sensor, a gas supply or control problem, or a blower that runs before burners light." ] },
      { id: "igniter", heading: "Furnace igniter replacement", paragraphs: [
        "Modern furnaces use hot-surface igniters that wear out over time. A failing igniter can cause the furnace to click, glow weakly or never light the burners. Replacement is a common repair, but it involves gas appliance components and should be done by a qualified technician." ] },
      { id: "safety", heading: "Safety warning signs", paragraphs: [
        "If you smell gas, hear hissing near gas lines, see soot or scorching, or a carbon monoxide alarm sounds, leave the building and contact your gas utility or emergency services from a safe place. Never bypass safety controls." ] },
      { id: "checks", heading: "Safe checks before calling", paragraphs: [], bullets: [
        "Thermostat on Heat, fan on Auto, correct temperature",
        "Furnace power switch on and breaker not tripped",
        "Clean or replace the air filter",
        "Registers open and unblocked" ] },
    ],
    faqs: [
      { question: "Why does my furnace turn on and off quickly?", answer: "Short cycling can come from a dirty filter, an overheating limit switch, a flame sensor problem or an oversized unit. A technician can diagnose it." },
      { question: "Is it safe to relight a pilot light myself?", answer: "Only follow your manufacturer's instructions if you are confident doing so. If anything seems wrong or you smell gas, call a professional." },
    ],
    related: ["heat-pump-repair", "heat-pump-installation", "indoor-air-quality"],
  },
  {
    slug: "emergency-ac-repair", name: "Emergency AC Repair", issue: "Emergency AC Repair", keywordIds: ["HV-018"],
    title: "After Hours and Emergency AC Repair: What to Know",
    metaDescription: "Need after-hours or emergency AC repair? How to prepare, what to ask about availability and fees, and staying safe while you wait for service.",
    h1: "After-Hours and Emergency AC Repair",
    intro: "A failed air conditioner during a heat wave can be urgent. This page explains what to ask when you need after-hours help and how to stay safe in the meantime.",
    sections: [
      { id: "availability", heading: "Ask about real availability", paragraphs: [
        "Not every contractor offers evening, weekend or overnight service. Ask whether they can come outside normal hours, how soon, and whether an emergency or after-hours fee applies. " + REFERRAL ] },
      { id: "prepare", heading: "Prepare before you call", paragraphs: [
        "Have your address, the symptoms, the age and brand of the system and what you've already checked ready. Photos of the unit and any error codes can help." ] },
      { id: "staying-cool", heading: "Staying safe in the heat", paragraphs: [
        "Indoor heat can become dangerous for children, older adults, pets and people with medical conditions. Drink water, use fans, close blinds, and move to a cooler place if needed. If someone shows signs of heat illness, seek medical help." ] },
      { id: "fees", heading: "Understand fees before work starts", paragraphs: [
        "Ask for the diagnostic fee, hourly or flat rates and any after-hours surcharge before agreeing to work, and get a written estimate for repairs." ] },
    ],
    faqs: [
      { question: "Can you guarantee same-day service?", answer: "No. Availability depends on independent contractors in your area. We can help you look for options, but we can't promise timing." },
      { question: "Is after-hours service more expensive?", answer: "Often there is a surcharge, but policies vary. Ask the contractor before work begins." },
    ],
    related: ["ac-repair", "ac-replacement", "commercial-hvac-repair"],
  },
  {
    slug: "hvac-financing", name: "HVAC Financing and Payment Options", issue: "Other", keywordIds: ["HV-019", "HV-020"],
    title: "HVAC Financing and Payment Options Explained",
    metaDescription: "Learn about common ways to pay for HVAC repair or replacement, what to check in financing terms, and how to look into rebates and incentives.",
    h1: "HVAC Financing and Payment Options",
    intro: "A new system or major repair can be a large expense. This page explains common payment options and what to check before agreeing to financing. We don't offer loans or financing ourselves.",
    sections: [
      { id: "options", heading: "Common ways to pay", paragraphs: [
        "Options people use include paying from savings, contractor-offered payment plans, personal loans, home equity products, credit cards and utility or government programs. Availability depends on the lender and your situation." ] },
      { id: "terms", heading: "What to check in the terms", paragraphs: [], bullets: [
        "Interest rate, fees and whether the rate is promotional",
        "Total cost over the full term, not just the monthly payment",
        "Penalties for late or early payment",
        "Whether the lender checks credit and how that affects you",
        "Who the lender is, and whether the contractor receives a fee",
        "Whether the offer is in writing" ] },
      { id: "credit", heading: "If you have limited or poor credit", paragraphs: [
        "Some lenders work with a wider range of credit profiles, but terms may be less favorable. Compare more than one offer, read the full agreement and be cautious of pressure to sign immediately. Approval can't be promised by us or by a contractor listing." ] },
      { id: "rebates", heading: "Rebates and incentives", paragraphs: [
        "Utilities and government agencies sometimes offer rebates or tax credits for efficient equipment. Programs and eligibility change, so check current information with your utility, state energy office and IRS guidance before relying on one." ] },
    ],
    faqs: [
      { question: "Do you offer HVAC financing?", answer: "No. We're a referral service. Any financing is offered by independent contractors or lenders under their own terms." },
      { question: "Can I get approved with bad credit?", answer: "That depends on the lender. We can't promise approval, so compare offers and read terms carefully." },
    ],
    related: ["ac-replacement", "heat-pump-installation", "mini-split-installation"],
  },
  {
    slug: "commercial-hvac-repair", name: "Commercial HVAC Repair", issue: "Commercial HVAC Problem", keywordIds: ["HV-025", "HV-026"],
    title: "Commercial HVAC Repair: Rooftop Units, Restaurants",
    metaDescription: "Commercial HVAC problems can disrupt business. Learn about rooftop unit repair, restaurant and food-service HVAC needs and how to find help.",
    h1: "Commercial HVAC Repair: Rooftop Units and Restaurants",
    intro: "A heating or cooling failure at a business affects staff, customers and sometimes inventory or equipment. This page covers common commercial needs and what to ask a commercial HVAC contractor.",
    sections: [
      { id: "rooftop-units", heading: "Rooftop unit (RTU) repair", paragraphs: [
        "Many commercial buildings use packaged rooftop units. Common issues include failed compressors or fans, belts and bearings, refrigerant leaks, clogged coils, control or thermostat faults and economizer problems. Rooftop work involves heights, electrical and refrigerant systems and should be done by qualified technicians." ] },
      { id: "restaurants", heading: "Restaurant and food-service HVAC", paragraphs: [
        "Kitchens create heat, grease and humidity, and dining rooms need comfort during peak hours. Problems can include inadequate cooling in the kitchen, makeup air issues and hood or ventilation concerns. Because some of this work overlaps with fire and health codes, ask whether a contractor has experience with food-service properties." ] },
      { id: "contract", heading: "Maintenance agreements", paragraphs: [
        "Many businesses use preventive maintenance agreements to schedule regular service. Ask what visits include, response commitments, how emergencies are handled and how parts and labor are billed." ] },
      { id: "ask", heading: "Questions to ask a commercial contractor", paragraphs: [REFERRAL], bullets: [
        "Do you service my type and size of equipment?",
        "Can you show experience with similar businesses?",
        "What are your licensing, insurance and safety practices?",
        "How do you handle after-hours calls?" ] },
    ],
    faqs: [
      { question: "Do you service commercial properties?", answer: "You can submit a commercial request and we'll help you look for contractors who handle commercial work, subject to availability." },
      { question: "Can you guarantee emergency response for my business?", answer: "No. Response depends on independent contractors, and we can't promise timing." },
    ],
    related: ["emergency-ac-repair", "ac-repair", "duct-services"],
  },
  {
    slug: "duct-services", name: "Duct Sealing and Leakage Testing", issue: "Other", keywordIds: ["HV-023"],
    title: "Duct Sealing and Duct Leakage Testing Explained",
    metaDescription: "Leaky ducts waste energy and hurt comfort. Learn what duct sealing and leakage testing involve and what to ask a contractor before you hire.",
    h1: "Duct Sealing and Duct Leakage Testing",
    intro: "Ducts carry conditioned air through your home. If they leak, some of that air never reaches the rooms you want to heat or cool. Sealing and testing can help find and fix those losses.",
    sections: [
      { id: "signs", heading: "Signs of leaky or poorly performing ducts", paragraphs: [], bullets: [
        "Rooms that are always hotter or colder than others",
        "Dusty air or visible gaps and disconnected ducts",
        "High energy bills with no other explanation",
        "Ducts in an attic, crawlspace or basement that feel hot or cold" ] },
      { id: "testing", heading: "Duct leakage testing", paragraphs: [
        "A technician can pressurize the duct system with specialized equipment and measure how much air escapes. Results show how leaky the system is and help prioritize repairs." ] },
      { id: "sealing", heading: "Duct sealing", paragraphs: [
        "Sealing typically uses mastic or approved tape at joints and connections, and sometimes added insulation. Some areas have standards or incentives for duct sealing, so ask your contractor and check locally." ] },
      { id: "ask", heading: "What to ask", paragraphs: [
        "Ask whether testing is done before and after sealing, what materials are used, and what results you can expect. " + REFERRAL ] },
    ],
    faqs: [{ question: "How much energy can duct sealing save?", answer: "It depends on how leaky your system is and where the ducts run. Be cautious of guarantees. Testing before and after gives real numbers." }],
    related: ["indoor-air-quality", "ac-replacement", "heat-pump-installation"],
  },
  {
    slug: "indoor-air-quality", name: "Whole-House Humidifier and Indoor Air Quality", issue: "Other", keywordIds: ["HV-024"],
    title: "Whole-House Humidifier Installation and Air Quality",
    metaDescription: "Considering a whole-house humidifier? Learn how it works, what installation involves and other indoor air quality upgrades to discuss with a pro.",
    h1: "Whole-House Humidifier Installation and Indoor Air Quality",
    intro: "Dry winter air and stuffy indoor spaces can affect comfort. A whole-house humidifier and other indoor air quality products connect to your HVAC system to help manage humidity and air quality.",
    sections: [
      { id: "humidifier", heading: "How a whole-house humidifier works", paragraphs: [
        "A whole-house humidifier attaches to your ductwork or furnace and adds moisture to the air circulating through your home. Types include bypass, fan-powered and steam units, each with different capacity, cost and maintenance needs." ] },
      { id: "installation", heading: "What installation involves", paragraphs: [
        "Installers connect the unit to the duct system, a water supply and a drain, and add a humidistat or control. Pads, water panels or other parts need regular maintenance." ] },
      { id: "balance", heading: "Humidity balance matters", paragraphs: [
        "Too little humidity can feel dry, while too much can encourage condensation and mold. A professional can recommend a target for your home and climate." ] },
      { id: "other", heading: "Other indoor air quality options", paragraphs: [], bullets: [
        "Higher-efficiency filtration compatible with your system",
        "Dehumidification for humid climates",
        "Ventilation upgrades",
        "UV lights and air purifiers (ask for evidence about what they do and don't do)" ] },
    ],
    faqs: [{ question: "Can air quality products cure allergies or illness?", answer: "No product can promise that. They may help with specific issues, so ask a contractor for realistic expectations." }],
    related: ["duct-services", "furnace-repair", "heat-pump-installation"],
  },
  {
    slug: "mobile-home-hvac", name: "Mobile and Manufactured Home HVAC", issue: "Other", keywordIds: ["HV-021"],
    title: "Mobile and Manufactured Home AC and Heating Repair",
    metaDescription: "Mobile and manufactured homes have specific HVAC equipment and duct layouts. Learn common problems and what to ask a contractor before repair.",
    h1: "Mobile and Manufactured Home HVAC Repair",
    intro: "Mobile and manufactured homes often use equipment and ducting designed specifically for them. Repairs and replacements work best when the contractor has experience with these homes.",
    sections: [
      { id: "equipment", heading: "Equipment is often different", paragraphs: [
        "Units may be designed for the smaller sizes, lower clearance and duct layouts used in manufactured homes, and some have specific installation or labeling requirements. Replacement units must be compatible with the home and local rules." ] },
      { id: "problems", heading: "Common problems", paragraphs: [], bullets: [
        "Leaky or damaged ducts, especially under the home",
        "Poor insulation causing uneven comfort",
        "Aging furnaces and air conditioners",
        "Moisture and condensation issues" ] },
      { id: "ask", heading: "What to ask a contractor", paragraphs: [
        "Ask whether they have experience with mobile and manufactured homes, whether the replacement equipment is approved for your home type, and what permits apply. " + REFERRAL ] },
    ],
    faqs: [{ question: "Can I use any AC in a mobile home?", answer: "Not necessarily. Equipment should be compatible with the home. A contractor with manufactured-home experience can confirm what's suitable." }],
    related: ["ac-repair", "furnace-repair", "duct-services"],
  },
];

export const getServicePage = (slug: string | undefined) => servicePages.find((s) => s.slug === slug);
export const servicePath = (slug: string) => `/services/${slug}`;
