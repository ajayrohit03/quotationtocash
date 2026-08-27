"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export type PendingInvitationSummary = {
  id: string;
  businessName: string;
  inviterName: string;
  role: "admin" | "staff";
};

const ROLE_LABEL: Record<"admin" | "staff", string> = {
  admin: "an Admin",
  staff: "a team member",
};

export function InvitationsList({
  invitations,
}: {
  invitations: PendingInvitationSummary[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(invitations);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function respond(id: string, action: "accept" | "decline") {
    setBusyId(id);
    try {
      const response = await fetch(`/api/invitations/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Something went wrong. Try again.");
        return;
      }
      if (action === "accept") {
        const business = items.find((i) => i.id === id)?.businessName;
        toast.success(business ? `You've joined ${business}` : "Invitation accepted");
        router.push("/dashboard");
        return;
      }
      toast.success("Invitation declined");
      setItems((prev) => prev.filter((i) => i.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((invitation) => (
        <div
          key={invitation.id}
          className="flex items-center justify-between gap-4 rounded-lg border border-border p-4"
        >
          <div>
            <p className="text-sm font-medium">{invitation.businessName}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {invitation.inviterName} invited you as {ROLE_LABEL[invitation.role]}
            </p>
          </div>
          <div className="flex flex-none gap-2">
            <Button
              size="sm"
              disabled={busyId === invitation.id}
              onClick={() => respond(invitation.id, "accept")}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busyId === invitation.id}
              onClick={() => respond(invitation.id, "decline")}
            >
              Decline
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
