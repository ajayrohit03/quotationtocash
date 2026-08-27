"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import type { SettingsMember, SettingsInvitation } from "./types";

const NO_MANAGER = "__none__";

// Base UI's Select.Value only resolves a label by finding the matching
// SelectItem that has actually rendered inside the (portal-mounted,
// lazily-opened) popup — on first paint with a value set from server
// data, before the popup has ever been opened, there's nothing to find,
// and it falls back to displaying the raw value string. Every select
// below where the value (an id or enum key) differs from its label
// passes an explicit `children` render-function to SelectValue instead
// of relying on that implicit lookup — same fix shape as the disabled-
// prop issue elsewhere in this app: make it explicit, don't trust a
// library default that only happens to work once a user has interacted
// with it.
const ROLE_SELECT_LABEL: Record<"staff" | "admin", string> = {
  staff: "Staff",
  admin: "Admin",
};

const STATUS_LABEL: Record<SettingsInvitation["status"], string> = {
  pending: "Pending",
  accepted: "Accepted",
  revoked: "Revoked",
  expired: "Expired",
};

const STATUS_CLASS: Record<SettingsInvitation["status"], string> = {
  pending: "bg-amber-500/10 text-amber-600",
  accepted: "bg-emerald-500/10 text-emerald-600",
  revoked: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
};

