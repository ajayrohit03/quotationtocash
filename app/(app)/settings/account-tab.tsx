"use client";

import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

// Deliberately not a custom profile-edit form — Clerk owns identity
// (name/email/password/connected accounts), and already provides that
// UI via the UserButton menu in the header. Rebuilding it here would
// just be a second, driftable copy of the same settings.
export function AccountTab({
  user,
}: {
  user: { name: string | null; email: string };
}) {
  return (
    <div>
      <div className="border-b border-border pb-4">
        <div className="text-base font-semibold">Account</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Your personal login, separate from the business profile.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 rounded-lg border border-border bg-muted/30 p-4 text-sm">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Name</p>
          <p className="mt-1 font-medium">{user.name || "—"}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Email</p>
          <p className="mt-1 font-medium">{user.email}</p>
        </div>
      </div>

      <p className="mt-5 text-sm text-muted-foreground">
        To change your name, email, password, or connected sign-in
        methods, use the account menu in the top-right corner.
      </p>

      <SignOutButton>
        <Button type="button" variant="ghost" className="mt-6 text-destructive">
          Log out
        </Button>
      </SignOutButton>
    </div>
  );
}
