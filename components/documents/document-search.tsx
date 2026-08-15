"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "viewed", label: "Viewed" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
  { value: "expired", label: "Expired" },
  { value: "converted", label: "Converted" },
  { value: "partially_paid", label: "Partially paid" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "cancelled", label: "Cancelled" },
];

export function DocumentSearch({
  basePath,
  defaultQuery,
  defaultStatus,
}: {
  basePath: string;
  defaultQuery: string;
  defaultStatus: string;
}) {
  const router = useRouter();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function navigate(next: { q?: string; status?: string }) {
    const params = new URLSearchParams();
    const q = next.q ?? defaultQuery;
    const status = next.status ?? defaultStatus;
    if (q.trim()) params.set("q", q.trim());
    if (status && status !== "all") params.set("status", status);
    router.replace(`${basePath}${params.size ? `?${params}` : ""}`);
  }

  function handleQueryChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => navigate({ q: value }), 300);
  }

  return (
    <div className="flex gap-3">
      <Input
        defaultValue={defaultQuery}
        onChange={handleQueryChange}
        placeholder="Search by number or customer…"
        className="max-w-sm"
      />
      <Select
        value={defaultStatus || "all"}
        onValueChange={(value) => value && navigate({ status: value })}
      >
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
