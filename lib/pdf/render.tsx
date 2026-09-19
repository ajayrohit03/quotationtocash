import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import type { PreviewDocument } from "@/components/documents/preview-types";
import { DocumentPdf } from "./document-pdf";

export async function renderDocumentPdf(
  document: PreviewDocument,
  gstEnabled: boolean,
): Promise<Buffer> {
  // react-pdf's <Image> needs a URI it can decode synchronously during
  // render, but QR encoding is async — generated here, once, before
  // DocumentPdf ever mounts, rather than inside it. See
  // lib/einvoice/buildIrpPayload.ts's own comment on why
  // document.einvoiceQrCode is never a real IRP-issued code yet.
  const qrCodeDataUrl = document.einvoiceQrCode
    ? await QRCode.toDataURL(document.einvoiceQrCode, { margin: 1 })
    : undefined;

  return renderToBuffer(
    <DocumentPdf document={document} gstEnabled={gstEnabled} qrCodeDataUrl={qrCodeDataUrl} />,
  );
}
