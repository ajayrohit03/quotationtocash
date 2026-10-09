import { requireBusinessForPage } from "@/lib/auth/page";
import { ReportsClient } from "./reports-client";

export default async function ReportsPage() {
  await requireBusinessForPage();
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Export invoice data for GST filing. Cancelled documents are always excluded.
        </p>
      </div>
      <ReportsClient />
    </div>
  );
}