export function TeamTab({
  members: initialMembers,
  invitations: initialInvitations,
}: {
  members: SettingsMember[];
  invitations: SettingsInvitation[];
}) {
  const [members, setMembers] = useState(initialMembers);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [acceptUrls, setAcceptUrls] = useState<Record<string, string>>({});

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"staff" | "admin">("staff");
  const [title, setTitle] = useState("");
  const [reportsToId, setReportsToId] = useState<string>(NO_MANAGER);
  const [inviting, setInviting] = useState(false);

  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [busyInvitationId, setBusyInvitationId] = useState<string | null>(null);

  function replaceMember(updated: SettingsMember) {
    setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  }

  function upsertInvitation(updated: SettingsInvitation, acceptUrl: string) {
    setInvitations((prev) => {
      const exists = prev.some((i) => i.id === updated.id);
      return exists
        ? prev.map((i) => (i.id === updated.id ? updated : i))
        : [updated, ...prev];
    });
    setAcceptUrls((prev) => ({ ...prev, [updated.id]: acceptUrl }));
  }

  async function patchMember(id: string, body: Record<string, unknown>) {
    setSavingMemberId(id);
    try {
      const response = await fetch(`/api/business/members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(data?.error ?? "Couldn't save. Try again.");
        return;
      }
      replaceMember(data.member as SettingsMember);
    } finally {
      setSavingMemberId(null);
    }
  }

  async function sendInvitation(input: {
    email: string;
    role: "staff" | "admin";
    title: string | null;
    reportsToId: string | null;
  }) {
    const response = await fetch("/api/business/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(data?.error ?? "Couldn't send invitation. Try again.");
      return;
    }

    const invitation = data.invitation as SettingsInvitation;
    upsertInvitation(invitation, data.acceptUrl as string);

    if (data.emailSent) {
      toast.success(
        data.resent ? `Invitation resent to ${invitation.email}` : `Invitation sent to ${invitation.email}`,
      );
    } else {
      toast.success("Invitation created — copy the link below to share it");
    }
  }

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setInviting(true);
    try {
      await sendInvitation({
        email: trimmed,
        role,
        title: title.trim() || null,
        reportsToId: reportsToId === NO_MANAGER ? null : reportsToId,
      });
      setEmail("");
      setTitle("");
      setReportsToId(NO_MANAGER);
      setRole("staff");
    } finally {
      setInviting(false);
    }
  }

  async function handleResend(invitation: SettingsInvitation) {
    setBusyInvitationId(invitation.id);
    try {
      await sendInvitation({
        email: invitation.email,
        role: invitation.role === "admin" ? "admin" : "staff",
        title: invitation.title,
        reportsToId: null,
      });
    } finally {
      setBusyInvitationId(null);
    }
  }

  async function handleRevoke(invitation: SettingsInvitation) {
    setBusyInvitationId(invitation.id);
    try {
      const response = await fetch(
        `/api/business/invitations/${invitation.id}/revoke`,
        { method: "POST" },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(data?.error ?? "Couldn't revoke invitation. Try again.");
        return;
      }
      setInvitations((prev) =>
        prev.map((i) => (i.id === invitation.id ? { ...i, status: "revoked" } : i)),
      );
      toast.success("Invitation revoked");
    } finally {
      setBusyInvitationId(null);
    }
  }

  async function copyLink(url: string) {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  }

  // Admin, not just Staff, is a valid manager target — an Admin can be
  // someone's real line manager even though their own document visibility
  // is unconditional regardless of tree position (see
  // docs/invitation-onboarding-design.md §1.3). Owner never is — it sits
  // outside the tree entirely and isn't a node to report to.
  const managerOptions = members.filter(
    (m) => (m.role === "staff" || m.role === "admin") && m.isActive,
  );
  const managerLabelById = new Map(
    managerOptions.map((option) => [option.id, option.user.name ?? option.user.email]),
  );

  const pendingInvitations = invitations.filter((i) => i.status === "pending");
  const pastInvitations = invitations.filter((i) => i.status !== "pending");

  return (
    <div>
      <div className="border-b border-border pb-4">
        <div className="text-base font-semibold">Team</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Invite people to join this business, and set who reports to whom
          — that determines who can see whose quotations and invoices.
        </p>
      </div>

      <form onSubmit={handleInvite} className="mt-5 flex flex-wrap items-center gap-2">
        <Input
          type="email"
          placeholder="person@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="max-w-xs"
        />
        <Select value={role} onValueChange={(value) => setRole(value as "staff" | "admin")}>
          <SelectTrigger className="w-[120px]">
            <SelectValue>{(value: "staff" | "admin") => ROLE_SELECT_LABEL[value]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="staff">Staff</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Title (optional)"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="w-[160px]"
        />
        <Select
          value={reportsToId}
          onValueChange={(value) => setReportsToId(value ?? NO_MANAGER)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="No manager">
              {(value: string) =>
                value === NO_MANAGER
                  ? "No manager"
                  : (managerLabelById.get(value) ?? value)
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_MANAGER}>No manager</SelectItem>
            {managerOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.user.name ?? option.user.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={inviting || !email.trim()}>
          {inviting ? "Sending…" : "Send invitation"}
        </Button>
      </form>
      <p className="mt-1.5 text-xs text-muted-foreground">
        They don&apos;t need an existing account — the invitation link
        handles sign-up.
      </p>

      {pendingInvitations.length > 0 && (
        <div className="mt-6">
          <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Pending invitations
          </div>
          <div className="mt-2 divide-y divide-border rounded-xl border border-border">
            {pendingInvitations.map((invitation) => (
              <div key={invitation.id} className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-[180px] flex-1">
                    <div className="truncate text-sm font-medium">{invitation.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {invitation.role === "admin" ? "Admin" : "Staff"}
                      {invitation.title ? ` · ${invitation.title}` : ""}
                    </div>
                  </div>
                  <span
                    className={`rounded-md px-2 py-1 text-xs font-medium ${STATUS_CLASS[invitation.status]}`}
                  >
                    {STATUS_LABEL[invitation.status]}
                  </span>
                  <div className="ml-auto flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyInvitationId === invitation.id}
                      onClick={() => handleResend(invitation)}
                    >
                      Resend
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={busyInvitationId === invitation.id}
                      onClick={() => handleRevoke(invitation)}
                    >
                      Revoke
                    </Button>
                  </div>
                </div>
                {acceptUrls[invitation.id] && (
                  <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
                    <code className="flex-1 truncate text-xs">
                      {acceptUrls[invitation.id]}
                    </code>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => copyLink(acceptUrls[invitation.id])}
                    >
                      Copy link
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {pastInvitations.length > 0 && (
        <div className="mt-6">
          <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Invitation history
          </div>
          <div className="mt-2 divide-y divide-border rounded-xl border border-border">
            {pastInvitations.map((invitation) => (
              <div key={invitation.id} className="flex items-center gap-3 p-4">
                <div className="min-w-[180px] flex-1">
                  <div className="truncate text-sm font-medium">{invitation.email}</div>
                  <div className="text-xs text-muted-foreground">
                    {invitation.role === "admin" ? "Admin" : "Staff"}
                  </div>
                </div>
                <span
                  className={`rounded-md px-2 py-1 text-xs font-medium ${STATUS_CLASS[invitation.status]}`}
                >
                  {STATUS_LABEL[invitation.status]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Members
      </div>
      <div className="mt-2 divide-y divide-border rounded-xl border border-border">
        {members.map((member) => {
          const saving = savingMemberId === member.id;
          const displayName = member.user.name ?? member.user.email;

          return (
            <div key={member.id} className="flex flex-wrap items-center gap-3 p-4">
              <InitialsAvatar name={displayName} size="sm" />
              <div className="w-[190px] flex-none">
                <div className="truncate text-sm font-medium">{displayName}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {member.user.email}
                </div>
              </div>

              {member.role === "owner" ? (
                <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                  Owner
                </span>
              ) : (
                <>
                  <Select
                    value={member.role}
                    disabled={saving}
                    onValueChange={(value) => patchMember(member.id, { role: value })}
                  >
                    <SelectTrigger className="w-[110px]">
                      <SelectValue>
                        {(value: "staff" | "admin") => ROLE_SELECT_LABEL[value]}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>

                  <Input
                    placeholder="Title (e.g. Manager)"
                    defaultValue={member.title ?? ""}
                    disabled={saving}
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      if (value !== (member.title ?? "")) {
                        patchMember(member.id, { title: value || null });
                      }
                    }}
                    className="w-[160px]"
                  />

                  <Select
                    value={member.reportsToId ?? NO_MANAGER}
                    disabled={saving}
                    onValueChange={(value) =>
                      patchMember(member.id, {
                        reportsToId: value === NO_MANAGER ? null : value,
                      })
                    }
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="No manager">
                        {(value: string) =>
                          value === NO_MANAGER
                            ? "No manager"
                            : (managerLabelById.get(value) ?? value)
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_MANAGER}>No manager</SelectItem>
                      {managerOptions
                        .filter((option) => option.id !== member.id)
                        .map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.user.name ?? option.user.email}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>

                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {member.isActive ? "Active" : "Deactivated"}
                    </span>
                    <Switch
                      checked={member.isActive}
                      disabled={saving}
                      onCheckedChange={(checked) =>
                        patchMember(member.id, { isActive: checked })
                      }
                    />
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
