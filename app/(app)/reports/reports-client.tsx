"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PRESETS, resolvePreset, type PresetId } from "@/lib/reports/date-presets";
import {
  DEFAULT_STATUS_GROUPS,
  DEFAULT_TYPES,
  REPORT_COLUMNS,
  totalsByCurrency,
  type GstSummaryRow,
  type ReportDocumentType,
  type StatusGroup,
} from "@/lib/reports/gst-summary";

const HEAD_CLASS = "bg-muted/40 text-xs font-semibold tracking-wide whitespace-nowrap text-muted-foreground";

const STATUS_OPTIONS: { key: StatusGroup; label: string; hint: string }[] = [
  { key: "draft", label: "Include drafts", hint: "Off by default — drafts don't count for GST" },
  { key: "sent", label: "Include sent", hint: "Sent and viewed" },
  { key: "finalized", label: "Include finalized (TAX INVOICE)", hint: "Locked, not yet sent" },
  { key: "paid", label: "Include paid", hint: "Paid and partially paid" },
];

const TYPE_OPTIONS: { key: ReportDocumentType; label: string }[] = [
  { key: "invoice", label: "Invoices" },
  { key: "quotation", label: "Quotations" },
  { key: "proforma", label: "Proforma invoices" },
];

const IST_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const money = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function ReportsClient() {
  const [today] = useState(() => IST_DATE.format(new Date()));
  const [preset, setPreset] = useState<PresetId | "custom">("month");
  const [range, setRange] = useState(() => resolvePreset("month", IST_DATE.format(new Date())));
  const [statuses, setStatuses] = useState<StatusGroup[]>(DEFAULT_STATUS_GROUPS);
  const [types, setTypes] = useState<ReportDocumentType[]>(DEFAULT_TYPES);

  // The result is tagged with the query it answers, so "loading" is simply
  // "the latest result isn't for the current query" — no synchronous
  // setState inside the effect.
  const [result, setResult] = useState<{ key: string; rows: GstSummaryRow[] | null; error: string | null } | null>(null);

  const rangeValid = /^\d{4}-\d{2}-\d{2}$/.test(range.from) && /^\d{4}-\d{2}-\d{2}$/.test(range.to) && range.from <= range.to;
  const canQuery = rangeValid && statuses.length > 0 && types.length > 0;

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      from: range.from,
      to: range.to,
      statuses: statuses.join(","),
      types: types.join(","),
    });
    return params.toString();
  }, [range, statuses, types]);

  useEffect(() => {
    if (!canQuery) return;
    const controller = new AbortController();
    fetch(`/api/reports/gst-summary?${queryString}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? "Couldn't load the report.");
        setResult({ key: queryString, rows: body as GstSummaryRow[], error: null });
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setResult({
          key: queryString,
          rows: null,
          error: e instanceof Error ? e.message : "Couldn't load the report.",
        });
      });
    return () => controller.abort();
  }, [queryString, canQuery]);

  const current = canQuery && result?.key === queryString ? result : null;
  const loading = canQuery && current === null;
  const rows = current?.rows ?? null;
  const error = current?.error ?? null;

  const totals = useMemo(() => (rows ? totalsByCurrency(rows) : []), [rows]);
  const downloadsDisabled = !canQuery || loading || !!error || !rows || rows.length === 0;

  function downloadHref(format: "xlsx" | "csv") {
    return `/api/reports/gst-summary?${queryString}&format=${format}`;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 rounded-xl border border-border bg-card p-5 shadow-xs lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="report-type" className="mb-1.5 block text-xs font-semibold tracking-wide text-muted-foreground">
              REPORT
            </label>
            <select
              id="report-type"
              className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
              defaultValue="gst-summary"
            >
              <option value="gst-summary">GST Invoice Summary</option>
            </select>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground">DATE RANGE</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  size="sm"
                  variant={preset === p.id ? "default" : "outline"}
                  onClick={() => {
                    setPreset(p.id);
                    setRange(resolvePreset(p.id, today));
                  }}
                >
                  {p.label}
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                variant={preset === "custom" ? "default" : "outline"}
                onClick={() => setPreset("custom")}
              >
                Custom
              </Button>
            </div>
            {preset === "custom" ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <label htmlFor="report-from" className="text-muted-foreground">From</label>
                <Input
                  id="report-from"
                  type="date"
                  className="w-40"
                  value={range.from}
                  max={range.to || undefined}
                  onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                />
                <label htmlFor="report-to" className="text-muted-foreground">to</label>
                <Input
                  id="report-to"
                  type="date"
                  className="w-40"
                  value={range.to}
                  min={range.from || undefined}
                  onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                />
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {range.from} to {range.to}
              </p>
            )}
            {!rangeValid && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                Choose a valid range (From must not be after To).
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground">STATUS</legend>
            <div className="flex flex-col gap-2">
              {STATUS_OPTIONS.map((o) => (
                <label key={o.key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={statuses.includes(o.key)}
                    onCheckedChange={() => setStatuses((s) => toggle(s, o.key))}
                  />
                  <span>{o.label}</span>
                  <span className="text-xs text-muted-foreground">— {o.hint}</span>
                </label>
              ))}
              <p className="text-xs text-muted-foreground">Cancelled documents are always excluded.</p>
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground">DOCUMENT TYPE</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {TYPE_OPTIONS.map((o) => (
                <label key={o.key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={types.includes(o.key)}
                    onCheckedChange={() => setTypes((t) => toggle(t, o.key))}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {!canQuery
            ? "Select at least one status and one document type, and a valid date range."
            : loading
              ? "Loading…"
              : error
                ? ""
                : `${rows?.length ?? 0} document${rows?.length === 1 ? "" : "s"}`}
        </p>
        <div className="flex gap-2">
          {(["xlsx", "csv"] as const).map((format) =>
            downloadsDisabled ? (
              <Button key={format} type="button" variant="outline" disabled>
                <Download className="size-4" /> Download {format === "xlsx" ? "Excel" : "CSV"}
              </Button>
            ) : (
              <Button
                key={format}
                variant="outline"
                nativeButton={false}
                render={<a href={downloadHref(format)} download />}
              >
                <Download className="size-4" /> Download {format === "xlsx" ? "Excel" : "CSV"}
              </Button>
            ),
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {!error && canQuery && rows && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                {REPORT_COLUMNS.map((c) => (
                  <TableHead key={c.key} className={`${HEAD_CLASS} ${c.kind === "text" ? "" : "text-right"}`}>
                    {c.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={`${row.invoiceType}-${row.invoiceNumber}-${i}`}>
                  {REPORT_COLUMNS.map((c) => {
                    const value = row[c.key];
                    return (
                      <TableCell
                        key={c.key}
                        className={c.kind === "text" ? "whitespace-nowrap" : "text-right tabular-nums"}
                      >
                        {c.kind === "money" ? money(value as number) : value === null || value === "" ? "—" : value}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={REPORT_COLUMNS.length} className="py-10 text-center text-muted-foreground">
                    No documents match these filters.
                  </TableCell>
                </TableRow>
              )}
              {totals.map((t) => (
                <TableRow key={`total-${t.currency}`} className="bg-muted/30 font-semibold">
                  {REPORT_COLUMNS.map((c, i) => (
                    <TableCell key={c.key} className={c.kind === "money" ? "text-right tabular-nums" : "whitespace-nowrap"}>
                      {i === 0
                        ? `Total (${t.currency}) — ${t.count}`
                        : c.key === "currency"
                          ? t.currency
                          : c.kind === "money"
                            ? money(t[c.key as "taxableValue"])
                            : ""}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
