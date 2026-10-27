import { Suspense } from "react";
import { PostEditor } from "@/components/admin/PostEditor";

export default function NewPostPage() {
  return (
    <Suspense fallback={<p className="text-slate-600">Loading…</p>}>
      <PostEditor />
    </Suspense>
  );
}
