"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function InternalToggle({ businessId, initial }: { businessId: string; initial: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !value;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/businesses/${businessId}/internal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isInternal: next }),
      });
      if (res.ok) {
        setValue(next);
        router.refresh();
      } else if (res.status === 401) {
        router.replace("/login");
      } else {
        setError(`Failed (${res.status}).`);
      }
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex items-center gap-3 text-sm">
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label="Internal business"
        disabled={busy}
        onClick={toggle}
        className={
          "relative h-5 w-9 rounded-full transition disabled:opacity-50 " + (value ? "bg-brand-green" : "bg-white/20")
        }
      >
        <span
          className={
            "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform " +
            (value ? "translate-x-4" : "")
          }
        />
      </button>
      <span>
        Internal business <span className="text-slate-400">— excluded from analytics</span>
      </span>
      {error && <span role="alert" className="text-red-400">{error}</span>}
    </div>
  );
}
