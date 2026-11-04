// Profile picture and cover photo for a listing. Photos live in the public "listing-images" Supabase Storage bucket and are
// shrunk in the browser before upload, so a phone photo of several MB becomes a small file.
import { getSupabaseBrowser } from "@/lib/supabase";

export const IMAGE_BUCKET = "listing-images";
export type ImageKind = "avatar" | "cover";

/** What the bucket accepts and how big each kind is shown. The bucket itself also refuses anything over 2 MB. */
export const IMAGE_RULES: Record<ImageKind, { width: number; height: number; label: string }> = {
  avatar: { width: 400, height: 400, label: "Profile picture" },
  cover: { width: 1600, height: 500, label: "Cover photo" },
};

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

/** The public address of a stored photo, or null when there is no photo or Supabase is not configured. */
export function imageUrl(path: string | null | undefined): string | null {
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, "");
  if (!path || !base || path.includes("..")) return null;
  return `${base}/storage/v1/object/public/${IMAGE_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** The size to draw a photo at: scaled to cover the target box, then centred (cropped). */
export function coverCrop(srcW: number, srcH: number, outW: number, outH: number): { sx: number; sy: number; sw: number; sh: number } {
  const scale = Math.max(outW / srcW, outH / srcH);
  const sw = Math.min(srcW, outW / scale);
  const sh = Math.min(srcH, outH / scale);
  return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}

async function resize(file: File, kind: ImageKind): Promise<Blob> {
  const { width, height } = IMAGE_RULES[kind];
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("We could not read that image. Try a JPEG, PNG or WebP photo.");
  // Never enlarge a small photo: keep the output at most the source size, in the same shape.
  const k = Math.min(1, bitmap.width / width, bitmap.height / height);
  const outW = Math.round(width * k);
  const outH = Math.round(height * k);
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot prepare the photo.");
  const { sx, sy, sw, sh } = coverCrop(bitmap.width, bitmap.height, outW, outH);
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, outW, outH);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("This browser cannot prepare the photo.");
  return blob;
}

/**
 * Uploads a new photo and points the listing at it. The old file is removed afterwards. Throws an Error whose message is safe to show.
 * The database only lets the owner of an active paid listing do this.
 */
export async function uploadListingImage(listingId: string, kind: ImageKind, file: File, previous: string | null | undefined): Promise<string> {
  if (!ACCEPTED_TYPES.includes(file.type)) throw new Error("Choose a JPEG, PNG or WebP photo.");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("That photo is too large. Choose one under 15 MB.");
  const blob = await resize(file, kind);
  const path = `${listingId}/${kind}-${Date.now()}.jpg`;
  const supabase = getSupabaseBrowser();
  const up = await supabase.storage.from(IMAGE_BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (up.error) throw new Error("Could not upload the photo. Check that your Featured plan is active and try again.");
  const column = kind === "avatar" ? "avatar_path" : "cover_image_path";
  const { error } = await supabase.from("listings").update({ [column]: path }).eq("id", listingId);
  if (error) {
    await supabase.storage.from(IMAGE_BUCKET).remove([path]);
    throw new Error("Could not save the photo. Please try again.");
  }
  if (previous && previous !== path) await supabase.storage.from(IMAGE_BUCKET).remove([previous]);
  return path;
}

export async function removeListingImage(listingId: string, kind: ImageKind, current: string | null | undefined): Promise<void> {
  const supabase = getSupabaseBrowser();
  const column = kind === "avatar" ? "avatar_path" : "cover_image_path";
  const { error } = await supabase.from("listings").update({ [column]: null }).eq("id", listingId);
  if (error) throw new Error("Could not remove the photo. Please try again.");
  if (current) await supabase.storage.from(IMAGE_BUCKET).remove([current]);
}
