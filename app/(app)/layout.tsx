import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { requireBusinessForPage } from "@/lib/auth/page";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/quotations", label: "Quotations" },
  { href: "/invoices", label: "Invoices" },
  { href: "/customers", label: "Customers" },
  { href: "/products", label: "Products" },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { business, membership } = await requireBusinessForPage();

  return (
    <div className="flex flex-1">
      <aside className="flex w-56 flex-none flex-col border-r border-border p-4">
        <p className="truncate text-sm font-medium">{business.name}</p>
        <p className="font-mono text-xs text-muted-foreground capitalize">
          {membership.role}
        </p>
        <nav className="mt-6 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-foreground/80 hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end border-b border-border px-6 py-3">
          <UserButton />
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
