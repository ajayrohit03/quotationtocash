import { requireBusinessForPage } from "@/lib/auth/page";

export default async function DashboardPage() {
  const { business } = await requireBusinessForPage();

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome to {business.name}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Quotations, invoices, and revenue metrics will show up here.
        </p>
      </div>
    </div>
  );
}
