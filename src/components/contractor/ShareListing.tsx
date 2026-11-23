import { useEffect, useState } from "react";
import { Check, Copy, Facebook, Linkedin, Mail, MessageCircle, Share2, X } from "lucide-react";

/** The address of a business's public listing, on the site the contractor is using now. */
export const listingUrl = (slug: string) => `${window.location.origin}/directory/${slug}`;

const LINKS = (url: string, text: string) => [
  { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, color: "bg-[#1877f2]", icon: <Facebook className="size-4" aria-hidden /> },
  { label: "X", href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, color: "bg-black", icon: <span className="text-sm font-black" aria-hidden>X</span> },
  { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, color: "bg-[#0a66c2]", icon: <Linkedin className="size-4" aria-hidden /> },
  { label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, color: "bg-[#25d366]", icon: <MessageCircle className="size-4" aria-hidden /> },
  { label: "Email", href: `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(`${text}\n\n${url}`)}`, color: "bg-slate-700", icon: <Mail className="size-4" aria-hidden /> },
];

/** A Share button for a business's public listing: a window with the link, a copy button and one-tap sharing to the main social sites. */
export function ShareListing({ slug, name, className = "" }: { slug: string; name: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = listingUrl(slug);
  const text = `${name} on HVACHelp: heating and cooling help you can trust.`;
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* the link is on screen to copy by hand */ }
  }
  async function nativeShare() {
    try { await navigator.share({ title: name, text, url }); } catch { /* cancelled */ }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className || "inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-navy shadow-sm hover:bg-slate-50"}>
        <Share2 className="size-4" aria-hidden /> Share my listing
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-slate-900/50 p-4" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Share your listing" onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-navy">Share your listing</h2>
                <p className="mt-0.5 text-sm text-slate-600">Customers who open this link land on your page, where they can call you or send a request.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="size-5" aria-hidden /></button>
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 p-1.5 pl-3">
              <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Link to your listing" className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none" />
              <button type="button" onClick={() => void copy()} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90">
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {LINKS(url, text).map((l) => (
                <li key={l.label}>
                  <a href={l.href} target={l.href.startsWith("mailto:") ? undefined : "_blank"} rel="noopener noreferrer" className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white hover:opacity-90 ${l.color}`}>
                    {l.icon} {l.label}
                  </a>
                </li>
              ))}
              {canNativeShare && (
                <li><button type="button" onClick={() => void nativeShare()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-navy hover:bg-slate-50"><Share2 className="size-4" aria-hidden /> More…</button></li>
              )}
            </ul>
            <p className="mt-3 text-xs text-slate-500">Instagram and TikTok do not take a link from a share button: copy the link and paste it into your bio or post.</p>
          </div>
        </div>
      )}
    </>
  );
}
