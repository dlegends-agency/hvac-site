import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Post } from "@/lib/types";
import { PageTitle, QueryState } from "./widgets";

export function PostsList() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    getSupabaseBrowser()
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        setError(Boolean(error));
        setPosts((data as Post[] | null) ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <>
      <PageTitle title="Blog posts">
        <Link to="/admin/blog/new" className={buttonClass("primary", "!py-2")}><Plus className="size-4" aria-hidden /> New post</Link>
      </PageTitle>
      <QueryState loading={loading} error={error}>
        {posts.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">No posts yet. Create your first article.</p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {posts.map((p) => (
              <li key={p.id}>
                <Link to={`/admin/blog/${p.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-navy">{p.title}</span>
                    <span className="block truncate text-sm text-slate-500">/blog/{p.slug} · updated {new Date(p.updated_at).toLocaleDateString()}</span>
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${p.status === "published" ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-700"}`}>
                    {p.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </>
  );
}
