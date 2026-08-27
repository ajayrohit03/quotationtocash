"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const ROLE_LABEL: Record<"admin" | "staff", string> = {
  admin: "an Admin",
  staff: "a team member",
};

export function InvitationResponse({
  token,
  businessName,
  inviterName,
  role,
  invitedEmail,
  currentUserEmail,
}: {
  token: string;
  businessName: string;
  inviterName: string;
  role: "admin" | "staff";
  invitedEmail: string;
  currentUserEmail: string | null;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const inviteUrl = `/invite/${token}`;

  // State 1 (docs/invitation-onboarding-design.md §4.3): not signed in at
  // all. redirect_url round-trips back to this exact page once Clerk's
  // sign-in/sign-up completes, so the accept/decline decision always
  // happens after auth, never before.
  if (currentUserEmail === null) {
    const redirectTarget = `redirect_url=${encodeURIComponent(inviteUrl)}`;
    return (
      <Card>
        <Heading businessName={businessName} inviterName={inviterName} role={role} />
        <div className="mt-6 flex gap-2">
          <Button nativeButton={false} render={<Link href={`/sign-in?${redirectTarget}`} />}>
            Sign in to accept
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/sign-up?${redirectTarget}`} />}
          >
            Create an account
          </Button>
        </div>
      </Card>
    );
  }

  // State 2: signed in as the wrong account. Explicit rejection, not a
  // silent 404 or a silent accept under the active session.
  if (currentUserEmail.trim().toLowerCase() !== invitedEmail.trim().toLowerCase()) {
    return (
      <Card>
        <h1 className="text-lg font-semibold">Wrong account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This invitation was sent to <strong>{invitedEmail}</strong>, but
          you&apos;re signed in as <strong>{currentUserEmail}</strong>. Sign
          out and sign in as {invitedEmail} to accept, or ask {inviterName}{" "}
          to resend it to the right address.
        </p>
        <SignOutButton redirectUrl={`/sign-in?redirect_url=${encodeURIComponent(inviteUrl)}`}>
          <Button variant="outline" className="mt-6">
            Sign out
          </Button>
        </SignOutButton>
      </Card>
    );
  }

  // State 3: signed in as the matching account — explicit confirm, never
  // auto-accepted even on a perfect match (§4.3, §4.4).
  async function respond(action: "accept" | "decline") {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/invitations/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Something went wrong. Try again.");
        return;
      }
      if (action === "accept") {
        toast.success(`You've joined ${businessName}`);
        router.push("/dashboard");
      } else {
        toast.success("Invitation declined");
        router.push("/");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <Heading businessName={businessName} inviterName={inviterName} role={role} />
      <div className="mt-6 flex gap-2">
        <Button disabled={submitting} onClick={() => respond("accept")}>
          Accept
        </Button>
        <Button variant="outline" disabled={submitting} onClick={() => respond("decline")}>
          Decline
        </Button>
      </div>
    </Card>
  );
}

function Heading({
  businessName,
  inviterName,
  role,
}: {
  businessName: string;
  inviterName: string;
  role: "admin" | "staff";
}) {
  return (
    <>
      <h1 className="text-lg font-semibold">Join {businessName}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {inviterName} invited you to join <strong>{businessName}</strong> on
        QuotationToCash as {ROLE_LABEL[role]}.
      </p>
    </>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md flex-1 flex flex-col justify-center px-6 py-16">
      <div className="rounded-xl border border-border bg-card p-6 shadow-xs">
        {children}
      </div>
    </div>
  );
}
