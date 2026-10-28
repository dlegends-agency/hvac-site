import { useMemo, useState } from "react";
import { Archive, Check, Mail } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLiveQuery } from "@/lib/admin-hooks";
import { getSupabaseBrowser } from "@/lib/supabase";
import { PageTitle, QueryState } from "./widgets";

type MessageStatus = "new" | "read" | "archived";
interface ContactMessage {
  id: string;
  created_at: string;
  status: MessageStatus;
  name: string;
  email: string;
  topic: string;
  message: string;
}

const TABS: (MessageStatus | "all")[] = ["new", "read", "archived", "all"];
const badge: Record<MessageStatus, string> = {
  new: "bg-blue-100 text-blue-800",
  read: "bg-slate-200 text-slate-700",
  archived: "bg-slate-100 text-slate-500",
};

export function MessagesAdmin() {
  const supabase = getSupabaseBrowser();
  const q = useLiveQuery<ContactMessage[]>(
    [],
    () => supabase.from("contact_messages").select("*").order("created_at", { ascending: false }).limit(300),
    { key: "messages", intervalMs: 30_000 },
  );
  const [tab, setTab] = useState<MessageStatus | "all">("new");
  const [overrides, setOverrides] = useState<Record<string, MessageStatus>>({});
  const rows = useMemo(() => q.data.map((m) => ({ ...m, status: overrides[m.id] ?? m.status })), [q.data, overrides]);
  const counts = useMemo(() => {
    const c: Record<MessageStatus | "all", number> = { all: rows.length, new: 0, read: 0, archived: 0 };
    for (const m of rows) c[m.status]++;
    return c;
  }, [rows]);
  const shown = rows.filter((m) => tab === "all" || m.status === tab);

  async function setStatus(id: string, status: MessageStatus) {
    setOverrides((o) => ({ ...o, [id]: status }));
    const { error } = await supabase.from("contact_messages").update({ status }).eq("id", id);
    if (error) {
      setOverrides((o) => {
        const next = { ...o };
        delete next[id];
        return next;
      });
    }
  }

  return (
    <>
      <PageTitle title="Messages" />
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter messages">
        {TABS.map((t) => (
          <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}
            className={`rounded-full border px-3 py-1 text-sm font-medium capitalize ${tab === t ? "border-primary bg-primary text-white" : "border-slate-300 bg-white text-navy"}`}>
            {t} ({counts[t]})
          </button>
        ))}
      </div>
      <QueryState loading={q.loading} error={q.error}>
        {shown.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">
            {rows.length === 0 ? "No messages yet. Messages sent from the Contact page appear here." : "No messages with this status."}
          </p>
        ) : (
          <ul className="space-y-4">
            {shown.map((m) => (
              <li key={m.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${m.status === "new" ? "border-primary/40" : "border-slate-200"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-navy">{m.name} <span className="font-normal text-slate-500">· {m.email}</span></p>
                    <p className="text-sm text-slate-500">{m.topic} · {new Date(m.created_at).toLocaleString()}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${badge[m.status]}`}>{m.status}</span>
                </div>
                <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">{m.message}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.topic}`)}`} onClick={() => m.status === "new" && setStatus(m.id, "read")}
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary-dark">
                    <Mail className="size-4" aria-hidden /> Reply
                  </a>
                  {m.status === "new" && <Button variant="secondary" onClick={() => setStatus(m.id, "read")} className="!rounded-full !px-4 !py-1.5 text-sm"><Check className="size-4" aria-hidden /> Mark read</Button>}
                  {m.status !== "archived" && <Button variant="secondary" onClick={() => setStatus(m.id, "archived")} className="!rounded-full !px-4 !py-1.5 text-sm"><Archive className="size-4" aria-hidden /> Archive</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </>
  );
}
