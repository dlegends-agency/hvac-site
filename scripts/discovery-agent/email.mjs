// Finds a business's public contact email address on its OWN website pages. Pure functions, so they can be tested offline.
// It only reads what the business published for customers to use (mailto: links, schema.org data, the contact details on the page).
// An address found here is a lead for an admin to check; it is never used to send anything automatically.

import { hostOf } from "./util.mjs";

const EMAIL_RE = /[a-z0-9][a-z0-9._%+-]{0,63}@(?:[a-z0-9-]+\.)+[a-z]{2,24}/gi;
const BAD_TLD = /\.(png|jpe?g|gif|webp|svg|ico|css|js|woff2?|ttf|pdf|mp4)$/i;
const PLACEHOLDER_DOMAINS = [
  "example.com", "example.org", "domain.com", "yourdomain.com", "yourcompany.com", "email.com", "mysite.com", "website.com", "test.com", "company.com",
  "sentry.io", "sentry-next.wixpress.com", "wixpress.com", "godaddy.com", "squarespace.com", "wix.com", "schema.org", "w3.org", "cloudflare.com",
];
const NO_REPLY = /^(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|abuse|webmaster|privacy|unsubscribe|bounce|sentry)\b/i;
// Addresses a business publishes for customers, best first.
const ROLE_RANK = ["info", "contact", "service", "office", "hello", "sales", "appointments", "schedule", "support", "admin", "hvac", "ac"];

/** Decodes Cloudflare's "email protection" (data-cfemail), which hides addresses from simple scrapers. */
export function decodeCfEmail(hex) {
  if (!/^[0-9a-f]{6,}$/i.test(hex) || hex.length % 2) return null;
  const key = parseInt(hex.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out;
}

/** "info [at] acme [dot] com" and "info(at)acme.com" become "info@acme.com". */
export function deobfuscate(text) {
  return String(text)
    .replace(/\s*[[({]\s*at\s*[\])}]\s*/gi, "@")
    .replace(/\s*[[({]\s*dot\s*[\])}]\s*/gi, ".");
}

/** A usable, lower-cased address, or null for placeholders, image file names, no-reply boxes and anything malformed. */
export function cleanEmail(raw) {
  if (!raw) return null;
  let e = String(raw).trim().replace(/^mailto:/i, "").split("?")[0].trim().replace(/[.,;:)>\]]+$/, "").toLowerCase();
  try {
    e = decodeURIComponent(e);
  } catch {
    // keep as is
  }
  if (e.length > 200 || !/^[a-z0-9][a-z0-9._%+-]*@(?:[a-z0-9-]+\.)+[a-z]{2,24}$/.test(e)) return null;
  const [local, domain] = e.split("@");
  if (BAD_TLD.test(domain) || BAD_TLD.test(e)) return null;
  if (PLACEHOLDER_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return null;
  if (NO_REPLY.test(local) || /^(u003e|x{3,}|name|yourname|your-?email|email|user|username)$/.test(local)) return null;
  return e;
}

/** Orders addresses: same domain as the website first, then a business role box (info@, office@) before a personal one, then as found. */
export function rankEmails(emails, siteHost) {
  const host = (siteHost ?? "").replace(/^www\./, "");
  const score = (e) => {
    const [local, domain] = e.split("@");
    let s = 0;
    if (host && (domain === host || domain.endsWith(`.${host}`) || host.endsWith(`.${domain}`))) s += 100;
    const role = ROLE_RANK.indexOf(local.replace(/[0-9._-]+$/, ""));
    if (role >= 0) s += 50 - role;
    return s;
  };
  return [...new Set(emails)].map((e, i) => ({ e, i, s: score(e) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.e);
}

/**
 * Collects the addresses a parsed page shows. `$` is a cheerio handle (the page with scripts still present),
 * `ldEmail` the email from schema.org data, `text` the visible text.
 */
export function collectEmails($, ldEmail, text) {
  const found = [];
  const add = (raw) => {
    const e = cleanEmail(raw);
    if (e) found.push(e);
  };
  add(ldEmail);
  $("a[href^='mailto:' i]").each((_, el) => String($(el).attr("href")).replace(/^mailto:/i, "").split(/[,;]/).forEach(add));
  $("[data-cfemail]").each((_, el) => add(decodeCfEmail($(el).attr("data-cfemail") ?? "")));
  $("a[href*='/cdn-cgi/l/email-protection#']").each((_, el) => add(decodeCfEmail(String($(el).attr("href")).split("#")[1] ?? "")));
  for (const m of deobfuscate(text).matchAll(EMAIL_RE)) add(m[0]);
  return found;
}

const FREE_MAIL = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "aol.com", "icloud.com", "live.com", "msn.com", "att.net", "sbcglobal.net", "comcast.net", "me.com", "proton.me", "protonmail.com"];

/**
 * The single best address for a business whose website is `website`, or null. Only an address on the business's own domain, or a
 * free mailbox such as Gmail (common for small contractors), counts, so a web designer's or a partner's address on the page is ignored.
 */
export function bestEmail(emails, website) {
  const host = (hostOf(website ?? "") ?? "").replace(/^www\./, "");
  const mine = emails.filter((e) => {
    const domain = e.split("@")[1];
    return FREE_MAIL.includes(domain) || (host && (domain === host || domain.endsWith(`.${host}`) || host.endsWith(`.${domain}`)));
  });
  return rankEmails(mine, host)[0] ?? null;
}
