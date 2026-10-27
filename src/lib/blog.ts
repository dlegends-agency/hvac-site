import { useEffect, useState } from "react";
import { getSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";
import type { Post } from "@/lib/types";

export type PostSummary = Pick<Post, "slug" | "title" | "excerpt" | "published_at" | "updated_at">;

interface Result<T> {
  data: T;
  loading: boolean;
}

/** Published posts, newest first. Row level security guarantees only published rows are returned. */
export function usePublishedPosts(): Result<PostSummary[]> {
  const [state, setState] = useState<Result<PostSummary[]>>({ data: [], loading: isSupabaseConfigured });
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    getSupabaseBrowser()
      .from("posts")
      .select("slug,title,excerpt,published_at,updated_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .then(({ data }) => setState({ data: (data as PostSummary[] | null) ?? [], loading: false }));
  }, []);
  return state;
}

export function usePublishedPost(slug: string | undefined): Result<Post | null> {
  const [state, setState] = useState<Result<Post | null> & { slug?: string }>({ data: null, loading: true });
  useEffect(() => {
    if (!slug || !isSupabaseConfigured) return;
    let cancelled = false;
    getSupabaseBrowser()
      .from("posts")
      .select("*")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setState({ data: (data as Post | null) ?? null, loading: false, slug });
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);
  // Treat a result for a different slug as still loading.
  const loading = state.loading || state.slug !== slug;
  return { data: loading ? null : state.data, loading: isSupabaseConfigured ? loading : false };
}
