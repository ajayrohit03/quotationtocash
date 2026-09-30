"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { X } from "lucide-react";
import type { Job } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Dynamically imported — same rationale as CustomerPicker's own
// QuickAddCustomerDialog import (see that file's comment): only ever
// opened from "+ Add new job" below.
const QuickAddJobDialog = dynamic(() =>
  import("./quick-add-job-dialog").then((m) => m.QuickAddJobDialog),
);

// Unlike CustomerPicker, a Job link is always optional (design doc
// §5.3) — no document or purchase invoice requires one, so `selected`
// can be cleared back to null, not just changed to another job.
export function JobPicker({
  jobs,
  selected,
  onChange,
  onJobCreated,
  disabled = false,
}: {
  jobs: Job[];
  selected: Job | null;
  onChange: (job: Job | null) => void;
  onJobCreated: (job: Job) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter(
      (j) =>
        j.jobRef.toLowerCase().includes(q) ||
        j.description?.toLowerCase().includes(q),
    );
  }, [jobs, search]);

  return (
    <div>
      {selected ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/50 p-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{selected.jobRef}</p>
            {selected.description && (
              <p className="truncate text-sm text-muted-foreground">
                {selected.description}
              </p>
            )}
          </div>
          <Popover
            open={open}
            onOpenChange={(next) => !disabled && setOpen(next)}
          >
            <PopoverTrigger
              render={
                <button
                  type="button"
                  disabled={disabled}
                  className="text-sm font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
                />
              }
            >
              Change
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-0">
              <JobList
                jobs={filtered}
                search={search}
                onSearchChange={setSearch}
                onSelect={(job) => {
                  onChange(job);
                  setOpen(false);
                }}
                onAddNew={() => {
                  setOpen(false);
                  setAddOpen(true);
                }}
              />
            </PopoverContent>
          </Popover>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(null)}
            aria-label="Clear job"
            className="text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <Popover
          open={open}
          onOpenChange={(next) => !disabled && setOpen(next)}
        >
          <PopoverTrigger render={<Button variant="outline" disabled={disabled} />}>
            Select job (optional)
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-0">
            <JobList
              jobs={filtered}
              search={search}
              onSearchChange={setSearch}
              onSelect={(job) => {
                onChange(job);
                setOpen(false);
              }}
              onAddNew={() => {
                setOpen(false);
                setAddOpen(true);
              }}
            />
          </PopoverContent>
        </Popover>
      )}

      <QuickAddJobDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={(job) => {
          onJobCreated(job);
          onChange(job);
        }}
      />
    </div>
  );
}

function JobList({
  jobs,
  search,
  onSearchChange,
  onSelect,
  onAddNew,
}: {
  jobs: Job[];
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (job: Job) => void;
  onAddNew: () => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="p-2">
        <Input
          autoFocus
          placeholder="Search jobs…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <div className="max-h-64 overflow-y-auto p-1">
        {jobs.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            No jobs found
          </p>
        ) : (
          jobs.map((job) => (
            <button
              key={job.id}
              type="button"
              onClick={() => onSelect(job)}
              className="flex w-full flex-col rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              <span className="font-medium">{job.jobRef}</span>
              {job.description && (
                <span className="text-xs text-muted-foreground">
                  {job.description}
                </span>
              )}
            </button>
          ))
        )}
      </div>
      <div className="border-t border-border p-1">
        <button
          type="button"
          onClick={onAddNew}
          className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm font-medium text-primary hover:bg-muted"
        >
          + Add new job
        </button>
      </div>
    </div>
  );
}
