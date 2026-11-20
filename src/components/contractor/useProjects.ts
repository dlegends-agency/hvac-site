import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Project } from "@/lib/projects";

/** The signed-in business's projects, plus how many of each one's tasks are done (for the progress bar). Row security limits it to their own. */
export function useProjects(enabled: boolean) {
  const [state, setState] = useState<{ projects: Project[]; progress: Record<string, { done: number; total: number }>; loaded: boolean; error: boolean }>({ projects: [], progress: {}, loaded: false, error: false });

  const reload = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const [p, t] = await Promise.all([
      sb.from("projects").select("*").order("updated_at", { ascending: false }).limit(500),
      sb.from("project_tasks").select("project_id, done").limit(5000),
    ]);
    const progress: Record<string, { done: number; total: number }> = {};
    for (const row of (t.data as { project_id: string; done: boolean }[] | null) ?? []) {
      const e = (progress[row.project_id] ??= { done: 0, total: 0 });
      e.total++;
      if (row.done) e.done++;
    }
    setState({ projects: (p.data as Project[] | null) ?? [], progress, loaded: true, error: Boolean(p.error) });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void reload();
  }, [enabled, reload]);

  return { ...state, reload };
}

/** The rows of one child table of a project (tasks, documents, team, expenses, quotations), with add, change and remove. */
export function useChildRows<T extends { id: string }>(table: string, projectId: string, order: { column: string; ascending: boolean }) {
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const { data, error: e } = await getSupabaseBrowser().from(table).select("*").eq("project_id", projectId).order(order.column, { ascending: order.ascending }).limit(500);
    setError(e ? e.message : null);
    setRows((data as T[] | null) ?? []);
  }, [table, projectId, order.column, order.ascending]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void reload();
  }, [reload]);

  const add = useCallback(async (values: Record<string, unknown>) => {
    const { error: e } = await getSupabaseBrowser().from(table).insert({ ...values, project_id: projectId });
    if (e) setError(e.message);
    else await reload();
    return !e;
  }, [table, projectId, reload]);
  const change = useCallback(async (id: string, values: Record<string, unknown>) => {
    const { error: e } = await getSupabaseBrowser().from(table).update(values).eq("id", id);
    if (e) setError(e.message);
    else await reload();
    return !e;
  }, [table, reload]);
  const remove = useCallback(async (id: string) => {
    const { error: e } = await getSupabaseBrowser().from(table).delete().eq("id", id);
    if (e) setError(e.message);
    else await reload();
    return !e;
  }, [table, reload]);

  return { rows, error, reload, add, change, remove };
}
