import { Link } from "react-router-dom";
import { LegalLayout, type LegalSection } from "@/components/LegalLayout";
import { siteConfig } from "@/config/site";
import { LEGAL_UPDATED } from "@/pages/PrivacyPage";

export default function TermsPage() {
  const { brand, contact, governingState } = siteConfig;
  const who = siteConfig.legalEntity;

  const sections: LegalSection[] = [
    {
      id: "service", heading: "What this website does",
      content: (
        <>
          <p>{brand.name} is a lead generation and referral service and a directory of HVAC businesses. You tell us about your heating or cooling problem and location, and we may share your request with independent contractors so they can respond. We do not perform HVAC repairs, installations or other work ourselves.</p>
          <p>Contractors are independent businesses. They are not our employees, agents or partners, and we do not supervise their work.</p>
        </>
      ),
    },
    {
      id: "no-guarantee", heading: "No guarantees",
      content: (
        <>
          <p>We do not guarantee that:</p>
          <ul>
            <li>any contractor will be available, will respond, or will respond within a particular time;</li>
            <li>your request will result in a match, a booking or a completed job;</li>
            <li>any price, estimate, warranty or quality of work; or</li>
            <li>that any contractor is licensed, insured, bonded, certified, experienced or suitable for your needs.</li>
          </ul>
          <p>Submitting a request does not create a contract between you and any contractor, and marking a request as urgent does not confirm that help is available.</p>
        </>
      ),
    },
    {
      id: "contractor-plans", heading: "Contractor accounts and paid plans",
      content: (
        <>
          <p>Contractors may create an account to manage a directory listing. We review each request to manage a listing and may decline or remove access, and you must have authority to act for the business you claim. You are responsible for keeping your login secure and for the accuracy of what you publish, including your contact details, services and any Google reviews link you add, which must point to your own business profile.</p>
          <p>Featured and Premium plans are paid advertising for visibility in the directory and are labeled as such. Plans are billed monthly through Stripe, renew automatically until cancelled, and can be cancelled at any time in the billing portal; cancellation takes effect at the end of the paid period. Fees are not refundable except where the law requires. We do not guarantee any number of customer requests, calls, jobs, rankings or revenue.</p>
          <p>Premium contractors may be assigned customer requests at our discretion. Customer details are provided only so you can respond to that request: do not sell them, add them to unrelated marketing lists or share them, and follow the laws that apply to calls, texts and emails. We may suspend or end a plan, or stop assigning requests, if you break these terms or receive repeated customer complaints.</p>
        </>
      ),
    },
    {
      id: "directory", heading: "Directory listings and contractor information",
      content: (
        <>
          <p>Directory listings are provided by the businesses or compiled from information on their own websites. We do not verify licensing, insurance, certifications, pricing, availability or reputation, and a listing is not an endorsement or recommendation.</p>
          <p>Before hiring anyone, confirm their credentials yourself with your state or local licensing authority, ask for proof of insurance, get a written estimate, and read the contract. Any agreement for repair work is solely between you and the contractor.</p>
        </>
      ),
    },
    {
      id: "emergencies", heading: "Emergencies and safety",
      content: <p><strong>This website is not an emergency service.</strong> If you smell gas, suspect carbon monoxide exposure, see smoke or fire, or face any immediate danger, leave the area if it is safe to do so and contact your local emergency services or gas utility from a safe place. Do not wait for a response to a request submitted here. Information on this site is general and is not a substitute for professional diagnosis.</p>,
    },
    {
      id: "your-info", heading: "Your requests and information",
      content: (
        <>
          <p>You agree to provide accurate and complete information, to submit requests only for properties you are authorized to request service for, and to give consent for us to share your request with independent contractors as described in our <Link to="/privacy-policy">Privacy Policy</Link>. Marketing messages are optional and are not required to submit a request.</p>
          <p>Contractors may contact you by phone, text or email using the details you provide, in line with the contact method you choose. Message and data rates may apply.</p>
        </>
      ),
    },
    {
      id: "businesses", heading: "Business submissions",
      content: <p>If you submit a business for the directory, you confirm that you are authorized to do so, that the information is accurate, and that you permit us to publish it. We may edit, decline, hide or remove any listing at our discretion. Business owners can ask us to correct or remove a listing at any time through our <Link to="/contact">contact page</Link>. Submitting a business does not guarantee placement, calls or leads.</p>,
    },
    {
      id: "use", heading: "Acceptable use",
      content: (
        <>
          <p>You agree not to:</p>
          <ul>
            <li>submit false, misleading or fraudulent requests, listings or messages;</li>
            <li>use the site to harass others or to send spam;</li>
            <li>scrape, copy at scale, or resell directory or request data without our written permission;</li>
            <li>attempt to gain unauthorized access to, disrupt or overload the site or its systems; or</li>
            <li>use the site for any unlawful purpose.</li>
          </ul>
        </>
      ),
    },
    {
      id: "ip", heading: "Intellectual property",
      content: <p>The site&apos;s design, text, logos and other content are owned by us or our licensors and are protected by applicable laws. You may view and use the site for its intended purpose, but you may not copy or reuse our content beyond what the law allows without permission. Business names and logos belong to their respective owners.</p>,
    },
    {
      id: "disclaimer", heading: "Disclaimers",
      content: <p>The website and all content are provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind, express or implied, including accuracy, reliability, availability, fitness for a particular purpose and non-infringement, to the fullest extent permitted by law. We do not warrant that the site will be uninterrupted or error-free.</p>,
    },
    {
      id: "liability", heading: "Limitation of liability",
      content: (
        <>
          <p>To the fullest extent permitted by law, {who} and its owners, employees and affiliates are not liable for any indirect, incidental, special, consequential or punitive damages, or for any loss of profits, data or goodwill, arising from your use of the site or from any dealings with a contractor or other business found through it.</p>
          <p>Our total liability for any claim relating to the site is limited to the greater of one hundred U.S. dollars ($100) or the amount you paid us for using the site (which is generally nothing). Some jurisdictions do not allow certain limitations, so parts of this section may not apply to you.</p>
        </>
      ),
    },
    {
      id: "indemnity", heading: "Indemnification",
      content: <p>You agree to defend and hold harmless {who} from claims, losses and expenses (including reasonable legal fees) arising from your misuse of the site, your violation of these terms, or information you submit that you were not entitled to provide.</p>,
    },
    {
      id: "changes", heading: "Changes and termination",
      content: <p>We may change the site or these terms at any time. The &ldquo;last updated&rdquo; date above shows when they last changed, and continued use means you accept the updated terms. We may suspend or end access to the site or to a listing at any time.</p>,
    },
    ...(governingState
      ? [{
          id: "law", heading: "Governing law",
          content: <p>These terms are governed by the laws of the State of {governingState}, without regard to conflict-of-law rules. Any dispute will be brought in the state or federal courts located in that state, and you consent to their jurisdiction.</p>,
        }]
      : []),
    {
      id: "contact", heading: "Contact us",
      content: (
        <p>
          Questions about these terms? {contact.email ? <>Email <a href={`mailto:${contact.email}`}>{contact.email}</a> or use</> : <>Use</>} our <Link to="/contact">contact page</Link>.
          {contact.address ? <> Mailing address: {contact.address}.</> : null}
        </p>
      ),
    },
  ];

  return (
    <LegalLayout
      title="Terms of Use"
      seoTitle={`Terms of Use | ${brand.name}`}
      description={`The terms for using ${brand.name}, a referral service and directory that connects people with independent HVAC contractors. No guarantees of availability, pricing or quality.`}
      path="/terms-of-use"
      updated={LEGAL_UPDATED}
      sections={sections}
      intro={
        <>
          <p>These Terms of Use govern your use of this website, operated by {who} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By using the site, submitting a request or submitting a business listing, you agree to these terms and to our <Link to="/privacy-policy">Privacy Policy</Link>. If you do not agree, please do not use the site.</p>
          <p><strong>In short:</strong> we are a referral service, not a contractor. We help you look for independent contractors, but we cannot guarantee availability, pricing, response times or quality, and you are responsible for checking a contractor&apos;s credentials before you hire.</p>
        </>
      }
    />
  );
}
