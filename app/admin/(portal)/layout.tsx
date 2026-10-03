import Link from "next/link";
import { LogoutButton } from "./logout-button";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-white/10 bg-navy-mid">
        <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-4">
          <Link href="/businesses" className="font-display text-sm font-bold">
            Q2C admin
          </Link>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </>
  );
}
