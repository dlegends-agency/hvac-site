import { useMemo } from "react";
import { PermitBoard } from "@/components/opportunities/PermitBoard";
import { useLiveQuery } from "@/lib/admin-hooks";
import type { Coverage } from "@/lib/permit-score";
import type { DirectoryBusiness, PublicPermit } from "@/lib/permits";
import { getSupabaseBrowser } from "@/lib/supabase";
import { PageTitle } from "./widgets";

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

  return (
    <div className="w-full">
      <PageTitle title="Permits" />
      <PermitBoard
        permits={permits.data}
        error={permits.error}
        cover={cover}
        directory={directory.data}
        adminLinks
        intro={<>
          Lead source 1 of 2. New <strong>HVAC</strong> permits from city open-data portals, scraped every day at 8:00 AM Philippine time. Each one is scored from 0 to 100: how fresh it is (35), its project value (25),
          the kind and size of the job (20) and whether we have contractors in that city (20). <strong>Hot</strong> is 65 or more, <strong>Warm</strong> is 35 to 64, <strong>Cold</strong> is under 35.
          Click a permit to see everything about it. The same permits show up for your business users in their dashboard under Opportunities. This is public record data. Nothing is sent to anyone from here.
        </>}
        emptyText={<>No permits yet. Run the permits import (GitHub Actions &gt; Permits import &gt; Run workflow). After that it runs by itself every day.</>}
      />
    </div>
  );
}
