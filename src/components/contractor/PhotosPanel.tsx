import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Panel } from "@/components/admin/widgets";
import { Button } from "@/components/ui/Button";
import { ACCEPTED_TYPES, IMAGE_RULES, imageUrl, removeListingImage, uploadListingImage, type ImageKind } from "@/lib/listing-images";
import type { Listing } from "@/lib/types";

function Uploader({ listing, kind, reload }: { listing: Listing; kind: ImageKind; reload: () => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const current = kind === "avatar" ? listing.avatar_path : listing.cover_image_path;
  const url = imageUrl(current);
  const rule = IMAGE_RULES[kind];

  async function choose(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await uploadListingImage(listing.id, kind, file, current);
      await reload();
      setMsg({ ok: true, text: "Saved. It shows on your listing now." });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not upload the photo." });
    }
    setBusy(false);
  }

  async function remove() {
    if (busy || !window.confirm(`Remove your ${rule.label.toLowerCase()}?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      await removeListingImage(listing.id, kind, current);
      await reload();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not remove the photo." });
    }
    setBusy(false);
  }

  const frame = kind === "avatar" ? "size-24 rounded-2xl" : "aspect-[16/5] w-full rounded-2xl";
  return (
    <div>
      <h3 className="text-sm font-semibold text-navy">{rule.label}</h3>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <div className={`${frame} flex shrink-0 items-center justify-center overflow-hidden border border-slate-200 bg-slate-100 ${kind === "cover" ? "max-w-xl" : ""}`}>
          {url ? <img src={url} alt="" className="size-full object-cover" /> : <ImagePlus className="size-7 text-slate-400" aria-hidden />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={input} type="file" accept={ACCEPTED_TYPES.join(",")} onChange={choose} className="sr-only" aria-label={`Choose a ${rule.label.toLowerCase()}`} />
          <Button variant="secondary" disabled={busy} onClick={() => input.current?.click()} className="!rounded-full !px-4 !py-1.5 text-sm">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />} {url ? "Replace" : "Upload"}
          </Button>
          {url && (
            <Button variant="ghost" disabled={busy} onClick={remove} className="!rounded-full !px-4 !py-1.5 text-sm text-red-700 hover:!bg-red-50"><Trash2 className="size-4" aria-hidden /> Remove</Button>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {kind === "avatar" ? "Your logo or a photo of you. It is shown as a square." : "A wide photo of your team, truck or work. It is cropped to a wide banner."} JPEG, PNG or WebP.
      </p>
      <p role="status" className={`mt-1 text-sm font-medium ${msg?.ok ? "text-green-700" : "text-red-700"}`}>{msg?.text}</p>
    </div>
  );
}

/** Profile picture and cover photo. Saved as soon as a photo is chosen (separate from the Save changes button). */
export function PhotosPanel({ listing, reload }: { listing: Listing; reload: () => Promise<void> }) {
  return (
    <Panel title="Photos">
      <div className="space-y-6">
        <Uploader listing={listing} kind="cover" reload={reload} />
        <Uploader listing={listing} kind="avatar" reload={reload} />
      </div>
    </Panel>
  );
}
