import { cacheLife } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase";
import type { Post } from "@/lib/types";

type PostSummary = Pick<Post, "slug" | "title" | "excerpt" | "published_at" | "updated_at">;

/** Published posts, newest first. Cached briefly so new posts appear within minutes. */
export async function getPublishedPosts(): Promise<PostSummary[]> {
  "use cache";
  cacheLife("minutes");
  const supabase = getSupabaseServer();
  if (!supabase) return [];
  const { data } = await supabase
    .from("posts")
    .select("slug,title,excerpt,published_at,updated_at")
    .eq("status", "published")
    .order("published_at", { ascending: false });
  return (data as PostSummary[] | null) ?? [];
}

export async function getPublishedPost(slug: string): Promise<Post | null> {
  "use cache";
  cacheLife("minutes");
  const supabase = getSupabaseServer();
  if (!supabase) return null;
  const { data } = await supabase.from("posts").select("*").eq("slug", slug).eq("status", "published").maybeSingle();
  return (data as Post | null) ?? null;
}
