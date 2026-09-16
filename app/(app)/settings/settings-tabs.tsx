"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Building2, Percent, Landmark, FileText, ListPlus, Palette, CircleUser, Users } from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type {
  SettingsBusiness,
  SettingsMember,
  SettingsInvitation,
  SettingsCustomFieldDefinition,
} from "./types";

// Each tab is its own chunk, fetched only when actually selected — base-ui's
// Tabs.Panel doesn't keep inactive panels mounted (keepMounted defaults to
// false), so before this change every tab's code, including react-hook-form
// + zod-heavy ones like BusinessProfileTab and DocumentsTab, loaded and
// parsed up front regardless of which tab (if any) the user opened.
const BusinessProfileTab = dynamic(() =>
  import("./business-profile-tab").then((m) => m.BusinessProfileTab),
);
const TaxTab = dynamic(() => import("./tax-tab").then((m) => m.TaxTab));
const PaymentTab = dynamic(() =>
  import("./payment-tab").then((m) => m.PaymentTab),
);
const DocumentsTab = dynamic(() =>
  import("./documents-tab").then((m) => m.DocumentsTab),
);
const CustomFieldsTab = dynamic(() =>
  import("./custom-fields-tab").then((m) => m.CustomFieldsTab),
);
const AppearanceTab = dynamic(() =>
  import("./appearance-tab").then((m) => m.AppearanceTab),
);
const AccountTab = dynamic(() =>
  import("./account-tab").then((m) => m.AccountTab),
);
const TeamTab = dynamic(() => import("./team-tab").then((m) => m.TeamTab));

const BASE_TABS = [
  { value: "business", label: "Business profile", icon: Building2 },
  { value: "tax", label: "Tax", icon: Percent },
  { value: "payment", label: "Payment details", icon: Landmark },
  { value: "documents", label: "Documents", icon: FileText },
];
const CUSTOM_FIELDS_TAB = {
  value: "custom-fields",
  label: "Custom fields",
  icon: ListPlus,
};
const REMAINING_TABS = [
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
  customFieldDefinitions,
}: {
  business: SettingsBusiness;
  isOwner: boolean;
  isAdmin: boolean;
  user: { name: string | null; email: string };
  members: SettingsMember[] | null;
  invitations: SettingsInvitation[] | null;
  customFieldDefinitions: SettingsCustomFieldDefinition[] | null;
}) {
  const [current, setCurrent] = useState(business);
  // Team management is Admin-delegable (isAdmin), same as Business
  // profile/Documents/Appearance — Tax stays owner-only below. The
  // underlying APIs 403 for anyone else, so the tab itself is only
  // offered when it'll actually work rather than rendering a form that's
  // guaranteed to fail on submit.
  const tabs = isAdmin
    ? [
        ...BASE_TABS,
        CUSTOM_FIELDS_TAB,
        ...REMAINING_TABS,
        ...(members && invitations
          ? [{ value: "team", label: "Team", icon: Users }]
          : []),
      ]
    : BASE_TABS.concat(REMAINING_TABS);

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
        <TabsContent value="payment">
          <PaymentTab business={current} readOnly={!isOwner} onUpdated={setCurrent} />
        </TabsContent>
        <TabsContent value="documents">
          <DocumentsTab
            business={current}
            readOnly={!isAdmin}
            onUpdated={setCurrent}
          />
        </TabsContent>
        {isAdmin && customFieldDefinitions && (
          <TabsContent value="custom-fields">
            <CustomFieldsTab definitions={customFieldDefinitions} readOnly={false} />
          </TabsContent>
        )}
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
