import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import {
  PurchaseInvoicePdf,
  type PurchaseInvoicePdfData,
} from "./purchase-invoice-pdf";

export async function renderPurchaseInvoicePdf(
  purchaseInvoice: PurchaseInvoicePdfData,
): Promise<Buffer> {
  return renderToBuffer(<PurchaseInvoicePdf purchaseInvoice={purchaseInvoice} />);
}
