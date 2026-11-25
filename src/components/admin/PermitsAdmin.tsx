import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useScheduleText } from "@/lib/use-schedule";
import { PermitBoard } from "@/components/opportunities/PermitBoard";
import { useLiveQuery } from "@/lib/admin-hooks";
import type { Coverage } from "@/lib/permit-score";
import type { DirectoryBusiness, PublicPermit } from "@/lib/permits";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { downloadCsv } from "@/lib/csv-export";
import { PageTitle, StatStrip } from "./widgets";

/** Lead source 1: HVAC building permits from city open-data portals, ranked Hot, Warm and Cold. Kept apart from the directory and customer requests. */
export function PermitsAdmin() {
  const supabase = getSupabaseBrowser();
  const permits = useLiveQuery<PublicPermit[]>(
    [],
    () => supabase.from("public_permits").select("*").eq("trade", "HVAC").order("issued_on", { ascending: false, nullsFirst: false }).limit(1000),
    { key: "permits-hvac", intervalMs: 120_000 },
  );
  // Our directory: where we have contractors, and the contractors we already know (to fill in an email).
  const directory = useLiveQuery<(DirectoryBusiness & { status: string })[]>(
    [],
    () => supabase.from("listings").select("id, business_name, slug, phone, email, website, city, status").limit(5000),
    { key: "permits-directory", intervalMs: null },
  );
  const cover = useMemo<Coverage>(() => {
    const published = directory.data.filter((l) => l.status === "published");
    return { cities: new Set(published.map((l) => (l.city ?? "").trim().toLowerCase()).filter(Boolean)), stateCovered: published.length > 0 };
  }, [directory.data]);

  const complete = (p: PublicPermit) => (p.people ?? []).filter((x) => x.email && x.phone && (x.name || x.company));
  const withContact = permits.data.filter((p) => complete(p).length > 0).length;
  const scheduleText = useScheduleText("permits");
  const latest = permits.data.reduce((m, p) => (p.imported_at > m ? p.imported_at : m), "");
  function exportContacts() {
    const rows: unknown[][] = [["Contractor", "Contact name", "Phone", "Email", "Website", "Role", "City", "Permit number", "Issued", "Project value", "Address"]];
    for (const p of permits.data) for (const x of complete(p)) rows.push([x.company ?? x.name, x.company ? x.name : "", x.phone, x.email, x.website, x.role, p.city, p.source_id, p.issued_on, p.value_usd, p.address]);
    downloadCsv("permit-contractors", rows);
  }

  return (
    <div className="w-full">
      <PageTitle title="Permits" description="Lead source 1 of 2: HVAC building permits from city open data. Permits keep a contractor name, phone and email; Fort Worth permits are kept without one (its open data lists no contractor).">
        <Button variant="secondary" onClick={exportContacts} disabled={withContact === 0} className="!py-2 text-sm"><Download className="size-4" aria-hidden /> Export contractors (CSV)</Button>
      </PageTitle>
      <StatStrip items={[
        { label: "Permits", value: permits.data.length.toLocaleString() },
        { label: "With name, phone and email", value: `${withContact.toLocaleString()}`, tone: withContact === permits.data.length ? "good" : "warn" },
        { label: "Last scrape", value: latest ? new Date(latest).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Never" },
        { label: "Schedule", value: <Link to="/admin/schedule" className="text-base hover:text-primary hover:underline">{scheduleText}</Link> },
      ]} />
      <PermitBoard
        permits={permits.data}
        error={permits.error}
        cover={cover}
        directory={directory.data}
        adminLinks
        intro={<>
          Each permit is scored from 0 to 100: how fresh it is (35), its project value (25), the kind and size of the job (20) and whether we have contractors in that city (20). <strong>Hot</strong> is 65 or more, <strong>Warm</strong> is 35 to 64, <strong>Cold</strong> is under 35. Click a permit to see everything about it. Your business users see the same permits under Opportunities. This is public record data, and nothing is sent to anyone from here.
        </>}
        emptyText={<>No permits yet. Run the permits import (GitHub Actions &gt; Permits import &gt; Run workflow). After that it runs by itself every day.</>}
      />
    </div>
  );
}
