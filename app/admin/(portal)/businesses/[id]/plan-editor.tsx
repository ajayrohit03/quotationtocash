"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PLANS, type FeatureKey, type Plan } from "@/lib/plans/catalog";
import { featureEnabled } from "@/lib/plans/feature-enabled";

type OverrideState = "inherit" | "on" | "off";

const STATES: { value: OverrideState; label: string }[] = [
  { value: "inherit", label: "Inherit" },
  { value: "on", label: "Force on" },
  { value: "off", label: "Force off" },
];

export function PlanEditor({
  businessId,
  initialPlan,
  initialNote,
  initialOverrides,
  featureKeys,
}: {
  businessId: string;
  initialPlan: Plan;
  initialNote: string;
  initialOverrides: Record<string, boolean>;
  featureKeys: FeatureKey[];
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan>(initialPlan);
  const [note, setNote] = useState(initialNote);
  const [states, setStates] = useState<Record<string, OverrideState>>(() =>
    Object.fromEntries(
      featureKeys.map((k) => [k, k in initialOverrides ? (initialOverrides[k] ? "on" : "off") : "inherit"]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function buildOverrides(): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const k of featureKeys) {
      if (states[k] === "on") out[k] = true;
      else if (states[k] === "off") out[k] = false;
    }
    return out;
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    const overrides = buildOverrides();
    try {
      const res = await fetch(`/api/admin/businesses/${businessId}/plan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plan,
          note: note.trim() || null,
          planOverrides: Object.keys(overrides).length > 0 ? overrides : null,
        }),
      });
      if (res.ok) {
        setMessage({ ok: true, text: "Saved." });
        router.refresh();
      } else if (res.status === 401) {
        router.replace("/login");
      } else {
        const body = await res.json().catch(() => null);
        setMessage({ ok: false, text: body?.error ?? `Save failed (${res.status}).` });
      }
    } catch {
      setMessage({ ok: false, text: "Network error." });
    } finally {
      setBusy(false);
    }
  }

  const overrides = buildOverrides();

  return (
    <div className="mt-2 space-y-5">
      <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Plan</span>
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value as Plan)}
            className="w-full rounded-lg border border-white/15 bg-navy-mid px-3 py-2 capitalize"
          >
            {PLANS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Note (audit trail — why the plan / overrides were set)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={1000}
            className="w-full rounded-lg border border-white/15 bg-navy-mid px-3 py-2"
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-navy-mid text-xs text-slate-400 uppercase">
            <tr>
              <th className="px-4 py-2 font-medium">Feature</th>
              <th className="px-4 py-2 font-medium">Plan default</th>
              <th className="px-4 py-2 font-medium">Override</th>
              <th className="px-4 py-2 font-medium">Effective</th>
            </tr>
          </thead>
          <tbody>
            {featureKeys.map((k) => {
              const planDefault = featureEnabled({ plan, planOverrides: null }, k);
              const effective = featureEnabled({ plan, planOverrides: overrides }, k);
              return (
                <tr key={k} className="border-t border-white/5">
                  <td className="px-4 py-2 font-mono text-xs">{k}</td>
                  <td className="px-4 py-2 text-slate-400">{planDefault ? "on" : "off"}</td>
                  <td className="px-4 py-2">
                    <div role="radiogroup" aria-label={`Override for ${k}`} className="inline-flex overflow-hidden rounded-lg border border-white/15">
                      {STATES.map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          role="radio"
                          aria-checked={states[k] === s.value}
                          onClick={() => setStates((prev) => ({ ...prev, [k]: s.value }))}
                          className={
                            "px-2.5 py-1 text-xs " +
                            (states[k] === s.value
                              ? s.value === "on"
                                ? "bg-emerald-500/30 text-emerald-200"
                                : s.value === "off"
                                  ? "bg-red-500/30 text-red-200"
                                  : "bg-navy-light text-white"
                              : "text-slate-400 hover:bg-navy-light/50")
                          }
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className={"px-4 py-2 font-medium " + (effective ? "text-emerald-300" : "text-slate-500")}>
                    {effective ? "ON" : "OFF"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {message && (
          <p role="status" className={"text-sm " + (message.ok ? "text-emerald-300" : "text-red-400")}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
