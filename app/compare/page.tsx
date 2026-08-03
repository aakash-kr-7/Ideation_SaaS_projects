import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { CompareMatrix } from "@/components/opportunity/CompareMatrix";
import { EmptyState } from "@/components/ui/state-message";
import { validationReportSchema } from "@/lib/report-schema";
import { createClient } from "@/lib/supabase/server";
import { firstRelation } from "@/lib/supabase/relations";

export const dynamic = "force-dynamic";

const primaryLinkClass = "inline-flex min-h-10 items-center justify-center rounded-sb-md border border-sb-accent bg-sb-accent px-sb-4 py-sb-2 text-sm font-medium text-sb-text-primary transition-colors duration-sb-fast ease-sb-standard hover:border-sb-accent-hover hover:bg-sb-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus";

export default async function ComparePage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reports")
    .select("report_versions(payload, created_at), research_runs!inner(status)")
    .eq("research_runs.status", "Completed")
    .order("created_at", { referencedTable: "report_versions", ascending: false });
  if (error) throw error;

  const reports = (data ?? []).flatMap((row) => {
    const parsed = validationReportSchema.safeParse(firstRelation(row.report_versions)?.payload);
    return parsed.success ? [parsed.data] : [];
  });

  if (reports.length < 2) {
    return (
      <AppShell title="Compare ideas">
        <main className="mx-auto grid min-h-[60vh] w-full max-w-3xl place-items-center px-sb-5 py-sb-12">
          <EmptyState
            message={reports.length === 0
              ? "No completed reports are available. Complete two validations to compare their factors under the same scoring model."
              : "One completed report is available. Complete one more validation to compare the two ideas."}
            action={<Link className={primaryLinkClass} href="/research/new?mode=quick_scan">Validate another idea</Link>}
          />
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell title="Compare ideas">
      <main className="px-sb-5 py-sb-8 sm:px-sb-8 sm:py-sb-10">
        <CompareMatrix allReports={reports}/>
      </main>
    </AppShell>
  );
}
