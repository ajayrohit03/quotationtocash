import type { ReactNode } from "react";

export function StepShell({
  step,
  title,
  description,
  onSkip,
  children,
}: {
  step: number;
  title: string;
  description: string;
  onSkip?: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
          Step {step} of 4
        </span>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Skip for now
          </button>
        )}
      </div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-muted-foreground">{description}</p>
      <div className="mt-8">{children}</div>
    </div>
  );
}
