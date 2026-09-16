"use client";

import { useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import type { SettingsCustomFieldDefinition } from "./types";
import { AddCustomFieldDialog } from "./add-custom-field-dialog";
import { EditCustomFieldDialog } from "./edit-custom-field-dialog";
import { Button } from "@/components/ui/button";

const TYPE_LABEL = { text: "Text", number: "Number", date: "Date" } as const;
const APPLIES_TO_LABEL: Record<"both" | "quotation" | "invoice", string> = {
  both: "Quotations & invoices",
  quotation: "Quotations only",
  invoice: "Invoices only",
};

function Section({
  title,
  scope,
  definitions,
  readOnly,
  onAdded,
  onUpdated,
  onBusyChange,
  busyId,
}: {
  title: string;
  scope: "document" | "lineItem";
  definitions: SettingsCustomFieldDefinition[];
  readOnly: boolean;
  onAdded: (definition: SettingsCustomFieldDefinition) => void;
  onUpdated: (definition: SettingsCustomFieldDefinition) => void;
  onBusyChange: (id: string | null) => void;
  busyId: string | null;
}) {
  const active = definitions
    .filter((d) => d.scope === scope && d.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const archived = definitions.filter((d) => d.scope === scope && !d.isActive);
  const rows = [...active, ...archived];

  async function reorder(id: string, direction: "up" | "down") {
    onBusyChange(id);
    try {
      const response = await fetch(`/api/business/custom-fields/${id}/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't reorder. Try again.");
        return;
      }
      for (const definition of body.definitions as SettingsCustomFieldDefinition[]) {
        onUpdated(definition);
      }
    } finally {
      onBusyChange(null);
    }
  }

  async function toggleActive(definition: SettingsCustomFieldDefinition) {
    onBusyChange(definition.id);
    try {
      const response = await fetch(
        `/api/business/custom-fields/${definition.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !definition.isActive }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't save. Try again.");
        return;
      }
      onUpdated(body.definition as SettingsCustomFieldDefinition);
      toast.success(definition.isActive ? "Field archived" : "Field reactivated");
    } finally {
      onBusyChange(null);
    }
  }

  return (
    <div className="mt-6 first:mt-0">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{title}</div>
        {!readOnly && <AddCustomFieldDialog scope={scope} onAdded={onAdded} />}
      </div>

      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No fields yet.</p>
      ) : (
        <div className="mt-2 divide-y divide-border rounded-xl border border-border">
          {rows.map((definition, index) => {
            const busy = busyId === definition.id;
            const isFirstActive = definition.isActive && index === 0;
            const isLastActive =
              definition.isActive && index === active.length - 1;

            return (
              <div
                key={definition.id}
                className="flex flex-wrap items-center gap-3 p-4"
              >
                <div className="min-w-[140px] flex-1">
                  <div className="truncate text-sm font-medium">
                    {definition.label}
                    {!definition.isActive && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        Archived
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {TYPE_LABEL[definition.type]} ·{" "}
                    {APPLIES_TO_LABEL[definition.appliesTo ?? "both"]}
                  </div>
                </div>

                {!readOnly && (
                  <div className="ml-auto flex items-center gap-1.5">
                    {definition.isActive && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Move up"
                          disabled={busy || isFirstActive}
                          onClick={() => reorder(definition.id, "up")}
                        >
                          <ArrowUp className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Move down"
                          disabled={busy || isLastActive}
                          onClick={() => reorder(definition.id, "down")}
                        >
                          <ArrowDown className="size-3.5" />
                        </Button>
                        <EditCustomFieldDialog
                          definition={definition}
                          onUpdated={onUpdated}
                        />
                      </>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={definition.isActive ? "text-destructive" : ""}
                      disabled={busy}
                      onClick={() => toggleActive(definition)}
                    >
                      {definition.isActive ? "Archive" : "Reactivate"}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CustomFieldsTab({
  definitions: initialDefinitions,
  readOnly,
}: {
  definitions: SettingsCustomFieldDefinition[];
  readOnly: boolean;
}) {
  const [definitions, setDefinitions] = useState(initialDefinitions);
  const [busyId, setBusyId] = useState<string | null>(null);

  function handleAdded(definition: SettingsCustomFieldDefinition) {
    setDefinitions((prev) => [...prev, definition]);
  }

  function handleUpdated(updated: SettingsCustomFieldDefinition) {
    setDefinitions((prev) =>
      prev.map((d) => (d.id === updated.id ? updated : d)),
    );
  }

  return (
    <div>
      <div className="border-b border-border pb-4">
        <div className="text-base font-semibold">Custom fields</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Extra fields shown on quotations and invoices — a container
          number, a batch number, anything your documents need beyond the
          built-in ones. Archiving a field never changes documents that
          already used it.
        </p>
      </div>

      <Section
        title="Document fields"
        scope="document"
        definitions={definitions}
        readOnly={readOnly}
        onAdded={handleAdded}
        onUpdated={handleUpdated}
        onBusyChange={setBusyId}
        busyId={busyId}
      />
      <Section
        title="Line item fields"
        scope="lineItem"
        definitions={definitions}
        readOnly={readOnly}
        onAdded={handleAdded}
        onUpdated={handleUpdated}
        onBusyChange={setBusyId}
        busyId={busyId}
      />
    </div>
  );
}
