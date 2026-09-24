import { Suspense } from "react";
import { Package } from "lucide-react";
import dynamic from "next/dynamic";
import { prisma } from "@/lib/db/prisma";
import { requireBusinessForPage } from "@/lib/auth/page";
import { formatCurrency } from "@/lib/format";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { TutorialBanner } from "@/components/tutorial-banner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Dynamically imported — same rationale as the customers page's
// AddCustomerDialog (see that file's own comment): both are modals
// behind zod-based forms, never needed for the list's initial render.
const AddProductDialog = dynamic(() =>
  import("./add-product-dialog").then((m) => m.AddProductDialog),
);
const EditProductDialog = dynamic(() =>
  import("./edit-product-dialog").then((m) => m.EditProductDialog),
);

const HEAD_CLASS = "bg-muted/40 text-xs font-semibold tracking-wide text-muted-foreground";

export default async function ProductsPage() {
  // requireBusinessForPage() is the same fast auth+membership lookup
  // every page already pays for — kept synchronous here (rather than
  // behind Suspense like document-list-page.tsx's split) because the
  // header's own "Add product" button needs business.gstEnabled. Only
  // the actual product list query sits behind Suspense.
  const { business, user } = await requireBusinessForPage();

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">
          Products &amp; services
        </h1>
        <AddProductDialog gstEnabled={business.gstEnabled} />
      </div>

      <TutorialBanner
        tutorialKey="products"
        title="Save what you bill often."
        description="Add a product or service once here, then pull it into a document in one click instead of typing the same line item every time."
        initiallyDismissed={user.dismissedTutorials.includes("products")}
      />

      <Suspense fallback={<TableSkeleton />}>
        <ProductsContent businessId={business.id} gstEnabled={business.gstEnabled} />
      </Suspense>
    </div>
  );
}

async function ProductsContent({
  businessId,
  gstEnabled,
}: {
  businessId: string;
  gstEnabled: boolean;
}) {
  const products = await prisma.product.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      {products.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Package className="size-5" />
          </span>
          <p className="text-sm font-medium">No products yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add products or services to select them quickly on quotations
            and invoices.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={HEAD_CLASS}>Name</TableHead>
                <TableHead className={HEAD_CLASS}>Description</TableHead>
                <TableHead className={HEAD_CLASS}>SKU</TableHead>
                <TableHead className={HEAD_CLASS}>Unit</TableHead>
                <TableHead className={`${HEAD_CLASS} text-right`}>
                  Price
                </TableHead>
                {gstEnabled && (
                  <TableHead className={`${HEAD_CLASS} text-right`}>
                    GST rate
                  </TableHead>
                )}
                <TableHead className={`${HEAD_CLASS} text-right`}>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {product.description || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {product.sku || "—"}
                  </TableCell>
                  <TableCell>{product.unit || "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(product.price)}
                  </TableCell>
                  {gstEnabled && (
                    <TableCell className="text-right font-mono text-sm">
                      {product.gstRate ? `${product.gstRate}%` : "—"}
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <EditProductDialog product={product} gstEnabled={gstEnabled} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
