import Link from "next/link";
import {
  IndianRupee,
  Clock,
  CircleCheck,
  FileText,
  Receipt,
  Users,
  Package,
  Inbox,
} from "lucide-react";
import { requireBusinessForPage } from "@/lib/auth/page";
import {
  getDashboardMetrics,
  getRecentDocuments,
} from "@/lib/documents/aggregates";
import { formatDateIST } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { StatusBadge } from "@/components/documents/status-badge";
import { TutorialBanner } from "@/components/tutorial-banner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const QUICK_ACTIONS = [
  { href: "/quotations/new", label: "Create quotation", icon: FileText },
  { href: "/invoices/new", label: "Create invoice", icon: Receipt },
  { href: "/customers", label: "Add customer", icon: Users },
  { href: "/products", label: "Add product", icon: Package },
];

const HEAD_CLASS = "bg-muted/40 text-xs font-semibold tracking-wide text-muted-foreground";

export default async function DashboardPage() {
  const { business, user } = await requireBusinessForPage();

  const [metrics, recentDocuments] = await Promise.all([
    getDashboardMetrics(business.id),
    getRecentDocuments(business.id, 8),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Welcome to {business.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quotations, invoices, and revenue at a glance.
        </p>
      </div>

      <TutorialBanner
        tutorialKey="dashboard"
        title="Your business at a glance."
        description="Revenue, outstanding amounts, and your most recent quotations and invoices — everything else lives one click away in the sidebar."
        initiallyDismissed={user.dismissedTutorials.includes("dashboard")}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <CardTitle className="text-sm font-normal text-muted-foreground">
              Total revenue
            </CardTitle>
            <span className="flex size-8 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary">
              <IndianRupee className="size-4" />
            </span>
          </CardHeader>
          <CardContent className="font-mono text-2xl">
            {formatCurrency(metrics.totalRevenue)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <CardTitle className="text-sm font-normal text-muted-foreground">
              Outstanding
            </CardTitle>
            <span className="flex size-8 flex-none items-center justify-center rounded-lg bg-[#FFFAEB] text-[#B45309]">
              <Clock className="size-4" />
            </span>
          </CardHeader>
          <CardContent className="font-mono text-2xl">
            {formatCurrency(metrics.outstanding)}
            <p className="mt-1 font-sans text-xs font-normal text-muted-foreground">
              {metrics.overdueCount === 0
                ? "None overdue"
                : `${metrics.overdueCount} overdue`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <CardTitle className="text-sm font-normal text-muted-foreground">
              Paid
            </CardTitle>
            <span className="flex size-8 flex-none items-center justify-center rounded-lg bg-[#ECFDF3] text-[#15803D]">
              <CircleCheck className="size-4" />
            </span>
          </CardHeader>
          <CardContent className="font-mono text-2xl">
            {formatCurrency(metrics.paid)}
            <p className="mt-1 font-sans text-xs font-normal text-muted-foreground">
              Across {metrics.paidCount}{" "}
              {metrics.paidCount === 1 ? "invoice" : "invoices"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <CardTitle className="text-sm font-normal text-muted-foreground">
              Drafts
            </CardTitle>
            <span className="flex size-8 flex-none items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <FileText className="size-4" />
            </span>
          </CardHeader>
          <CardContent className="font-mono text-2xl">
            {metrics.draftCount}
            <p className="mt-1 font-sans text-xs font-normal text-muted-foreground">
              Not sent yet
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {QUICK_ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-sm shadow-xs transition-colors hover:border-foreground/20 hover:bg-muted/40"
          >
            <span className="flex size-8 flex-none items-center justify-center rounded-md bg-primary/10 text-primary">
              <action.icon className="size-4" />
            </span>
            <span className="font-medium">{action.label}</span>
          </Link>
        ))}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent documents</h2>
          <Link
            href="/invoices"
            className="text-sm font-medium text-primary hover:underline"
          >
            View all
          </Link>
        </div>
        {recentDocuments.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-border py-16 text-center">
            <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Inbox className="size-5" />
            </span>
            <p className="text-sm font-medium">No documents yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first quotation or invoice to see it here.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border shadow-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={HEAD_CLASS}>Number</TableHead>
                  <TableHead className={HEAD_CLASS}>Customer</TableHead>
                  <TableHead className={HEAD_CLASS}>Type</TableHead>
                  <TableHead className={HEAD_CLASS}>Date</TableHead>
                  <TableHead className={`${HEAD_CLASS} text-right`}>
                    Amount
                  </TableHead>
                  <TableHead className={HEAD_CLASS}>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentDocuments.map((doc) => (
                  <TableRow key={doc.id} className="cursor-pointer">
                    <TableCell className="p-0">
                      <Link
                        href={`/${doc.type === "quotation" ? "quotations" : "invoices"}/${doc.id}`}
                        className="block px-4 py-2.5 font-mono text-sm"
                      >
                        {doc.number}
                      </Link>
                    </TableCell>
                    <TableCell>{doc.customer.name}</TableCell>
                    <TableCell className="capitalize">{doc.type}</TableCell>
                    <TableCell>{formatDateIST(doc.issueDate)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(doc.total)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={doc.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
