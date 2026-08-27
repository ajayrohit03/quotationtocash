import { UserButton } from "@clerk/nextjs";
import { requireBusinessForPage } from "@/lib/auth/page";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { CreateNewMenu } from "@/components/layout/create-new-menu";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { business, membership } = await requireBusinessForPage();

  return (
    <div className="flex flex-1">
      <aside className="sticky top-0 flex h-screen w-60 flex-none flex-col gap-5 border-r border-sidebar-border bg-sidebar p-3.5">
        <div className="flex items-center gap-2.5 px-1.5">
          <div className="flex size-7 flex-none items-center justify-center rounded-md bg-primary text-[13px] font-bold text-primary-foreground">
            QC
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-sidebar-foreground">
            QuotationToCash
          </span>
        </div>

        <CreateNewMenu />

        <SidebarNav />

        <div className="mt-auto flex items-center gap-2.5 border-t border-sidebar-border pt-3.5">
          <InitialsAvatar name={business.name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-sidebar-foreground">
              {business.name}
            </p>
            <p className="truncate text-xs text-muted-foreground capitalize">
              {membership.role}
            </p>
          </div>
        </div>
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
