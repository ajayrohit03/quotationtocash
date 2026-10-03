import { LogoutButton } from "@/app/admin/(portal)/logout-button";

export default function AnalyticsPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-white/10 bg-navy-mid">
        <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-4">
          <span className="font-display text-sm font-bold">Q2C analytics</span>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </>
  );
}
