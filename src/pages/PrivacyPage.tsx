import { Link } from "react-router-dom";
import { LegalLayout, type LegalSection } from "@/components/LegalLayout";
import { siteConfig } from "@/config/site";

export const LEGAL_UPDATED = "October 28, 2026";

export default function PrivacyPage() {
  const { brand, contact } = siteConfig;
  const who = siteConfig.legalEntity;
  const reach = contact.email ? (
    <>email us at <a href={`mailto:${contact.email}`}>{contact.email}</a> or use our <Link to="/contact">contact form</Link></>
  ) : (
    <>use our <Link to="/contact">contact form</Link></>
  );

  const sections: LegalSection[] = [
    {
      id: "collect", heading: "Information we collect",
      content: (
        <>
          <p><strong>Service requests.</strong> When you submit the request form we collect the HVAC issue and how urgent it is, your service address (country, state or province, city, ZIP or postal code, street address and unit), your name, phone number and email address, your preferred contact method and time, an optional description of the problem, the property type and your relationship to it (for example homeowner or tenant), and whether you agreed to the referral acknowledgment and to optional marketing messages.</p>
          <p><strong>Contact messages.</strong> If you use the contact form we collect your name, email address, the topic and your message.</p>
          <p><strong>Business listings.</strong> If you submit a business for the directory we collect the business details you provide (name, address, phone, website, services, description) and, privately, the submitter&apos;s name and email address. Published listing details are public.</p>
          <p><strong>Website usage.</strong> We record which pages are viewed, the website the visitor came from (hostname only), any <code>utm_source</code> value, a general device type (mobile, tablet or desktop) and a random identifier created in your browser so we can count unique visitors. We do not store your IP address or browser user agent in this usage data, and we do not count visitors whose browser sends a Do Not Track signal.</p>
          <p><strong>Technical data.</strong> Our hosting and database providers process technical data such as IP addresses and request logs as part of delivering and securing the website.</p>
        </>
      ),
    },
    {
      id: "use", heading: "How we use information",
      content: (
        <>
          <ul>
            <li>to review your service request and try to connect you with suitable independent contractors;</li>
            <li>to respond to messages and requests sent to us;</li>
            <li>to review, publish and maintain business listings in the directory;</li>
            <li>to understand how the site is used and to improve it;</li>
            <li>to protect the site and our users, prevent spam and abuse, and comply with legal obligations;</li>
            <li>to send you offers or updates about HVAC services only if you opted in, and you can opt out at any time.</li>
          </ul>
        </>
      ),
    },
    {
      id: "share", heading: "Who we share information with",
      content: (
        <>
          <p><strong>Independent contractors.</strong> {brand.name} is a referral service. To help you, we may share the details in your service request with independent contractors that may be able to respond, so they can contact you about your request. You acknowledge this when you submit the form. Contractors are separate businesses with their own privacy practices, and once they receive your information they are responsible for how they use it.</p>
          <p><strong>Service providers.</strong> We use providers to run the site, including database and authentication hosting (Supabase) and website hosting and delivery (Cloudflare). They process information on our behalf to provide those services.</p>
          <p><strong>Legal and safety.</strong> We may disclose information when required by law or to protect rights, safety and security, and as part of a business transaction such as a merger or sale.</p>
          <p>Published business listings are visible to everyone, including search engines.</p>
        </>
      ),
    },
    {
      id: "storage", heading: "Cookies and local storage",
      content: (
        <>
          <p>We do not use advertising or third-party tracking cookies on this site. Your browser&apos;s local storage holds a random identifier used for our visitor counts. Site staff who sign in to the admin area also have a sign-in session stored in the browser. You can clear this at any time in your browser settings.</p>
          <p>Fonts and images are served from our own site.</p>
        </>
      ),
    },
    {
      id: "retention", heading: "How long we keep information",
      content: <p>We keep information for as long as needed for the purposes described in this policy or as required by law. We have not set a fixed retention period for service requests, so if you would like your information deleted, please {reach}.</p>,
    },
    {
      id: "choices", heading: "Your choices and rights",
      content: (
        <>
          <p>You can ask us to access, correct or delete the personal information we hold about you, and you can withdraw marketing consent at any time. Depending on where you live (for example California or Texas), you may have additional rights under local privacy laws. To make a request, {reach}. We may need to verify your identity first.</p>
          <p>If your request details were already shared with a contractor, you can ask us to stop further sharing, but you will need to contact the contractor directly about information they already hold.</p>
        </>
      ),
    },
    {
      id: "security", heading: "Security",
      content: <p>We use reasonable technical and organizational measures to protect information, including access controls on stored requests. No website or storage method is completely secure, so we cannot guarantee absolute security.</p>,
    },
    {
      id: "children", heading: "Children",
      content: <p>This website is for adults. It is not directed to children under 13, and we do not knowingly collect personal information from them. If you believe a child has sent us information, please contact us and we will delete it.</p>,
    },
    {
      id: "links", heading: "Links to other websites",
      content: <p>Directory listings and other pages may link to websites run by other businesses. We are not responsible for their content or privacy practices.</p>,
    },
    {
      id: "changes", heading: "Changes to this policy",
      content: <p>We may update this policy from time to time. The &ldquo;last updated&rdquo; date above shows when it last changed. Continued use of the site after an update means you accept the revised policy.</p>,
    },
    {
      id: "contact", heading: "Contact us",
      content: (
        <p>
          Questions about this policy or your information? {contact.email ? <>Email <a href={`mailto:${contact.email}`}>{contact.email}</a> or use</> : <>Use</>} our <Link to="/contact">contact page</Link>.
          {contact.address ? <> Mailing address: {contact.address}.</> : null}
        </p>
      ),
    },
  ];

  return (
    <LegalLayout
      title="Privacy Policy"
      seoTitle={`Privacy Policy | ${brand.name}`}
      description={`How ${brand.name} collects, uses and shares information from service requests, contact messages and business listings, and the choices you have.`}
      path="/privacy-policy"
      updated={LEGAL_UPDATED}
      sections={sections}
      intro={
        <>
          <p>This Privacy Policy explains how {who} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) handles information on this website. {brand.name} is a referral service that helps people looking for heating and cooling repair find independent HVAC contractors, and it also provides a directory of HVAC businesses.</p>
          <p>By using the site or submitting a form you agree to this policy. If you do not agree, please do not use the site. See also our <Link to="/terms-of-use">Terms of Use</Link>.</p>
        </>
      }
    />
  );
}
