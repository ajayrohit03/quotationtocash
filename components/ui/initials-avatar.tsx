import { cn } from "@/lib/utils";

function initialsFrom(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

// A rounded-square initials badge — distinct from shadcn's circular
// Avatar, matching the original design export's own treatment for
// customer/business initials throughout the app chrome.
export function InitialsAvatar({
  name,
  size = "default",
  className,
}: {
  name: string;
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex flex-none items-center justify-center rounded-lg bg-muted font-semibold text-foreground/80",
        size === "sm" && "size-7 text-[11px]",
        size === "default" && "size-9 text-xs",
        size === "lg" && "size-[46px] text-[15px]",
        className,
      )}
    >
      {initialsFrom(name) || "?"}
    </span>
  );
}
