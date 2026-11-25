// Evidence an admin sees when someone claims a listing that was created from government vendor records.
// The vendor's own email/phone/website come from the official file (gov_vendors); the claimant's email comes from their signed-in session.

export interface VendorOnFile {
  email: string | null;
  phone: string | null;
  website: string | null;
}

const FREE_MAIL = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "aol.com", "icloud.com", "live.com", "msn.com", "proton.me", "protonmail.com"]);
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").slice(-10);
const domainOf = (email: string) => email.split("@")[1]?.toLowerCase() ?? "";
const hostOf = (url: string | null) => {
  try {
    return new URL(/^https?:\/\//i.test(url ?? "") ? (url as string) : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

/** What links the claimant to the business on file. Strong = the exact email the government file lists; weaker = same company domain or phone. */
export function claimEvidence(claimEmail: string | null, claimPhone: string | null, vendor: VendorOnFile | null) {
  const email = (claimEmail ?? "").trim().toLowerCase();
  const out = { exactEmail: false, domain: false, phone: false };
  if (!vendor || !email) return out;
  const vEmail = (vendor.email ?? "").trim().toLowerCase();
  out.exactEmail = Boolean(vEmail) && vEmail === email;
  const d = domainOf(email);
  const companyDomains = [domainOf(vEmail), hostOf(vendor.website)].filter((x) => x && !FREE_MAIL.has(x));
  out.domain = Boolean(d) && !FREE_MAIL.has(d) && companyDomains.some((c) => c === d || d.endsWith(`.${c}`));
  out.phone = Boolean(digits(claimPhone)) && digits(claimPhone) === digits(vendor.phone);
  return out;
}
