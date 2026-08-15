import { prisma } from "@/lib/db/prisma";
import { requireBusinessForPage } from "@/lib/auth/page";
import { formatCurrency } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddProductDialog } from "./add-product-dialog";

export default async function ProductsPage() {
  const { business } = await requireBusinessForPage();

  const products = await prisma.product.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">
          Products &amp; services
        </h1>
        <AddProductDialog gstEnabled={business.gstEnabled} />
      </div>

      {products.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm font-medium">No products yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add products or services to select them quickly on quotations
            and invoices.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Price</TableHead>
                {business.gstEnabled && (
                  <TableHead className="text-right">GST rate</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {product.description || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {product.sku || "—"}
                  </TableCell>
                  <TableCell>{product.unit || "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(product.price)}
                  </TableCell>
                  {business.gstEnabled && (
                    <TableCell className="text-right font-mono text-sm">
                      {product.gstRate ? `${product.gstRate}%` : "—"}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
