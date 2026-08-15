"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { Input } from "@/components/ui/input";

export function CustomerSearch({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (value.trim()) params.set("q", value.trim());
      router.replace(`/customers${params.size ? `?${params}` : ""}`);
    }, 300);
  }

  return (
    <Input
      defaultValue={defaultValue}
      onChange={handleChange}
      placeholder="Search customers…"
      className="max-w-sm"
    />
  );
}
