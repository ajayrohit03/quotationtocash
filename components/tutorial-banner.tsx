"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

// One reusable banner, used identically on every screen that has one —
// see each page for its `tutorialKey`/copy. Whether it shows at all is
// decided server-side (the caller passes `initiallyDismissed`, computed
// from the current user's dismissedTutorials before this ever renders),
// so there's no client-side flash-then-hide on first load. Dismissing
// hides it immediately and fires the PATCH in the background — no
// current way to bring a dismissed banner back (a future "reset help"
// affordance would need one, not built here).
export function TutorialBanner({
  tutorialKey,
  title,
  description,
  initiallyDismissed,
}: {
  tutorialKey: string;
  title: string;
  description: string;
  initiallyDismissed: boolean;
}) {
  const [dismissed, setDismissed] = useState(initiallyDismissed);

  if (dismissed) return null;

  async function handleDismiss() {
    setDismissed(true);
    try {
      await fetch("/api/user/dismiss-tutorial", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: tutorialKey }),
      });
    } catch {
      // Best-effort — worst case it just reappears next load.
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-muted/30 px-4 py-3">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{title}</span>{" "}
        {description}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="flex-none"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
