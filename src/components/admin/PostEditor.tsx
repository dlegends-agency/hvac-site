import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Post } from "@/lib/types";
import { QueryState } from "./widgets";

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

interface Draft {
  title: string;
  slug: string;
  excerpt: string;
  meta_description: string;
  content: string;
  cover_image: string;
  status: "draft" | "published";
}

const empty: Draft = { title: "", slug: "", excerpt: "", meta_description: "", content: "", cover_image: "", status: "draft" };

export function PostEditor() {
  const params = useParams<{ id?: string }>();
  const id = params.id; // undefined on /admin/blog/new
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft>(empty);
  const [post, setPost] = useState<Post | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [loading, setLoading] = useState(Boolean(id));
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    getSupabaseBrowser()
      .from("posts")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        setLoadError(Boolean(error));
        const p = data as Post | null;
        if (p) {
          setPost(p);
          setSlugTouched(true);
          setDraft({
            title: p.title,
            slug: p.slug,
            excerpt: p.excerpt ?? "",
            meta_description: p.meta_description ?? "",
            content: p.content,
            cover_image: p.cover_image ?? "",
            status: p.status,
          });
        }
        setLoading(false);
      });
  }, [id]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!draft.title.trim() || !draft.slug) return setMsg({ ok: false, text: "Title and URL slug are required." });
    setSaving(true);
    setMsg(null);
    const row = {
      title: draft.title.trim(),
      slug: draft.slug,
      excerpt: draft.excerpt.trim() || null,
      meta_description: draft.meta_description.trim() || null,
      content: draft.content,
      cover_image: draft.cover_image.trim() || null,
      status: draft.status,
      published_at: draft.status === "published" ? (post?.published_at ?? new Date().toISOString()) : (post?.published_at ?? null),
    };
    const supabase = getSupabaseBrowser();
    const res = id
      ? await supabase.from("posts").update(row).eq("id", id).select().single()
      : await supabase.from("posts").insert(row).select().single();
    setSaving(false);
    if (res.error) {
      return setMsg({
        ok: false,
        text: res.error.code === "23505" ? "That URL slug is already used by another post." : "Could not save. Check the slug uses only lowercase letters, numbers and hyphens.",
      });
    }
    const saved = res.data as Post;
    setPost(saved);
    setMsg({ ok: true, text: draft.status === "published" ? "Saved and published. It may take a few minutes to appear on the site." : "Draft saved." });
    if (!id) navigate(`/admin/blog/${saved.id}`, { replace: true });
  }

  async function remove() {
    if (!id || !window.confirm("Delete this post permanently?")) return;
    const { error } = await getSupabaseBrowser().from("posts").delete().eq("id", id);
    if (error) return setMsg({ ok: false, text: "Could not delete." });
    navigate("/admin/blog", { replace: true });
  }

  return (
    <>
      <Link to="/admin/blog" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
        <ArrowLeft className="size-4" aria-hidden /> All posts
      </Link>
      <QueryState loading={loading} error={loadError}>
        {id && !post ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-600">Post not found.</p>
        ) : (
          <form onSubmit={save} className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-2xl font-bold text-navy">{id ? "Edit post" : "New post"}</h1>
              {post?.status === "published" && (
                <Link to={`/blog/${post.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  View live <ExternalLink className="size-4" aria-hidden />
                </Link>
              )}
            </div>
            <Field id="title" label="Title">
              {(a) => (
                <input id="title" value={draft.title} className={inputClass} {...a}
                  onChange={(e) => { set("title", e.target.value); if (!slugTouched) set("slug", slugify(e.target.value)); }} />
              )}
            </Field>
            <Field id="slug" label="URL slug" hint={`Page address: /blog/${draft.slug || "your-slug"}`}>
              {(a) => (
                <input id="slug" value={draft.slug} className={inputClass} {...a}
                  onChange={(e) => { setSlugTouched(true); set("slug", slugify(e.target.value)); }} />
              )}
            </Field>
            <Field id="excerpt" label="Excerpt" optional hint="Shown on the blog list.">
              {(a) => <textarea id="excerpt" rows={2} value={draft.excerpt} className={inputClass} {...a} onChange={(e) => set("excerpt", e.target.value)} />}
            </Field>
            <Field id="meta" label="Meta description" optional hint={`For search results. Aim for about 150 to 160 characters (${draft.meta_description.length} now).`}>
              {(a) => <textarea id="meta" rows={2} value={draft.meta_description} className={inputClass} {...a} onChange={(e) => set("meta_description", e.target.value)} />}
            </Field>
            <Field id="cover" label="Cover image URL" optional hint="A site path like /blog/my-image.svg (files in /public) or a full https:// image address.">
              {(a) => <input id="cover" value={draft.cover_image} className={inputClass} {...a} onChange={(e) => set("cover_image", e.target.value)} />}
            </Field>
            <Field id="content" label="Content" hint="Markdown: ## Heading, ### Subheading, - bullets, 1. numbered, **bold**, *italic*, [text](https://link). Separate paragraphs with a blank line.">
              {(a) => <textarea id="content" rows={18} value={draft.content} className={`${inputClass} font-mono text-sm`} {...a} onChange={(e) => set("content", e.target.value)} />}
            </Field>
            <Field id="status" label="Status">
              {(a) => (
                <select id="status" value={draft.status} className={inputClass} {...a} onChange={(e) => set("status", e.target.value as Draft["status"])}>
                  <option value="draft">Draft (not public)</option>
                  <option value="published">Published</option>
                </select>
              )}
            </Field>
            <div role="status" aria-live="polite">
              {msg && <p className={`text-sm font-medium ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" aria-hidden />} {draft.status === "published" ? "Save and publish" : "Save draft"}
              </Button>
              {id && <Button variant="secondary" onClick={remove}>Delete</Button>}
            </div>
          </form>
        )}
      </QueryState>
    </>
  );
}
