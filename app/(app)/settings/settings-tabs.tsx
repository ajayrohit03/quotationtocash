"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Building2, Percent, FileText, Palette, CircleUser, Users } from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { SettingsBusiness, SettingsMember, SettingsInvitation } from "./types";

// Each tab is its own chunk, fetched only when actually selected — base-ui's
// Tabs.Panel doesn't keep inactive panels mounted (keepMounted defaults to
// false), so before this change every tab's code, including react-hook-form
// + zod-heavy ones like BusinessProfileTab and DocumentsTab, loaded and
// parsed up front regardless of which tab (if any) the user opened.
const BusinessProfileTab = dynamic(() =>
  import("./business-profile-tab").then((m) => m.BusinessProfileTab),
);
const TaxTab = dynamic(() => import("./tax-tab").then((m) => m.TaxTab));
const DocumentsTab = dynamic(() =>
  import("./documents-tab").then((m) => m.DocumentsTab),
);
const AppearanceTab = dynamic(() =>
  import("./appearance-tab").then((m) => m.AppearanceTab),
);
const AccountTab = dynamic(() =>
  import("./account-tab").then((m) => m.AccountTab),
);
const TeamTab = dynamic(() => import("./team-tab").then((m) => m.TeamTab));

const TABS = [
  { value: "business", label: "Business profile", icon: Building2 },
  { value: "tax", label: "Tax", icon: Percent },
  { value: "documents", label: "Documents", icon: FileText },
  { value: "appearance", label: "Appearance", icon: Palette },
  { value: "account", label: "Account", icon: CircleUser },
];

export function SettingsTabs({
  business,
  isOwner,
  isAdmin,
  user,
  members,
  invitations,
}: {
  business: SettingsBusiness;
  isOwner: boolean;
  isAdmin: boolean;
  user: { name: string | null; email: string };
  members: SettingsMember[] | null;
  invitations: SettingsInvitation[] | null;
}) {
  const [current, setCurrent] = useState(business);
  // Team management is Admin-delegable (isAdmin), same as Business
  // profile/Documents/Appearance — Tax stays owner-only below. The
  // underlying APIs 403 for anyone else, so the tab itself is only
  // offered when it'll actually work rather than rendering a form that's
  // guaranteed to fail on submit.
  const tabs = isAdmin && members && invitations
    ? [...TABS, { value: "team", label: "Team", icon: Users }]
    : TABS;

  return (
    <Tabs
      defaultValue="business"
      orientation="vertical"
      className="grid grid-cols-[208px_minmax(0,1fr)] items-start gap-6"
    >
      <TabsList className="flex h-fit w-full flex-col items-stretch gap-0.5 bg-transparent p-0">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className="justify-start gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 data-active:bg-primary/10 data-active:text-primary data-active:shadow-none"
          >
            <tab.icon className="size-4 flex-none" strokeWidth={2} />
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <div className="rounded-xl border border-border bg-card p-6 shadow-xs">
        <TabsContent value="business">
          <BusinessProfileTab
            business={current}
            readOnly={!isAdmin}
            onUpdated={setCurrent}
          />
        </TabsContent>
        <TabsContent value="tax">
          <TaxTab business={current} readOnly={!isOwner} onUpdated={setCurrent} />
        </TabsContent>
        <TabsContent value="documents">
          <DocumentsTab
            business={current}
            readOnly={!isAdmin}
            onUpdated={setCurrent}
          />
        </TabsContent>
        <TabsContent value="appearance">
          <AppearanceTab
            business={current}
            readOnly={!isAdmin}
            onUpdated={setCurrent}
          />
        </TabsContent>
        <TabsContent value="account">
          <AccountTab user={user} />
        </TabsContent>
        {isAdmin && members && invitations && (
          <TabsContent value="team">
            <TeamTab members={members} invitations={invitations} />
          </TabsContent>
        )}
      </div>
    </Tabs>
  );
}
