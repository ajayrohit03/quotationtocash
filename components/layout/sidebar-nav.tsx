"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  FileText,
  Receipt,
  Users,
  Package,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Icon choices map to the original design export's own hand-drawn sidebar
// icons (grid / document / document / person / box / gear) — using
// lucide-react's equivalents rather than copying raw SVGs, since lucide
// is already this app's established icon set.
const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/quotations", label: "Quotations", icon: FileText },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/products", label: "Products", icon: Package },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const active =
          pathname === item.href || pathname?.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <Icon className="size-4 flex-none" strokeWidth={2} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
