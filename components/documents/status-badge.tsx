import { Badge } from "@/components/ui/badge";

// Per-status color treatment lifted directly from the original design
// export's pill(status) function — the app's own status vocabulary is
// lowercase/underscored where the mockup used Title Case, but the colors
// map 1:1. "expired" has no mockup equivalent (never appeared in its demo
// data); grouped with "declined" since both are quotation dead-ends.
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: "#F3F4F7", text: "#565E72" },
  sent: { bg: "#EEF0FF", text: "#4338CA" },
  viewed: { bg: "#EFF6FF", text: "#1D4ED8" },
  accepted: { bg: "#ECFDF3", text: "#15803D" },
  paid: { bg: "#ECFDF3", text: "#15803D" },
  overdue: { bg: "#FEF3F2", text: "#B42318" },
  converted: { bg: "#F5F3FF", text: "#6D28D9" },
  declined: { bg: "#FEF3F2", text: "#B42318" },
  expired: { bg: "#FEF3F2", text: "#B42318" },
  partially_paid: { bg: "#FFFAEB", text: "#B45309" },
  cancelled: { bg: "#F3F4F7", text: "#8A92A6" },
};

function statusLabel(status: string): string {
  return status
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS.draft;
  return (
    <Badge
      variant="secondary"
      className={className}
      style={{ background: colors.bg, color: colors.text }}
    >
      {statusLabel(status)}
    </Badge>
  );
}
