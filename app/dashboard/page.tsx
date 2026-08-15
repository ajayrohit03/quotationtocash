import { UserButton } from "@clerk/nextjs";
import { requireBusinessForPage } from "@/lib/auth/page";

export default async function DashboardPage() {
  const { business, membership } = await requireBusinessForPage();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <p className="text-sm font-medium">{business.name}</p>
          <p className="font-mono text-xs text-muted-foreground capitalize">
            {membership.role}
          </p>
        </div>
        <UserButton />
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-16 text-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome to {business.name}
          </h1>
          <p className="mt-2 text-muted-foreground">
            Quotations, invoices, customers, and products will show up here.
          </p>
        </div>
      </main>
    </div>
  );
}
